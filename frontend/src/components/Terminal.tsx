import { Terminal as TerminalIcon, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'warning' | 'error'
  message: string
}

export default function Terminal() {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: '🧠 Thinker initialized'
    },
    {
      timestamp: new Date().toLocaleTimeString(),
      type: 'success',
      message: 'Connected to backend at http://localhost:8000'
    },
    {
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Waiting for Tinker API key...'
    },
    {
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Ready to start training!'
    }
  ])

  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'text-green-400'
      case 'warning': return 'text-yellow-400'
      case 'error': return 'text-red-400'
      default: return 'text-dark-text'
    }
  }

  return (
    <div className="h-full flex flex-col bg-dark-surface">
      {/* Terminal Header */}
      <div className="h-10 border-b border-dark-border flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-brain-blue-500" />
          <span className="text-sm font-semibold">OUTPUT</span>
          <span className="led led-blue"></span>
        </div>
        <button className="p-1 hover:bg-dark-hover rounded transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 font-mono text-sm"
      >
        {logs.map((log, idx) => (
          <div key={idx} className="flex gap-3 mb-1">
            <span className="text-dark-text-secondary">{log.timestamp}</span>
            <span className={getLogColor(log.type)}>{log.message}</span>
          </div>
        ))}
      </div>

      {/* Command Input */}
      <div className="h-10 border-t border-dark-border flex items-center px-3 gap-2">
        <span className="text-brain-blue-500">$</span>
        <input
          type="text"
          className="flex-1 bg-transparent outline-none text-sm font-mono"
          placeholder="Type command..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = e.currentTarget.value
              if (value) {
                setLogs([...logs, {
                  timestamp: new Date().toLocaleTimeString(),
                  type: 'info',
                  message: `> ${value}`
                }])
                e.currentTarget.value = ''
              }
            }
          }}
        />
      </div>
    </div>
  )
}
