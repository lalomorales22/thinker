import { useEffect, useMemo, useState } from 'react'
import { BarChart3, RefreshCw, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { cn, fmtInt, fmtNum, relTime, TRAINING_TYPES, statusStyle } from '../lib/util'
import { Card, Stat, Badge, Button, EmptyState, Skeleton, Spinner } from '../components/ui'
import { InfoTip } from '../lib/glossary'

// --- Shapes returned by the analytics endpoints ----------------------------
interface OverviewCard { label: string; value: string | number; hint?: string }
interface Overview { cards: OverviewCard[]; by_status: Record<string, number> }
interface Run {
  id: string
  name: string
  kind: string
  base_model: string
  dataset_id: string | null
  status: string
  steps: number
  total_steps: number
  loss: number | null
  mode: string | null
  duration: string
  created_at: string
}
interface SeriesPoint {
  step: number
  loss?: number | null
  reward_mean?: number | null
  reward_margin?: number | null
  [k: string]: any
}

// Chart palette (kept in sync with the studio design language).
const ORANGE = '#FF6B1A'
const CHARCOAL = '#211C16'
const GRID = '#EAE4DC'
const TICK = '#948B80'

const METRIC_TERM: Record<string, string> = { loss: 'loss', reward_mean: 'reward', reward_margin: 'reward_margin' }
const METRIC_LABEL: Record<string, string> = { loss: 'Loss', reward_mean: 'Reward (mean)', reward_margin: 'Reward margin' }

const KIND_TONE: Record<string, 'orange' | 'dark' | 'amber' | 'berry'> = {
  sl: 'orange', dpo: 'dark', rl: 'amber', multi_agent: 'berry',
}

function KindBadge({ kind }: { kind: string }) {
  const t = TRAINING_TYPES[kind]
  if (!t) return <Badge tone="neutral">{kind}</Badge>
  return <Badge tone={KIND_TONE[kind] ?? 'neutral'}>{t.label}</Badge>
}

function StatusPill({ status }: { status: string }) {
  const s = statusStyle(status)
  return (
    <span className={cn('badge gap-1.5', s.badge)}>
      <span className={cn('dot', s.dot)} />{s.label}
    </span>
  )
}

// --- Loss / reward chart for the selected run ------------------------------
function RunChart({ run }: { run: Run }) {
  const dataVersion = useStore((s) => s.dataVersion)
  const { data, loading, error } = useAsync<{ series: SeriesPoint[] }>(
    () => api.analytics.runMetrics(run.id),
    [run.id, dataVersion],
  )
  const [showSecondary, setShowSecondary] = useState(true)

  const series = data?.series ?? []
  const { primary, secondary } = useMemo(() => {
    const has = (k: string) => series.some((p) => typeof p[k] === 'number' && !Number.isNaN(p[k]))
    const hasLoss = has('loss')
    const rewardKey = has('reward_mean') ? 'reward_mean' : has('reward_margin') ? 'reward_margin' : null
    const primaryKey = hasLoss ? 'loss' : rewardKey
    const secondaryKey = rewardKey && rewardKey !== primaryKey ? rewardKey : null
    return { primary: primaryKey, secondary: secondaryKey }
  }, [series])

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-lg text-ink truncate">{run.name}</h3>
            <KindBadge kind={run.kind} />
            {run.mode === 'demo' && <Badge tone="amber">demo</Badge>}
          </div>
          <p className="text-xs text-ink-mute mt-1 flex items-center gap-1">
            {primary ? METRIC_LABEL[primary] : 'Metric'} over training steps
            {primary && <InfoTip term={METRIC_TERM[primary]} />}
          </p>
        </div>
        {secondary && primary && (
          <Button
            variant="outline"
            size="xs"
            icon={showSecondary ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            onClick={() => setShowSecondary((v) => !v)}
          >
            {showSecondary ? 'Hide' : 'Show'} {METRIC_LABEL[secondary].toLowerCase()}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-[240px] flex items-center justify-center"><Spinner className="w-6 h-6" /></div>
      ) : error ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-berry text-center px-4">{error}</div>
      ) : !primary || series.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-sm text-ink-mute text-center px-4">
          No metrics recorded for this run yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={series} margin={{ top: 6, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="step" tickLine={false} axisLine={{ stroke: GRID }}
              tick={{ fill: TICK, fontSize: 11 }}
            />
            <YAxis
              tickLine={false} axisLine={false} width={46} allowDecimals
              tick={{ fill: TICK, fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: CHARCOAL, border: 'none', borderRadius: 12, color: '#fff', fontSize: 12, padding: '8px 10px' }}
              labelStyle={{ color: '#fff', fontWeight: 600 }}
              itemStyle={{ color: '#fff' }}
              labelFormatter={(l) => `Step ${l}`}
              formatter={(v: number, name: string) => [fmtNum(v), name]}
            />
            <Line
              type="monotone" dataKey={primary} name={METRIC_LABEL[primary]}
              stroke={ORANGE} strokeWidth={2} dot={false} connectNulls isAnimationActive={false}
            />
            {secondary && showSecondary && (
              <Line
                type="monotone" dataKey={secondary} name={METRIC_LABEL[secondary]}
                stroke={CHARCOAL} strokeWidth={2} dot={false} connectNulls isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// --- View ------------------------------------------------------------------
export default function Analytics() {
  const dataVersion = useStore((s) => s.dataVersion)
  const setView = useStore((s) => s.setView)
  const bump = useStore((s) => s.bump)

  const overview = useAsync<Overview>(() => api.analytics.overview(), [dataVersion])
  const runsReq = useAsync<{ runs: Run[] }>(() => api.analytics.runs(), [dataVersion])

  const runs = runsReq.data?.runs ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Keep a valid selection: default to the newest run, reset if it vanishes.
  useEffect(() => {
    if (!runs.length) { if (selectedId) setSelectedId(null); return }
    if (!selectedId || !runs.some((r) => r.id === selectedId)) setSelectedId(runs[0].id)
  }, [runs, selectedId])

  const selected = runs.find((r) => r.id === selectedId) ?? null

  const select = (id: string) => setSelectedId(id)
  const onRowKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-2xl text-ink">Analytics</h1>
          <p className="text-sm text-ink-soft mt-1">Real numbers from your training runs — nothing made up.</p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={bump}>
          Refresh
        </Button>
      </div>

      {/* Overview cards */}
      {overview.loading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card card-pad">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-16 mt-3" />
              <Skeleton className="h-3 w-24 mt-3" />
            </div>
          ))}
        </div>
      ) : overview.error ? (
        <Card className="card-pad text-sm text-berry">Couldn’t load the overview: {overview.error}</Card>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          {(overview.data?.cards ?? []).map((c, i) => (
            <Stat
              key={i}
              label={c.label}
              value={c.value === null || c.value === undefined || c.value === '' ? '—' : c.value}
              hint={c.hint}
              accent={i === 0}
            />
          ))}
        </div>
      )}

      {/* Runs */}
      <div>
        <h2 className="font-display font-bold text-lg text-ink mb-3">Training runs</h2>

        {runsReq.loading ? (
          <Card className="card-pad space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </Card>
        ) : runsReq.error ? (
          <Card className="card-pad text-sm text-berry">Couldn’t load runs: {runsReq.error}</Card>
        ) : runs.length === 0 ? (
          <Card>
            <EmptyState
              icon={<BarChart3 className="w-6 h-6" />}
              title="Train a model to see analytics"
              description="Once you kick off a run, its loss curve, status, and metrics show up here."
              action={<Button icon={<ArrowRight className="w-4 h-4" />} onClick={() => setView('train')}>Go to Train</Button>}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-mute border-b border-line">
                    <th className="px-4 py-3 font-semibold">Run</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Base model</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Steps</th>
                    <th className="px-4 py-3 font-semibold">
                      <span className="inline-flex items-center gap-1">Final loss<InfoTip term="loss" /></span>
                    </th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const active = r.id === selectedId
                    return (
                      <tr
                        key={r.id}
                        onClick={() => select(r.id)}
                        onKeyDown={(e) => onRowKey(e, r.id)}
                        tabIndex={0}
                        role="button"
                        aria-pressed={active}
                        className={cn(
                          'border-b border-line last:border-0 cursor-pointer outline-none transition-colors',
                          'focus-visible:ring-2 focus-visible:ring-orange/50',
                          active ? 'bg-orange-soft' : 'hover:bg-line-soft',
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn('font-semibold text-ink truncate max-w-[200px]', active && 'text-orange-ink')} title={r.name}>
                              {r.name}
                            </span>
                            {r.mode === 'demo' && <Badge tone="amber">demo</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3"><KindBadge kind={r.kind} /></td>
                        <td className="px-4 py-3">
                          <span className="text-ink-soft truncate block max-w-[180px]" title={r.base_model}>{r.base_model || '—'}</span>
                        </td>
                        <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                        <td className="px-4 py-3 font-mono text-xs text-ink-soft whitespace-nowrap">
                          {fmtInt(r.steps)}{r.total_steps ? ` / ${fmtInt(r.total_steps)}` : ''}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-ink">{fmtNum(r.loss)}</td>
                        <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{r.duration || '—'}</td>
                        <td className="px-4 py-3 text-ink-mute whitespace-nowrap">{relTime(r.created_at) || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Selected run chart */}
      {selected && <RunChart run={selected} />}
    </div>
  )
}
