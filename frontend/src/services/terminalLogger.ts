// Terminal Logger Service
// Centralized logging service for capturing all app messages

export interface LogEntry {
  timestamp: string
  type: 'info' | 'success' | 'warning' | 'error' | 'debug'
  message: string
  source?: string
}

type LogListener = (log: LogEntry) => void

class TerminalLogger {
  private listeners: Set<LogListener> = new Set()
  private logs: LogEntry[] = []
  private maxLogs = 500 // Keep last 500 logs

  constructor() {
    // Intercept console methods
    this.interceptConsole()
  }

  private interceptConsole() {
    const originalConsoleLog = console.log
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn
    const originalConsoleDebug = console.debug
    const originalConsoleInfo = console.info

    console.log = (...args: any[]) => {
      originalConsoleLog.apply(console, args)
      this.log('info', this.formatArgs(args), 'console')
    }

    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args)
      this.log('error', this.formatArgs(args), 'console')
    }

    console.warn = (...args: any[]) => {
      originalConsoleWarn.apply(console, args)
      this.log('warning', this.formatArgs(args), 'console')
    }

    console.debug = (...args: any[]) => {
      originalConsoleDebug.apply(console, args)
      this.log('debug', this.formatArgs(args), 'console')
    }

    console.info = (...args: any[]) => {
      originalConsoleInfo.apply(console, args)
      this.log('info', this.formatArgs(args), 'console')
    }
  }

  private formatArgs(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch (e) {
          return String(arg)
        }
      }
      return String(arg)
    }).join(' ')
  }

  log(type: LogEntry['type'], message: string, source?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      source
    }

    this.logs.push(entry)

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Notify all listeners
    this.listeners.forEach(listener => listener(entry))
  }

  // Public logging methods
  info(message: string, source?: string) {
    this.log('info', message, source)
  }

  success(message: string, source?: string) {
    this.log('success', message, source)
  }

  warning(message: string, source?: string) {
    this.log('warning', message, source)
  }

  error(message: string, source?: string) {
    this.log('error', message, source)
  }

  debug(message: string, source?: string) {
    this.log('debug', message, source)
  }

  // Subscribe to new logs
  subscribe(listener: LogListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Get all logs
  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  // Clear all logs
  clear() {
    this.logs = []
    this.listeners.forEach(listener =>
      listener({
        timestamp: new Date().toLocaleTimeString(),
        type: 'info',
        message: 'Terminal cleared'
      })
    )
  }
}

// Export singleton instance
export const terminalLogger = new TerminalLogger()

// Initial system messages
terminalLogger.info('🧠 Thinker initialized', 'system')
terminalLogger.success('Terminal logging service active', 'system')
