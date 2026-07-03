import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import {
  Swords, Crown, Play, Square, RotateCcw, Users, ListChecks, Database,
  KeyRound, Zap, Trophy, AlertTriangle,
} from 'lucide-react'
import { api, CatalogModel, Dataset, Job } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { cn, fmtNum, statusStyle } from '../lib/util'
import {
  Button, Card, Field, Input, Select, Textarea, Segmented, Badge, Progress,
  EmptyState, Skeleton, Spinner, toast,
} from '../components/ui'
import { InfoTip } from '../lib/glossary'

const ORANGE = '#FF6B1A'

type Mode = 'tournament' | 'swarm'
type TaskSource = 'dataset' | 'prompts'

interface AgentRow { agent: string; score: number; history?: number[] }

// "Qwen/Qwen3.5-4B" -> "Qwen3.5-4B"
const short = (s?: string | null) => (s || '').split('/').pop() || s || ''

const MODE_DESC: Record<Mode, string> = {
  tournament: 'Every agent trains on the shared tasks each round, then they’re ranked by reward.',
  swarm: 'Like tournament, but between rounds the weakest agents copy the leader’s weights.',
}

// --- Tiny reward sparkline --------------------------------------------------
function Sparkline({ history }: { history?: number[] }) {
  const pts = (history ?? []).filter((v) => typeof v === 'number' && !Number.isNaN(v)).map((v, i) => ({ i, v }))
  if (pts.length < 2) {
    return <div className="w-24 h-9 flex items-center justify-center text-[11px] text-ink-mute font-mono">—</div>
  }
  return (
    <div className="w-24 h-9" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line type="monotone" dataKey="v" stroke={ORANGE} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = statusStyle(status)
  return <span className={cn('badge gap-1.5', s.badge)}><span className={cn('dot', s.dot)} />{s.label}</span>
}

export default function Arena() {
  const apiKey = useStore((s) => s.apiKey)
  const bump = useStore((s) => s.bump)
  const dataVersion = useStore((s) => s.dataVersion)
  const liveJobs = useStore((s) => s.liveJobs)

  const catalog = useAsync(() => api.models.catalog(), [])
  const datasetsReq = useAsync(() => api.datasets.list(), [dataVersion])

  const allCatalog: CatalogModel[] = catalog.data?.models ?? []
  const recommendedIds: string[] = catalog.data?.recommended ?? []
  const baseModels = allCatalog.filter((m) => m.recommended || recommendedIds.includes(m.id))
  const rlDatasets: Dataset[] = (datasetsReq.data?.datasets ?? []).filter(
    (d) => d.training_type === 'rl' || d.training_type === 'any',
  )

  // --- Config ---------------------------------------------------------------
  const [name, setName] = useState('')
  const [numAgents, setNumAgents] = useState(3)
  const [mode, setMode] = useState<Mode>('tournament')
  const [baseModel, setBaseModel] = useState('')
  const [numRounds, setNumRounds] = useState(3)
  const [groupSize, setGroupSize] = useState(4)
  const [source, setSource] = useState<TaskSource>('prompts')
  const [datasetId, setDatasetId] = useState('')
  const [taskText, setTaskText] = useState('')
  const [dryRun, setDryRun] = useState(!apiKey)
  const [starting, setStarting] = useState(false)

  // --- Live run -------------------------------------------------------------
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)

  // Default the base model once the catalog arrives.
  useEffect(() => {
    if (baseModel) return
    const def = catalog.data?.recommended_default
    if (def) setBaseModel(def)
    else if (baseModels[0]) setBaseModel(baseModels[0].id)
    // eslint-disable-next-line
  }, [catalog.data])

  // Poll the job while it's active. Live metrics arrive via the store socket.
  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const j = await api.training.job(jobId)
        if (cancelled) return
        setJob(j)
        if (j.status === 'running' || j.status === 'queued') timer = setTimeout(tick, 1600)
      } catch {
        if (!cancelled) timer = setTimeout(tick, 3000)
      }
    }
    tick()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [jobId])

  const finalName = name.trim() || `Arena · ${numAgents} agents · ${short(baseModel) || 'model'}`
  const parsedTasks = taskText.split('\n').map((t) => t.trim()).filter(Boolean)
  const canStart =
    !!baseModel &&
    (source === 'dataset' ? !!datasetId : parsedTasks.length > 0) &&
    (dryRun || !!apiKey)

  async function start() {
    if (starting) return
    if (!baseModel) { toast('Pick a base model first', 'error'); return }
    if (source === 'dataset' && !datasetId) { toast('Pick a dataset of tasks', 'error'); return }
    if (source === 'prompts' && parsedTasks.length === 0) { toast('Add at least one task prompt', 'error'); return }
    if (!dryRun && !apiKey) { toast('Add your Tinker key in Settings, or turn on Demo mode', 'error'); return }

    setStarting(true)
    try {
      const cfg: Record<string, unknown> = {
        name: finalName,
        num_agents: numAgents,
        base_model: baseModel,
        mode,
        num_rounds: numRounds,
        rl_group_size: groupSize,
        dry_run: dryRun,
      }
      if (source === 'dataset') cfg.dataset_id = datasetId
      else cfg.tasks = parsedTasks

      const res = await api.training.multiAgentStart(cfg) as { job_id?: string; job?: Job }
      const id = res.job_id || res.job?.id
      if (!id) throw new Error('The server did not return a job id')
      setJob(res.job ?? null)
      setJobId(id)
      bump()
      toast(dryRun ? 'Demo arena started' : 'Arena started — may the best agent win', 'ok')
    } catch (e: any) {
      toast(e.message || 'Could not start the arena', 'error')
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    if (!jobId) return
    try {
      await api.training.cancel(jobId)
      toast('Stopping the arena…', 'info')
      bump()
    } catch (e: any) {
      toast(e.message || 'Could not stop the run', 'error')
    }
  }

  function newRun() { setJobId(null); setJob(null) }

  // --- Derived live state ---------------------------------------------------
  const live = jobId ? liveJobs[jobId] : undefined
  const liveMetrics: any = live?.metrics
  const jobMetrics: any = job?.metrics
  const metrics: any = (liveMetrics && liveMetrics.leaderboard) ? liveMetrics : (jobMetrics || liveMetrics || {})

  const status = live?.status || job?.status || 'queued'
  const statusMessage = live?.status_message || job?.status_message || ''
  const isDemo = (job?.config?.dry_run as boolean | undefined) ?? dryRun

  const rawBoard: AgentRow[] =
    Array.isArray(metrics.leaderboard) && metrics.leaderboard.length
      ? metrics.leaderboard
      : Array.isArray(job?.result?.leaderboard) ? job!.result.leaderboard : []
  const leaderboard = [...rawBoard].sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))

  const round: number | undefined = typeof metrics.round === 'number' ? metrics.round : undefined
  const totalRounds = Number(job?.config?.num_rounds ?? numRounds) || numRounds

  const step = live?.step ?? job?.current_step ?? 0
  const totalSteps = job?.total_steps ?? 0
  const pct =
    status === 'completed' ? 100
      : totalSteps > 0 ? (step / totalSteps) * 100
      : round != null ? (round / totalRounds) * 100
      : 0

  const bestRaw = job?.result?.best_agent
  const bestAgent: string | undefined =
    typeof bestRaw === 'string' ? bestRaw : (bestRaw && typeof bestRaw.agent === 'string' ? bestRaw.agent : undefined)
  const isWinner = (row: AgentRow, idx: number) =>
    status === 'completed' && (bestAgent ? row.agent === bestAgent : idx === 0)

  const modelsLoading = catalog.loading && !catalog.data

  // ==========================================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl2 bg-charcoal text-white flex items-center justify-center">
            <Swords className="w-5 h-5" />
          </div>
          <h1 className="font-display font-bold text-3xl text-ink">Multi-agent arena</h1>
        </div>
        <p className="text-ink-soft mt-2 max-w-2xl">
          Spin up several copies of one model and let them compete with real reinforcement learning
          <InfoTip term="multi_agent" />. Each round the agents train on the same tasks, earn a reward
          <InfoTip term="reward" />, and climb a live leaderboard. The best one wins.
        </p>
      </div>

      {/* ---------- CONFIG ---------- */}
      {!jobId && (
        <Card className="card-pad space-y-6">
          {/* Agents + rounds + group size */}
          <div className="grid gap-5 md:grid-cols-3">
            <Field
              label={<span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4 text-ink-mute" /> Agents</span>}
              hint="How many model copies compete (2–6)."
            >
              <Segmented<string>
                value={String(numAgents)}
                onChange={(v) => setNumAgents(Number(v))}
                options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              />
            </Field>

            <Field label="Rounds" term="num_steps" hint="How many compete-and-train rounds to run.">
              <Input
                type="number" min={1} max={20} value={numRounds}
                onChange={(e) => setNumRounds(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>

            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  Group size
                  <InfoTip text="How many answers each agent samples per task before scoring. Bigger groups give a steadier reward signal but cost more. 4 is a solid default." />
                </span>
              }
              hint="Samples per task, per agent."
            >
              <Input
                type="number" min={1} max={16} value={groupSize}
                onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          </div>

          {/* Mode */}
          <div>
            <label className="label">Mode</label>
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'tournament', label: <span className="inline-flex items-center gap-1.5"><Trophy className="w-4 h-4" /> Tournament</span> },
                { value: 'swarm', label: <span className="inline-flex items-center gap-1.5"><Zap className="w-4 h-4" /> Swarm</span> },
              ]}
            />
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div className={cn('rounded-xl border p-3 text-sm transition-colors', mode === 'tournament' ? 'border-orange/40 bg-orange-soft/50' : 'border-line bg-raised')}>
                <div className="font-semibold text-ink flex items-center gap-1.5">Tournament <InfoTip term="tournament" /></div>
                <p className="text-ink-soft mt-0.5 text-[13px]">{MODE_DESC.tournament}</p>
              </div>
              <div className={cn('rounded-xl border p-3 text-sm transition-colors', mode === 'swarm' ? 'border-orange/40 bg-orange-soft/50' : 'border-line bg-raised')}>
                <div className="font-semibold text-ink flex items-center gap-1.5">Swarm <InfoTip term="swarm" /></div>
                <p className="text-ink-soft mt-0.5 text-[13px]">{MODE_DESC.swarm}</p>
              </div>
            </div>
          </div>

          {/* Base model + name */}
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Base model" term="base_model" hint="Every agent starts from this model.">
              {modelsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : catalog.error ? (
                <div className="input flex items-center text-berry text-sm">Couldn’t load models: {catalog.error}</div>
              ) : (
                <Select value={baseModel} onChange={(e) => setBaseModel(e.target.value)}>
                  <option value="" disabled>Choose a base model…</option>
                  {baseModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.recommended ? ' · recommended' : ''}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Run name" hint="Optional — we’ll name it for you otherwise.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={finalName} />
            </Field>
          </div>

          {/* Tasks */}
          <div>
            <label className="label flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-ink-mute" /> Tasks the agents compete on</label>
            <Segmented<TaskSource>
              value={source}
              onChange={setSource}
              className="mb-3"
              options={[
                { value: 'prompts', label: 'Type prompts' },
                { value: 'dataset', label: 'Pick a dataset' },
              ]}
            />
            {source === 'prompts' ? (
              <Field hint={`One task per line. ${parsedTasks.length} task${parsedTasks.length === 1 ? '' : 's'} so far.`}>
                <Textarea
                  rows={5}
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  placeholder={'Write a haiku about the ocean\nExplain gravity to a five-year-old\nName three uses for a paperclip'}
                  className="font-mono text-[13px]"
                />
              </Field>
            ) : datasetsReq.loading ? (
              <Skeleton className="h-10 w-full" />
            ) : rlDatasets.length === 0 ? (
              <div className="rounded-xl border border-line bg-raised p-4 text-sm text-ink-soft flex items-center gap-2">
                <Database className="w-4 h-4 text-ink-mute" />
                No reinforcement-ready datasets yet. Type task prompts instead, or add one in Data.
              </div>
            ) : (
              <Field hint="Only reinforcement (rl / any) datasets can be used as tasks.">
                <Select value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
                  <option value="" disabled>Choose a dataset…</option>
                  {rlDatasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} · {d.num_samples} tasks</option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          {/* Demo mode + start */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t border-line">
            <div className="pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox" checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="accent-orange w-4 h-4"
                />
                <span className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  Demo mode <InfoTip term="dry_run" />
                </span>
              </label>
              <p className="text-xs text-ink-mute mt-1 ml-6.5 max-w-xs">
                {dryRun
                  ? 'A realistic, clearly-labeled fake run — no Tinker key or cost.'
                  : 'Runs for real using your Tinker key.'}
              </p>
            </div>
            <div className="pt-4 flex flex-col items-end gap-1.5">
              <Button
                variant="primary" size="lg" icon={<Play className="w-4 h-4" />}
                loading={starting} disabled={!canStart || starting} onClick={start}
              >
                {dryRun ? 'Start demo arena' : 'Start arena'}
              </Button>
              {!apiKey && !dryRun && (
                <span className="text-xs text-ink-mute inline-flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5" /> Add your Tinker key in Settings, or turn on Demo mode.
                </span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ---------- LIVE LEADERBOARD ---------- */}
      {jobId && (
        <div className="space-y-5">
          <Card className="card-pad space-y-5">
            {/* Panel header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-xl text-ink truncate">{job?.name || finalName}</h2>
                  <StatusPill status={status} />
                  <Badge tone={mode === 'swarm' ? 'dark' : 'orange'}>{mode === 'swarm' ? 'Swarm' : 'Tournament'}</Badge>
                  {isDemo && <Badge tone="amber">demo</Badge>}
                </div>
                <p className="text-sm text-ink-soft mt-1 flex items-center gap-1.5">
                  {short(job?.base_model || baseModel)} · {numAgents} agents
                  {round != null && <span className="text-ink-mute">· round {round} of {totalRounds}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(status === 'running' || status === 'queued') ? (
                  <Button variant="danger" size="sm" icon={<Square className="w-4 h-4" />} onClick={cancel}>Cancel</Button>
                ) : (
                  <Button variant="outline" size="sm" icon={<RotateCcw className="w-4 h-4" />} onClick={newRun}>Run a new arena</Button>
                )}
              </div>
            </div>

            {/* Demo banner */}
            {isDemo && (
              <div className="rounded-xl border border-amber/40 bg-amber-soft/60 p-3 text-sm text-amber-ink flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Demo run — the scores below are simulated to show the flow. Nothing is saved and no key is used.</span>
              </div>
            )}

            {/* Progress */}
            {(status === 'running' || status === 'queued') && (
              <div>
                <div className="flex items-center justify-between text-xs text-ink-mute mb-1.5">
                  <span>{statusMessage || (round != null ? `Round ${round} of ${totalRounds}` : 'Warming up…')}</span>
                  <span className="font-mono">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} />
              </div>
            )}

            {/* Failed */}
            {status === 'failed' && (
              <div className="rounded-xl border border-berry/40 bg-berry-soft/60 p-3 text-sm text-berry-ink">
                <span className="font-semibold">This run failed.</span> {job?.error || 'No error detail was returned.'}
              </div>
            )}

            {/* Winner */}
            {status === 'completed' && leaderboard[0] && (
              <div className="rounded-xl bg-orange-soft border border-orange/30 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange text-white flex items-center justify-center shrink-0">
                  <Crown className="w-5.5 h-5.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-orange-ink">Winner</div>
                  <div className="font-display font-bold text-lg text-ink">
                    {bestAgent || leaderboard[0].agent}
                    <span className="ml-2 font-mono text-sm text-ink-soft">reward {fmtNum(leaderboard[0].score)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Leaderboard */}
            {leaderboard.length === 0 ? (
              (status === 'running' || status === 'queued') ? (
                <div className="flex items-center justify-center gap-2 text-sm text-ink-mute py-10">
                  <Spinner className="w-4 h-4" /> Agents are warming up — first scores land after round one…
                </div>
              ) : status === 'failed' || status === 'cancelled' ? (
                <EmptyState icon={<Swords className="w-6 h-6" />} title="No leaderboard" description="This run ended before any rewards were recorded." />
              ) : (
                <div className="text-sm text-ink-mute py-6 text-center">No leaderboard data yet.</div>
              )
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
                  <span>#</span><span>Agent</span><span className="text-right pr-1 inline-flex items-center gap-1 justify-end">Reward<InfoTip term="reward" /></span><span className="text-right">Trend</span>
                </div>
                {leaderboard.map((row, idx) => {
                  const winner = isWinner(row, idx)
                  return (
                    <div
                      key={row.agent + idx}
                      className={cn(
                        'grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                        winner ? 'border-orange/40 bg-orange-soft' : idx === 0 ? 'border-line-strong bg-raised' : 'border-line bg-paper',
                      )}
                    >
                      <span className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-sm',
                        idx === 0 ? 'bg-charcoal text-white' : 'bg-line-soft text-ink-soft',
                      )}>
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-ink truncate flex items-center gap-1.5" title={row.agent}>
                        {winner && <Crown className="w-4 h-4 text-orange shrink-0" />}
                        {row.agent}
                      </span>
                      <span className="font-mono text-sm text-ink text-right tabular-nums w-16">{fmtNum(row.score)}</span>
                      <Sparkline history={row.history} />
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
