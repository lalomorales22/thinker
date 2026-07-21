import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

// --- useAsync ---------------------------------------------------------------

export interface AsyncResult<T> {
  data: T | null
  loading: boolean
  /** A human-readable message, ready to render — not an Error object. */
  error: string | null
  /** Refetch now. Resolves when the request settles; never rejects. */
  reload: () => Promise<void>
}

/**
 * Run an async fetch and track its state.
 *
 * The callback is held in a ref, so an inline arrow (the usual call style,
 * `useAsync(() => api.datasets.list(), [dataVersion])`) does not retrigger the
 * fetch on every render — only `deps` and `reload()` do.
 */
export function useAsync<T = any>(fn: () => Promise<T>, deps: unknown[] = []): AsyncResult<T> {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const mounted = useRef(true)
  // Bumped per request so a slow earlier fetch can't overwrite a newer result.
  const seq = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const ticket = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const result = await fnRef.current()
      if (!mounted.current || ticket !== seq.current) return
      setData(result)
      setError(null)
    } catch (e: unknown) {
      if (!mounted.current || ticket !== seq.current) return
      setData(null)
      setError(e instanceof Error ? e.message : String(e ?? 'Something went wrong'))
    } finally {
      if (mounted.current && ticket === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload: run }
}

// --- useLiveConnection ------------------------------------------------------

/** http://host:8000 -> ws://host:8000/ws (and https -> wss). */
function wsUrl(backendUrl: string): string {
  try {
    const u = new URL(backendUrl)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/ws'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return 'ws://localhost:8000/ws'
  }
}

/**
 * Keep a WebSocket open to the backend event hub, feeding live training
 * progress into the store. Returns whether we are currently connected, which
 * drives the Live/Offline indicator in the sidebar.
 *
 * Reconnects automatically with a capped backoff, so starting the backend
 * after the UI recovers on its own.
 */
export function useLiveConnection(): boolean {
  const backendUrl = useStore((s) => s.backendUrl)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let closed = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let ping: ReturnType<typeof setInterval> | null = null
    let attempt = 0

    const { applyJobEvent, bump } = useStore.getState()

    function connect() {
      if (closed) return

      try {
        socket = new WebSocket(wsUrl(backendUrl))
      } catch {
        scheduleRetry()
        return
      }

      socket.onopen = () => {
        if (closed) return
        attempt = 0
        setConnected(true)
        // The server reads from the socket in a loop; a periodic ping keeps
        // proxies from closing an otherwise-idle connection.
        ping = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send('ping')
        }, 25_000)
      }

      socket.onmessage = (ev) => {
        if (closed) return
        let msg: any
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        const { type, data } = msg ?? {}
        if (!type || !data) return

        if (type === 'job_progress') {
          applyJobEvent(data.job_id, {
            step: data.step,
            metrics: data.metrics,
            status_message: data.status_message,
          })
        } else if (type === 'job_status') {
          applyJobEvent(data.job_id, { status: data.status })
          // A run just reached a terminal state — let the lists refetch.
          bump()
        } else if (type === 'job_created' && data.id) {
          applyJobEvent(data.id, { status: data.status })
          bump()
        }
      }

      socket.onerror = () => {
        // `onclose` always follows, which is where reconnection is handled.
      }

      socket.onclose = () => {
        if (closed) return
        setConnected(false)
        if (ping) {
          clearInterval(ping)
          ping = null
        }
        scheduleRetry()
      }
    }

    function scheduleRetry() {
      if (closed || retry) return
      // 1s, 2s, 4s … capped at 15s.
      const delay = Math.min(1000 * 2 ** attempt, 15_000)
      attempt += 1
      retry = setTimeout(() => {
        retry = null
        connect()
      }, delay)
    }

    connect()

    return () => {
      closed = true
      setConnected(false)
      if (retry) clearTimeout(retry)
      if (ping) clearInterval(ping)
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      }
    }
  }, [backendUrl])

  return connected
}
