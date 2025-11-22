import { useState } from 'react'
import {
  Brain,
  Settings,
  Zap,
  Package,
  Database,
  MessageSquare,
  BarChart3,
  Terminal as TerminalIcon,
  Bot,
  X,
  Minimize2
} from 'lucide-react'
import { useStore } from './store/useStore'
import SettingsModal from './components/SettingsModal'
import TrainingDashboard from './views/TrainingDashboard'
import ModelsLibrary from './views/ModelsLibrary'
import DatasetManager from './views/DatasetManager'
import Playground from './views/Playground'
import Analytics from './views/Analytics'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showTerminal, setShowTerminal] = useState(true)
  const [showAssistant, setShowAssistant] = useState(true)
  const [terminalHeight] = useState(200)
  const [assistantWidth] = useState(320)
  const { currentView, setCurrentView } = useStore()

  const [terminalLogs] = useState([
    { type: 'system', text: '> Thinker v1.0.0 initialized', timestamp: '10:30:45' },
    { type: 'info', text: '> WebSocket connected to ws://localhost:8000', timestamp: '10:30:46' },
    { type: 'success', text: '> Tinker SDK ready', timestamp: '10:30:47' },
    { type: 'prompt', text: '>', timestamp: '10:30:48' }
  ])

  const views = [
    { id: 'training' as const, icon: Zap, label: 'Training', component: TrainingDashboard, led: 'cyan' },
    { id: 'models' as const, icon: Package, label: 'Models', component: ModelsLibrary, led: 'purple' },
    { id: 'datasets' as const, icon: Database, label: 'Datasets', component: DatasetManager, led: 'teal' },
    { id: 'playground' as const, icon: MessageSquare, label: 'Playground', component: Playground, led: 'blue' },
    { id: 'analytics' as const, icon: BarChart3, label: 'Analytics', component: Analytics, led: 'emerald' },
  ]

  const CurrentViewComponent = views.find(v => v.id === currentView)?.component || TrainingDashboard
  const currentViewData = views.find(v => v.id === currentView)

  return (
    <div className="h-screen w-screen flex flex-col bg-obsidian-bg text-tactical-text-primary overflow-hidden">
      {/* Top Bar - Tactical Header */}
      <div className="h-11 bg-obsidian-surface/80 backdrop-blur-tactical border-b border-obsidian-border flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-tactical-primary text-glow-cyan" />
          <span className="font-display font-semibold text-base tracking-wide">THINKER</span>
          <span className="led led-cyan"></span>
          <span className="text-xs text-tactical-text-muted font-mono">v1.0.0</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`led led-${currentViewData?.led || 'cyan'}`}></span>
            <span className="text-xs text-tactical-text-secondary uppercase tracking-wider">
              {currentViewData?.label}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="btn btn-ghost btn-xs p-1.5"
              onClick={() => setShowAssistant(!showAssistant)}
              title="Toggle AI Assistant"
            >
              <Bot className="w-4 h-4" />
            </button>
            <button
              className="btn btn-ghost btn-xs p-1.5"
              onClick={() => setShowTerminal(!showTerminal)}
              title="Toggle Terminal"
            >
              <TerminalIcon className="w-4 h-4" />
            </button>
            <button
              className="btn btn-ghost btn-xs p-1.5"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Layout - IDE Style */}
      <div className="flex-1 flex overflow-hidden">
        {/* Far Left Icon Sidebar */}
        <div className="w-14 bg-obsidian-surface/50 backdrop-blur-tactical border-r border-obsidian-border flex flex-col items-center gap-3 py-4">
          {views.map((view) => (
            <div key={view.id} className="relative group">
              <button
                className={`p-2.5 hover:bg-obsidian-hover rounded-tactical transition-all duration-200 ${
                  currentView === view.id ? 'bg-obsidian-elevated shadow-inner-glow' : ''
                }`}
                title={view.label}
                onClick={() => setCurrentView(view.id)}
              >
                <view.icon
                  className={`w-5 h-5 transition-colors ${
                    currentView === view.id ? `text-led-${view.led}` : 'text-tactical-text-muted'
                  }`}
                />
                {currentView === view.id && (
                  <div className="absolute left-0 top-0 w-1 h-full bg-tactical-primary rounded-r"></div>
                )}
              </button>
              <span className={`led led-${view.led} absolute -top-0.5 -right-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}></span>
            </div>
          ))}
        </div>

        {/* Main Content + Right Sidebar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden">
              <CurrentViewComponent />
            </div>

            {/* Right Sidebar - AI Assistant */}
            {showAssistant && (
              <div
                className="bg-obsidian-surface/80 backdrop-blur-tactical border-l border-obsidian-border flex flex-col"
                style={{ width: `${assistantWidth}px` }}
              >
                <div className="tactical-panel-header">
                  <div className="flex items-center gap-2">
                    <span className="led led-purple"></span>
                    <span className="text-xs font-semibold uppercase tracking-wider">AI Assistant</span>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs p-1"
                    onClick={() => setShowAssistant(false)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* AI Assistant Content */}
                  <div className="tactical-widget-glow">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="led led-purple"></span>
                      <span className="text-xs font-semibold text-tactical-text-secondary">SYSTEM STATUS</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-tactical-text-muted">API Connection</span>
                        <span className="text-led-green">READY</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-tactical-text-muted">Models Loaded</span>
                        <span className="text-tactical-text-primary">0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-tactical-text-muted">Active Jobs</span>
                        <span className="text-tactical-text-primary">0</span>
                      </div>
                    </div>
                  </div>

                  <div className="tactical-panel p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="led led-cyan"></span>
                      <span className="text-xs font-semibold text-tactical-text-secondary">QUICK ACTIONS</span>
                    </div>
                    <div className="space-y-2">
                      <button
                        className={`w-full btn ${currentView === 'training' ? 'btn-primary' : 'btn-ghost'} btn-xs text-left justify-start`}
                        onClick={() => setCurrentView('training')}
                      >
                        <Zap className="w-3 h-3 mr-2" />
                        New Training Job
                      </button>
                      <button
                        className={`w-full btn ${currentView === 'datasets' ? 'btn-primary' : 'btn-ghost'} btn-xs text-left justify-start`}
                        onClick={() => setCurrentView('datasets')}
                      >
                        <Database className="w-3 h-3 mr-2" />
                        Upload Dataset
                      </button>
                      <button
                        className={`w-full btn ${currentView === 'models' ? 'btn-primary' : 'btn-ghost'} btn-xs text-left justify-start`}
                        onClick={() => setCurrentView('models')}
                      >
                        <Package className="w-3 h-3 mr-2" />
                        Browse Models
                      </button>
                    </div>
                  </div>

                  <div className="tactical-panel p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="led led-teal"></span>
                      <span className="text-xs font-semibold text-tactical-text-secondary">RECENT ACTIVITY</span>
                    </div>
                    <div className="text-xs text-tactical-text-muted text-center py-4">
                      No recent activity
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Terminal Panel */}
          {showTerminal && (
            <div
              className="border-t border-obsidian-border bg-obsidian-surface/90 backdrop-blur-tactical flex flex-col"
              style={{ height: `${terminalHeight}px` }}
            >
              <div className="tactical-panel-header cursor-ns-resize">
                <div className="flex items-center gap-2">
                  <span className="led led-green"></span>
                  <span className="text-xs font-semibold uppercase tracking-wider">Terminal</span>
                  <span className="text-xs text-tactical-text-muted font-mono">localhost:8000</span>
                </div>
                <div className="flex items-center gap-1">
                  <button className="btn btn-ghost btn-xs p-1">
                    <Minimize2 className="w-3 h-3" />
                  </button>
                  <button
                    className="btn btn-ghost btn-xs p-1"
                    onClick={() => setShowTerminal(false)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 font-mono text-xs bg-black/40">
                {terminalLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    <span className="text-tactical-text-muted">[{log.timestamp}]</span>{' '}
                    <span className={
                      log.type === 'system' ? 'text-led-cyan' :
                      log.type === 'info' ? 'text-led-blue' :
                      log.type === 'success' ? 'text-led-green' :
                      log.type === 'error' ? 'text-led-red' :
                      'text-tactical-text-primary'
                    }>
                      {log.text}
                    </span>
                  </div>
                ))}
                <div className="flex items-center mt-1">
                  <span className="text-led-cyan mr-2">❯</span>
                  <span className="animate-pulse">_</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

export default App
