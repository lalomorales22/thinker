import { create } from 'zustand'

export type ViewType = 'home' | 'train' | 'data' | 'models' | 'playground' | 'analytics' | 'arena' | 'export'

const ls = (k: string, d = '') => localStorage.getItem(k) ?? d
const save = (k: string, v: string) => localStorage.setItem(k, v)

export interface LiveJob {
  step?: number
  status?: string
  status_message?: string
  metrics?: any
}

interface Store {
  // navigation
  view: ViewType
  setView: (v: ViewType) => void

  // settings (persisted)
  apiKey: string
  setApiKey: (v: string) => void
  backendUrl: string
  setBackendUrl: (v: string) => void
  ollamaModel: string
  setOllamaModel: (v: string) => void
  seenWelcome: boolean
  setSeenWelcome: (v: boolean) => void

  // assistant -> Train handoff ("Use these settings")
  pendingConfig: any | null
  setPendingConfig: (c: any | null) => void

  // cross-view refresh bus: bump() to tell lists to refetch
  dataVersion: number
  bump: () => void

  // live job updates from WebSocket
  liveJobs: Record<string, LiveJob>
  applyJobEvent: (jobId: string, patch: LiveJob) => void

  // Bumped every time the live socket (re)connects. Views that failed while the
  // backend was down watch this so they can refetch once it is back.
  connectionEpoch: number
  markConnected: () => void
}

export const useStore = create<Store>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),

  apiKey: ls('tinker_api_key'),
  setApiKey: (v) => { save('tinker_api_key', v); set({ apiKey: v }) },
  backendUrl: ls('backend_url', 'http://localhost:8000'),
  setBackendUrl: (v) => { save('backend_url', v); set({ backendUrl: v }) },
  ollamaModel: ls('ollama_model', ''),
  setOllamaModel: (v) => { save('ollama_model', v); set({ ollamaModel: v }) },
  seenWelcome: ls('seen_welcome') === '1',
  setSeenWelcome: (v) => { save('seen_welcome', v ? '1' : '0'); set({ seenWelcome: v }) },

  pendingConfig: null,
  setPendingConfig: (pendingConfig) => set({ pendingConfig }),

  dataVersion: 0,
  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  liveJobs: {},
  applyJobEvent: (jobId, patch) => set((s) => ({
    liveJobs: { ...s.liveJobs, [jobId]: { ...s.liveJobs[jobId], ...patch } },
  })),

  connectionEpoch: 0,
  markConnected: () => set((s) => ({ connectionEpoch: s.connectionEpoch + 1 })),
}))
