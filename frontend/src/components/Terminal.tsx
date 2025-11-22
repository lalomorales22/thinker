import { Terminal as TerminalIcon, X, Trash2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { terminalLogger, LogEntry } from '../services/terminalLogger'

export default function Terminal() {
  const [logs, setLogs] = useState<LogEntry[]>(terminalLogger.getLogs())
  const [autoScroll, setAutoScroll] = useState(true)
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Subscribe to new logs
    const unsubscribe = terminalLogger.subscribe((newLog) => {
      setLogs((prevLogs) => [...prevLogs, newLog])
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      case 'debug': return 'text-purple-400'
      default: return 'text-dark-text'
    }
  }

  const handleClear = () => {
    terminalLogger.clear()
    setLogs([])
  }

  const handleScroll = () => {
    if (!terminalRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10
    setAutoScroll(isAtBottom)
  }

  return (
    <div className="h-full flex flex-col bg-dark-surface">
      {/* Terminal Header */}
      <div className="h-10 border-b border-dark-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-brain-blue-500" />
          <span className="text-sm font-semibold">OUTPUT</span>
          <span className="led led-blue"></span>
          <span className="text-xs text-dark-text-secondary ml-2">
            {logs.length} logs
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1 hover:bg-dark-hover rounded transition-colors"
            onClick={handleClear}
            title="Clear terminal"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 font-mono text-sm"
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="text-dark-text-secondary italic">Terminal is empty. Waiting for messages...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="flex gap-3 mb-1 hover:bg-dark-hover/30 px-2 py-0.5 rounded">
              <span className="text-dark-text-secondary whitespace-nowrap">{log.timestamp}</span>
              {log.source && (
                <span className="text-brain-blue-500 whitespace-nowrap">[{log.source}]</span>
              )}
              <span className={getLogColor(log.type)}>{log.message}</span>
            </div>
          ))
        )}
      </div>

      {/* Command Input */}
      <div className="h-10 border-t border-dark-border flex items-center px-3 gap-2">
        <span className="text-brain-blue-500">$</span>
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-sm font-mono"
          placeholder="Type command (e.g., 'test message')..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value.trim()
              if (value) {
                // Log user commands
                terminalLogger.info(`> ${value}`, 'user')
                e.currentTarget.value = ''
              }
            }
          }}
        />
        {!autoScroll && (
          <span className="text-xs text-yellow-400 whitespace-nowrap">⚠ Scroll paused</span>
        )}
      </div>
    </div>
  )
}
