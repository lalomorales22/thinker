import { useState } from 'react'
import { Home, Sparkles, Database, Boxes, MessageSquare, BarChart3, Swords, Smartphone, Feather, Settings as SettingsIcon, HelpCircle, Wifi, WifiOff } from 'lucide-react'
import { useStore, ViewType } from './store/useStore'
import { useLiveConnection } from './lib/hooks'
import { cn } from './lib/util'
import { Toaster } from './components/ui'
import { ThinkerMark, Wordmark } from './components/Brand'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsModal from './components/SettingsModal'
import Assistant from './components/Assistant'
import Onboarding from './components/Onboarding'

import HomeView from './views/Home'
import Train from './views/Train'
import Data from './views/Data'
import Models from './views/Models'
import Playground from './views/Playground'
import Analytics from './views/Analytics'
import Arena from './views/Arena'
import Voice from './views/Voice'
import ExportView from './views/Export'

const NAV: { id: ViewType; label: string; icon: any; hint: string }[] = [
  { id: 'home', label: 'Home', icon: Home, hint: 'Start here' },
  { id: 'train', label: 'Train', icon: Sparkles, hint: 'Fine-tune a model' },
  { id: 'data', label: 'Data', icon: Database, hint: 'Datasets & imports' },
  { id: 'models', label: 'Models', icon: Boxes, hint: 'Your trained models' },
  { id: 'playground', label: 'Playground', icon: MessageSquare, hint: 'Chat & compare' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, hint: 'Runs & metrics' },
  { id: 'arena', label: 'Arena', icon: Swords, hint: 'Multi-agent RL' },
  { id: 'voice', label: 'Voice', icon: Feather, hint: 'Write a character' },
  { id: 'export', label: 'Export', icon: Smartphone, hint: 'Run it on a phone' },
]

const VIEWS: Record<ViewType, () => JSX.Element> = {
  home: HomeView, train: Train, data: Data, models: Models,
  playground: Playground, analytics: Analytics, arena: Arena, voice: Voice, export: ExportView,
}

export default function App() {
  const { view, setView, seenWelcome } = useStore()
  const [showSettings, setShowSettings] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const connected = useLiveConnection()
  const Current = VIEWS[view]

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex overflow-hidden bg-canvas text-ink">
        {/* Sidebar */}
        <aside className="w-[236px] shrink-0 flex flex-col border-r border-line bg-paper">
          <div className="h-16 flex items-center gap-2.5 px-5 border-b border-line">
            <ThinkerMark />
            <div className="leading-tight">
              <Wordmark className="text-lg" />
              <div className="text-[11px] text-ink-mute -mt-0.5">fine-tune your own AI</div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV.map((item) => {
              const active = view === item.id
              return (
                <button key={item.id} onClick={() => setView(item.id)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors group',
                    active ? 'bg-orange-soft text-orange-ink' : 'text-ink-soft hover:bg-line-soft hover:text-ink')}>
                  <item.icon className={cn('w-[18px] h-[18px]', active ? 'text-orange' : 'text-ink-mute group-hover:text-ink-soft')} />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-orange" />}
                </button>
              )
            })}
          </nav>

          <div className="p-3 border-t border-line space-y-1">
            <button onClick={() => setShowAssistant(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-soft hover:bg-line-soft hover:text-ink transition-colors">
              <HelpCircle className="w-[18px] h-[18px] text-ink-mute" /> Ask the assistant
            </button>
            <button onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-soft hover:bg-line-soft hover:text-ink transition-colors">
              <SettingsIcon className="w-[18px] h-[18px] text-ink-mute" /> Settings
            </button>
            <div className="flex items-center gap-2 px-3 pt-2 text-[11px] text-ink-mute">
              {connected ? <Wifi className="w-3.5 h-3.5 text-orange" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connected ? 'Live' : 'Offline'}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-8 py-8">
            <Current />
          </div>
        </main>

        {showAssistant && <Assistant onClose={() => setShowAssistant(false)} onOpenSettings={() => { setShowAssistant(false); setShowSettings(true) }} />}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {!seenWelcome && <Onboarding onOpenSettings={() => setShowSettings(true)} />}
        <Toaster />
      </div>
    </ErrorBoundary>
  )
}
