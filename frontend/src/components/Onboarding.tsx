import { Database, Sparkles, MessageSquare, KeyRound, Compass, ArrowRight } from 'lucide-react'
import { Badge, Button } from './ui'
import { useStore } from '../store/useStore'
import { ThinkerMark } from './Brand'

// The same three moves you'll see on Home — a calm, honest promise of what's ahead.
const STEPS: { icon: typeof Database; title: string; desc: string }[] = [
  { icon: Database, title: 'Add data', desc: 'A file, a Hugging Face set, or a template. A few good examples is enough.' },
  { icon: Sparkles, title: 'Train', desc: 'Pick a model and press start. Sensible defaults, every setting explained.' },
  { icon: MessageSquare, title: 'Try it', desc: 'Chat with your model and compare it against the original.' },
]

export default function Onboarding({ onOpenSettings }: { onOpenSettings: () => void }) {
  const setSeenWelcome = useStore((s) => s.setSeenWelcome)
  const setView = useStore((s) => s.setView)

  const addKey = () => {
    setSeenWelcome(true)
    onOpenSettings()
  }
  const tryDemo = () => {
    setSeenWelcome(true)
    setView('train')
  }
  const skip = () => setSeenWelcome(true)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      {/* Dim backdrop — clicking it just skips, same as the Skip button. */}
      <div className="absolute inset-0 bg-charcoal/45 backdrop-blur-sm" onClick={skip} />

      <div className="relative card shadow-pop w-full max-w-xl animate-fade-up overflow-hidden">
        <div className="card-pad sm:p-8">
          {/* Welcome */}
          <div className="inline-flex items-center gap-2 mb-5">
            <ThinkerMark size={22} />
            <Badge tone="orange">Welcome to Thinker</Badge>
          </div>

          <h1 id="welcome-title" className="font-display font-extrabold tracking-tight leading-[1.05] text-3xl sm:text-4xl text-ink">
            Teach an open model to <span className="text-orange">sound like you</span>
          </h1>
          <p className="mt-3 text-ink-soft">
            Thinker fine-tunes an open language model on your data and style — no machine-learning
            background needed. We'll walk you through every step in plain English.
          </p>

          {/* How it works — three calm steps, mirroring Home */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl2 border border-line bg-raised p-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-orange-soft text-orange-ink flex items-center justify-center shrink-0">
                    <s.icon className="w-[18px] h-[18px]" />
                  </div>
                  <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-ink-mute">
                    {`0${i + 1}`}
                  </span>
                </div>
                <div className="font-display font-bold text-ink mt-3">{s.title}</div>
                <p className="text-xs text-ink-soft mt-1 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Demo-mode reassurance */}
          <p className="mt-5 flex items-start gap-2 text-sm text-ink-mute">
            <Compass className="w-4 h-4 text-orange shrink-0 mt-0.5" />
            <span>
              No key yet? <span className="font-semibold text-ink">Demo mode</span> runs a realistic
              practice fine-tune with no key and no cost — a perfect place to start.
            </span>
          </p>

          {/* CTAs */}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="flex-1" onClick={addKey} icon={<KeyRound className="w-[18px] h-[18px]" />}>
              Add my Tinker key
            </Button>
            <Button size="lg" variant="outline" className="flex-1" onClick={tryDemo} icon={<ArrowRight className="w-[18px] h-[18px]" />}>
              Explore in demo mode
            </Button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={skip}
              className="text-sm text-ink-mute hover:text-ink transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 px-2 py-1"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
