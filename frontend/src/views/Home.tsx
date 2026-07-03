import { Fragment } from 'react'
import { Database, Sparkles, MessageSquare, ChevronRight, ArrowRight, KeyRound, Compass } from 'lucide-react'
import { Card, Button, Badge, Stat, Dot, EmptyState, Skeleton } from '../components/ui'
import { api, Job } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore, ViewType } from '../store/useStore'
import { TRAINING_TYPES, statusStyle, relTime, cn } from '../lib/util'
import { ThinkerMark } from '../components/Brand'

// --- Shapes returned by api.analytics.overview() ----------------------------
interface OverviewCard { label: string; value: number | string; hint?: string }
interface Overview { cards: OverviewCard[]; by_status?: Record<string, number> }

// The 3-step teaching sequence — this is a real order, so it's numbered.
const STEPS: { n: string; icon: typeof Database; title: string; desc: string; view: ViewType; cta: string; primary?: boolean }[] = [
  { n: '01', icon: Database, title: 'Add your data', view: 'data', cta: 'Add data', primary: true,
    desc: 'Upload a file, import one from Hugging Face, or start from a template. Even a few good examples go a long way.' },
  { n: '02', icon: Sparkles, title: 'Train it', view: 'train', cta: 'Start training',
    desc: 'Pick a base model and press start. Thinker sets sensible defaults and explains every setting in plain English.' },
  { n: '03', icon: MessageSquare, title: 'Try it out', view: 'playground', cta: 'Open playground',
    desc: 'Chat with your new model and compare it side by side with the original to see exactly what changed.' },
]

function numeric(v: number | string): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export default function Home() {
  const setView = useStore((s) => s.setView)
  const apiKey = useStore((s) => s.apiKey)
  const dataVersion = useStore((s) => s.dataVersion)

  const overview = useAsync<Overview>(() => api.analytics.overview(), [dataVersion])
  const jobsReq = useAsync(() => api.training.jobs(), [dataVersion])

  const cards = (overview.data?.cards ?? []).slice(0, 4)
  const allZero = cards.length > 0 && cards.every((c) => numeric(c.value) === 0)

  const jobs: Job[] = [...(jobsReq.data?.jobs ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4)

  return (
    <div className="space-y-10">
      {/* --- Hero: the one bold moment ------------------------------------ */}
      <section className="relative overflow-hidden card border-line-strong px-7 py-12 sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 hidden sm:block opacity-[0.06]">
          <svg width="360" height="360" viewBox="0 0 32 32" fill="none">
            <path d="M6 9 C 11 9, 12 21, 17 21 S 24 12, 26 12" stroke="#FF6B1A" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
        </div>
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 mb-6">
            <ThinkerMark size={22} />
            <Badge tone="orange">Fine-tuning, made friendly</Badge>
          </div>
          <h1 className="font-display font-extrabold tracking-tight leading-[1.03] text-5xl sm:text-6xl text-ink">
            Fine-tune your <span className="text-orange">own AI</span>
          </h1>
          <p className="mt-5 text-lg text-ink-soft max-w-xl">
            Thinker teaches an open language model your data, your voice, and your style — so it answers the way you would.
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-mute">
            <Compass className="w-4 h-4 text-orange shrink-0" />
            New to this? Every setting has a plain-English explainer, and Demo mode lets you try the whole thing for free.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => setView('data')} icon={<Database className="w-[18px] h-[18px]" />}>
              Add your first data
            </Button>
            <Button size="lg" variant="outline" onClick={() => setView('models')} icon={<Compass className="w-[18px] h-[18px]" />}>
              Look around
            </Button>
          </div>
        </div>
      </section>

      {/* --- Gentle Demo-mode note when there's no key ------------------- */}
      {!apiKey && (
        <div className="card card-pad flex items-start gap-4 bg-orange-soft/50 border-orange/25">
          <div className="w-10 h-10 rounded-xl bg-paper text-orange-ink flex items-center justify-center shrink-0 shadow-card">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display font-bold text-ink">You're exploring in Demo mode</div>
            <p className="text-sm text-ink-soft mt-1">
              Look around freely and run a realistic practice fine-tune — no key, no cost. When you're ready to train for
              real, add your Tinker API key from <span className="font-semibold text-ink">Settings</span> in the bottom-left.
            </p>
          </div>
        </div>
      )}

      {/* --- Teach a model in 3 steps ------------------------------------ */}
      <section>
        <div className="mb-5">
          <h2 className="font-display font-bold text-2xl text-ink">Teach a model in 3 steps</h2>
          <p className="text-sm text-ink-soft mt-1">Do them in order — each one takes just a few minutes.</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-stretch gap-3">
          {STEPS.map((s, i) => (
            <Fragment key={s.n}>
              <Card hover className="flex-1 card-pad flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-xl bg-orange-soft text-orange-ink flex items-center justify-center">
                    <s.icon className="w-[22px] h-[22px]" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-[0.2em] text-ink-mute">{s.n}</span>
                </div>
                <h3 className="font-display font-bold text-lg text-ink mt-4">{s.title}</h3>
                <p className="text-sm text-ink-soft mt-1.5 flex-1">{s.desc}</p>
                <Button
                  variant={s.primary ? 'primary' : 'outline'}
                  onClick={() => setView(s.view)}
                  className="mt-5 w-full"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  {s.cta}
                </Button>
              </Card>
              {i < STEPS.length - 1 && (
                <div aria-hidden className="hidden md:flex items-center text-ink-mute">
                  <ChevronRight className="w-5 h-5" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </section>

      {/* --- At a glance: real numbers from analytics -------------------- */}
      <section>
        <h2 className="font-display font-bold text-2xl text-ink mb-5">Your studio at a glance</h2>
        {overview.loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="card card-pad">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16 mt-3" />
              </div>
            ))}
          </div>
        ) : overview.error ? (
          <Card className="card-pad">
            <p className="text-sm text-berry">Couldn't load your stats — {overview.error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => overview.reload()}>Try again</Button>
          </Card>
        ) : allZero || cards.length === 0 ? (
          <Card className="card-pad">
            <EmptyState
              icon={<Sparkles className="w-6 h-6" />}
              title="No models yet"
              description="Your studio is a blank canvas. Start by adding a little data, then train your first model."
              action={<Button onClick={() => setView('data')} icon={<Database className="w-[18px] h-[18px]" />}>Add data</Button>}
            />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c, i) => (
              <Stat key={c.label} label={c.label} value={c.value} hint={c.hint} accent={i === 0} />
            ))}
          </div>
        )}
      </section>

      {/* --- Recent activity -------------------------------------------- */}
      <section>
        <h2 className="font-display font-bold text-2xl text-ink mb-5">Recent activity</h2>
        <Card className="p-2">
          {jobsReq.loading ? (
            <div className="p-2 space-y-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24 mt-2" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : jobsReq.error ? (
            <div className="p-5">
              <p className="text-sm text-berry">Couldn't load recent runs — {jobsReq.error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => jobsReq.reload()}>Try again</Button>
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-6 h-6" />}
              title="Nothing here yet"
              description="Your training runs will show up here. Add some data and start your first one."
              action={<Button onClick={() => setView('train')} icon={<Sparkles className="w-[18px] h-[18px]" />}>Train a model</Button>}
            />
          ) : (
            <ul className="divide-y divide-line">
              {jobs.map((job) => {
                const st = statusStyle(job.status)
                const tt = TRAINING_TYPES[job.kind]
                return (
                  <li key={job.id}>
                    <button
                      onClick={() => setView('analytics')}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-left hover:bg-line-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                    >
                      <Dot className={cn('shrink-0', st.dot)} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-ink truncate">{job.name || 'Untitled run'}</div>
                        <div className="text-xs text-ink-mute mt-0.5">
                          {st.label}{job.created_at && ` · ${relTime(job.created_at)}`}
                        </div>
                      </div>
                      {tt ? (
                        <span className={cn('badge shrink-0', tt.accent)}>{tt.label}</span>
                      ) : (
                        <Badge tone="neutral">{job.kind}</Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-ink-mute shrink-0" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}
