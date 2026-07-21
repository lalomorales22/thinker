import { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Database, SlidersHorizontal, ChevronDown, Rocket,
  CheckCircle2, TriangleAlert, Ban, RotateCcw, MessageSquare, BarChart3, Loader2,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  Button, Card, Badge, Dot, Field, Input, Select, EmptyState, Progress, Skeleton, Spinner, toast,
} from '../components/ui'
import { InfoTip } from '../lib/glossary'
import { cn, fmtInt, fmtNum, fmtMoney, fmtContext, TRAINING_TYPES, statusStyle } from '../lib/util'
import { api, CatalogModel, Dataset, Job } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'

type TType = 'sl' | 'dpo' | 'rl'
const TERMINAL = ['completed', 'failed', 'cancelled']

const LR_OPTIONS = [
  { v: 3e-4, l: '3e-4 — aggressive' },
  { v: 1e-4, l: '1e-4 — default for supervised' },
  { v: 5e-5, l: '5e-5 — gentler' },
  { v: 1e-5, l: '1e-5 — default for DPO / RL' },
]

const METHOD_PHRASE: Record<TType, string> = {
  sl: 'supervised learning',
  dpo: 'preference tuning (DPO)',
  rl: 'reinforcement learning',
}

const num = (x: unknown): number | undefined =>
  typeof x === 'number' && !Number.isNaN(x) ? x : undefined

export default function Train() {
  const apiKey = useStore((s) => s.apiKey)
  const setView = useStore((s) => s.setView)
  const bump = useStore((s) => s.bump)
  const setPendingConfig = useStore((s) => s.setPendingConfig)
  const dataVersion = useStore((s) => s.dataVersion)
  const liveJobs = useStore((s) => s.liveJobs)

  // --- config state ----------------------------------------------------------
  const [trainingType, setTrainingType] = useState<TType>('sl')
  const [datasetId, setDatasetId] = useState<string>('')
  const [baseModel, setBaseModel] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [rank, setRank] = useState<number>(32)
  const [learningRate, setLearningRate] = useState<number>(1e-4)
  const [numSteps, setNumSteps] = useState<number>(200)
  const [batchSize, setBatchSize] = useState<number>(4)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [lrTouched, setLrTouched] = useState(false)
  const [dryRun, setDryRun] = useState<boolean>(!apiKey)

  // --- run state -------------------------------------------------------------
  const [starting, setStarting] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [history, setHistory] = useState<{ step: number; ts: number; data: any }[]>([])
  /** Set when the job poll has missed several times — usually a dead backend. */
  const [lostContact, setLostContact] = useState(false)

  // --- data ------------------------------------------------------------------
  const dsQuery = useAsync(() => api.datasets.list(), [dataVersion])
  const catQuery = useAsync(() => api.models.catalog(), [])
  const datasets = dsQuery.data?.datasets ?? []
  const models = catQuery.data?.models ?? []
  const recommendedIds = catQuery.data?.recommended ?? []

  const compatible = useMemo(
    () => datasets.filter((d) => d.training_type === trainingType || d.training_type === 'any'),
    [datasets, trainingType],
  )
  const compatibleKey = compatible.map((d) => d.id).join(',')

  const isRecommended = (m: CatalogModel) => m.recommended || recommendedIds.includes(m.id)
  const sortedModels = useMemo(() => {
    const rec = models.filter((m) => isRecommended(m) && !m.retiring)
    const other = models.filter((m) => !isRecommended(m) && !m.retiring)
    const retiring = models.filter((m) => m.retiring)
    return { rec, other, retiring }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, recommendedIds])
  const selectedModel = models.find((m) => m.id === baseModel)

  // --- prefill from assistant ("Use these settings") -------------------------
  useEffect(() => {
    const pc = useStore.getState().pendingConfig
    if (!pc) return
    if (pc.training_type && ['sl', 'dpo', 'rl'].includes(pc.training_type)) setTrainingType(pc.training_type)
    if (pc.base_model) setBaseModel(pc.base_model)
    if (pc.dataset_id) setDatasetId(pc.dataset_id)
    if (pc.name) setName(pc.name)
    if (pc.rank != null) setRank(Number(pc.rank))
    if (pc.learning_rate != null) { setLearningRate(Number(pc.learning_rate)); setLrTouched(true) }
    if (pc.num_steps != null) setNumSteps(Number(pc.num_steps))
    if (pc.batch_size != null) setBatchSize(Number(pc.batch_size))
    if (pc.rank != null || pc.learning_rate != null || pc.num_steps != null || pc.batch_size != null) setShowAdvanced(true)
    setPendingConfig(null)
    toast('Loaded suggested settings', 'info')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // default learning rate follows the method, unless the user changed it
  useEffect(() => {
    if (!lrTouched) setLearningRate(trainingType === 'sl' ? 1e-4 : 1e-5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingType])

  // keep a valid dataset selected for the chosen method
  useEffect(() => {
    if (dsQuery.loading) return
    if (compatible.length === 0) { setDatasetId(''); return }
    if (!compatible.some((d) => d.id === datasetId)) setDatasetId(compatible[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsQuery.loading, trainingType, compatibleKey])

  // default base model = recommended
  useEffect(() => {
    if (!catQuery.data) return
    if (!baseModel) setBaseModel(catQuery.data.recommended_default || models[0]?.id || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catQuery.data])

  // --- live progress: poll job + metrics, merged with WebSocket store --------
  useEffect(() => {
    if (!jobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let misses = 0
    setLostContact(false)
    const tick = async () => {
      if (!active) return
      try {
        const [j, m] = await Promise.all([
          api.training.job(jobId),
          api.training.metrics(jobId).catch(() => ({ history: [] as any[] })),
        ])
        if (!active) return
        misses = 0
        setLostContact(false)
        setJob(j)
        if (m && Array.isArray((m as any).history)) setHistory((m as any).history)
        if (TERMINAL.includes(j.status)) { active = false; bump(); return }
      } catch {
        // Silently retrying forever leaves a frozen progress bar that looks
        // identical to a running job — which is exactly how a dead backend
        // reads as "stuck at 0%". Say so after a few consecutive misses.
        misses += 1
        if (active && misses >= 3) setLostContact(true)
      }
      if (active) timer = setTimeout(tick, 1200)
    }
    tick()
    return () => { active = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  // --- merged live values ----------------------------------------------------
  const live = jobId ? liveJobs[jobId] : undefined
  const status = live?.status || job?.status || 'queued'
  const kind: string = job?.kind || trainingType
  const isTerminal = TERMINAL.includes(status)
  const runActive = !!jobId && !isTerminal
  const jobIsDemo = job ? !!job.config?.dry_run : dryRun

  const step = live?.step ?? job?.current_step ?? 0
  const total = job?.total_steps || numSteps
  const statusMessage = live?.status_message || job?.status_message || ''
  const pct = status === 'completed' ? 100 : total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0

  const lastData = history.length ? history[history.length - 1].data ?? {} : {}
  const latest = { ...lastData, ...(live?.metrics || {}) }
  const lastLoss = num(latest.loss)
  const lastReward = num(latest.reward_mean ?? latest.reward)
  const lastMargin = num(latest.reward_margin)
  const lastPrefAcc = num(latest.pref_accuracy)

  const chartData = useMemo(() => {
    const rows = history.map((h) => ({
      step: h.step,
      loss: num(h.data?.loss),
      reward: num(h.data?.reward_mean ?? h.data?.reward),
    }))
    if (live?.metrics && typeof live.step === 'number') {
      const lastRow = rows[rows.length - 1]
      if (!lastRow || live.step > lastRow.step) {
        rows.push({
          step: live.step,
          loss: num(live.metrics.loss),
          reward: num(live.metrics.reward_mean ?? live.metrics.reward),
        })
      }
    }
    return rows
  }, [history, live?.step, live?.metrics])

  const primaryKey: 'loss' | 'reward' = kind === 'rl' ? 'reward' : 'loss'
  const primaryLabel = kind === 'rl' ? 'Reward' : 'Loss'
  const hasChart = chartData.some((d) => d[primaryKey] !== undefined)

  // --- actions ---------------------------------------------------------------
  const canStart = !!baseModel && (dryRun || (!!apiKey && !!datasetId))

  async function start() {
    if (!canStart) return
    setStarting(true)
    try {
      const cfg = {
        name: name.trim() || `${TRAINING_TYPES[trainingType].label} run`,
        training_type: trainingType,
        base_model: baseModel,
        dataset_id: datasetId || null,
        rank: Number(rank) || 32,
        learning_rate: Number(learningRate) || (trainingType === 'sl' ? 1e-4 : 1e-5),
        num_steps: Number(numSteps) || 200,
        batch_size: Number(batchSize) || 4,
        dry_run: dryRun,
      }
      const res = await api.training.start(cfg)
      setJobId(res.job_id)
      setJob(res.job)
      setHistory([])
      bump()
      toast(dryRun ? 'Demo preview started' : 'Training started', 'info')
    } catch (e: any) {
      toast(e.message || 'Could not start training', 'error')
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    if (!jobId) return
    try { await api.training.cancel(jobId); toast('Cancelling run…', 'info') }
    catch (e: any) { toast(e.message || 'Could not cancel', 'error') }
  }

  function resetRun() { setJobId(null); setJob(null); setHistory([]) }

  // --- recap -----------------------------------------------------------------
  const selDataset = compatible.find((d) => d.id === datasetId)
  const dataPhrase = selDataset
    ? `${fmtInt(selDataset.num_samples)} examples`
    : dryRun ? 'sample demo data' : 'your data'
  const recap = `You'll teach ${selectedModel?.name || 'your base model'} from ${dataPhrase} using ${METHOD_PHRASE[trainingType]}, about ${fmtInt(numSteps)} steps.`

  const lockClick = (fn: () => void) => () => { if (!runActive) fn() }

  return (
    <div className="space-y-6">
      <header>
        <h1>Train a model</h1>
        <p className="text-ink-soft mt-1 max-w-2xl">
          Pick what you want to teach, choose your data and a base model, then press start.
          New here? Demo mode previews the whole flow for free.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        {/* ---------------- left: config form ---------------- */}
        <Card className="card-pad space-y-8">
          {/* 1) method */}
          <Step n={1} title="What do you want to teach?">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(['sl', 'dpo', 'rl'] as TType[]).map((t) => {
                const tt = TRAINING_TYPES[t]
                const active = trainingType === t
                return (
                  <div
                    key={t}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={lockClick(() => setTrainingType(t))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!runActive) setTrainingType(t) } }}
                    className={cn(
                      'cursor-pointer text-left rounded-xl border p-3.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-orange/40',
                      active ? 'border-orange bg-orange-soft/60' : 'border-line bg-paper hover:border-line-strong',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Dot className={tt.dot} />
                      <span className="font-semibold text-ink">{tt.label}</span>
                      <span className="ml-auto"><InfoTip term={t} /></span>
                    </div>
                    <p className="text-xs text-ink-soft mt-1.5">{tt.short}</p>
                    <p className="text-[11px] text-ink-mute mt-2 pt-2 border-t border-line-soft">
                      <span className="font-semibold text-ink-soft">Needs:</span> {tt.needs}
                    </p>
                    {active && (
                      <p className="text-[11px] text-ink-mute mt-1.5 italic">{tt.example}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </Step>

          {/* 2) data */}
          <Step n={2} title="Your data">
            {dsQuery.loading ? (
              <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
            ) : dsQuery.error ? (
              <p className="text-sm text-berry-ink">Couldn’t load datasets: {dsQuery.error}</p>
            ) : compatible.length === 0 && !dryRun ? (
              <EmptyState
                icon={<Database className="w-6 h-6" />}
                title="No compatible data yet"
                description={`You need a ${TRAINING_TYPES[trainingType].label.toLowerCase()} dataset before you can train. Add one, or switch on Demo mode below to preview.`}
                action={<Button variant="primary" onClick={() => setView('data')}>Add data first</Button>}
              />
            ) : (
              <div className="space-y-2">
                {dryRun && (
                  <DataRow
                    selected={datasetId === ''}
                    disabled={runActive}
                    onSelect={() => setDatasetId('')}
                    title="Demo (no data)"
                    subtitle="Preview the flow with built-in sample data"
                  />
                )}
                {compatible.map((d) => (
                  <DataRow
                    key={d.id}
                    selected={datasetId === d.id}
                    disabled={runActive}
                    onSelect={() => setDatasetId(d.id)}
                    title={d.name}
                    subtitle={`${fmtInt(d.num_samples)} examples · ${d.training_type === 'any' ? 'any method' : TRAINING_TYPES[d.training_type]?.label ?? d.training_type}`}
                    dataset={d}
                  />
                ))}
                {compatible.length === 0 && dryRun && (
                  <p className="hint">No compatible datasets yet — the demo will use sample data.</p>
                )}
              </div>
            )}
          </Step>

          {/* 3) base model */}
          <Step n={3} title="Base model">
            {catQuery.loading ? (
              <Skeleton className="h-10 w-full" />
            ) : catQuery.error ? (
              <p className="text-sm text-berry-ink">Couldn’t load models: {catQuery.error}</p>
            ) : (
              <div className="space-y-3">
                <Select value={baseModel} onChange={(e) => setBaseModel(e.target.value)} disabled={runActive} aria-label="Base model">
                  {sortedModels.rec.length > 0 && (
                    <optgroup label="Recommended">
                      {sortedModels.rec.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size}</option>)}
                    </optgroup>
                  )}
                  {sortedModels.other.length > 0 && (
                    <optgroup label="Other models">
                      {sortedModels.other.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size}</option>)}
                    </optgroup>
                  )}
                  {sortedModels.retiring.length > 0 && (
                    <optgroup label="Retiring soon">
                      {sortedModels.retiring.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.size} (retiring)</option>)}
                    </optgroup>
                  )}
                </Select>

                {selectedModel && (
                  <div className="rounded-xl border border-line bg-raised p-3.5 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{selectedModel.name}</span>
                      <span className="text-xs text-ink-mute">{selectedModel.org}</span>
                      <InfoTip term="base_model" />
                      <span className="ml-auto flex items-center gap-1.5">
                        {selectedModel.vision && <Badge tone="dark">Vision</Badge>}
                        {selectedModel.reasoning && <Badge tone="orange">Reasoning</Badge>}
                        {selectedModel.is_base && <Badge tone="outline">Base</Badge>}
                        {selectedModel.retiring && <Badge tone="amber">Retiring</Badge>}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MiniStat label="Size" value={selectedModel.size} />
                      <MiniStat label={<>Context <InfoTip term="context" /></>} value={fmtContext(selectedModel.context_tokens)} />
                      <MiniStat label="~train $/Mtok" value={fmtMoney(selectedModel.price_train)} />
                    </div>
                    {selectedModel.note && <p className="text-xs text-ink-soft">{selectedModel.note}</p>}
                  </div>
                )}
              </div>
            )}
          </Step>

          {/* 4) settings */}
          <Step n={4} title="Settings">
            <div className="space-y-4">
              <Field label="Run name" hint="A friendly label so you can find this run later.">
                <Input
                  value={name}
                  disabled={runActive}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${TRAINING_TYPES[trainingType].label} run`}
                />
              </Field>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                <ChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
              </button>

              {!showAdvanced ? (
                <p className="hint">
                  Using smart defaults — <span className="font-mono">rank {rank}</span>,{' '}
                  <span className="font-mono">{fmtNum(learningRate, 5)}</span> learning rate,{' '}
                  <span className="font-mono">{numSteps}</span> steps,{' '}
                  <span className="font-mono">batch {batchSize}</span>. Just press start.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="LoRA rank" term="rank">
                    <Input type="number" min={1} value={rank} disabled={runActive}
                      onChange={(e) => setRank(Number(e.target.value))} />
                  </Field>
                  <Field label="Learning rate" term="learning_rate">
                    <Select
                      value={String(learningRate)}
                      disabled={runActive}
                      onChange={(e) => { setLearningRate(Number(e.target.value)); setLrTouched(true) }}
                    >
                      {!LR_OPTIONS.some((o) => o.v === learningRate) && (
                        <option value={String(learningRate)}>{fmtNum(learningRate, 6)} (custom)</option>
                      )}
                      {LR_OPTIONS.map((o) => <option key={o.v} value={String(o.v)}>{o.l}</option>)}
                    </Select>
                  </Field>
                  <Field label="Training steps" term="num_steps">
                    <Input type="number" min={1} value={numSteps} disabled={runActive}
                      onChange={(e) => setNumSteps(Number(e.target.value))} />
                  </Field>
                  <Field label="Batch size" term="batch_size">
                    <Input type="number" min={1} value={batchSize} disabled={runActive}
                      onChange={(e) => setBatchSize(Number(e.target.value))} />
                  </Field>
                </div>
              )}
            </div>
          </Step>

          {/* 5) demo mode */}
          <Step n={5} title="How to run">
            {!apiKey ? (
              <div className="rounded-xl border border-amber/40 bg-amber-soft/50 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={dryRun} disabled={runActive}
                    onChange={(e) => setDryRun(e.target.checked)} className="mt-0.5 w-4 h-4 accent-orange-ink" />
                  <span>
                    <span className="font-semibold text-ink flex items-center gap-1.5">Demo mode <InfoTip term="dry_run" /></span>
                    <span className="block text-xs text-ink-soft mt-0.5">
                      No Tinker key yet — Demo mode previews the flow without training or cost.
                      Add your key in Settings to train for real.
                    </span>
                  </span>
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
                <input type="checkbox" checked={dryRun} disabled={runActive}
                  onChange={(e) => setDryRun(e.target.checked)} className="w-4 h-4 accent-orange-ink" />
                Just preview (demo — no real training) <InfoTip term="dry_run" />
              </label>
            )}
          </Step>

          {/* start / notes */}
          <div className="pt-2 border-t border-line space-y-3">
            {!dryRun && !apiKey && (
              <p className="text-sm text-berry-ink">Add your Tinker key in Settings, or switch on Demo mode above.</p>
            )}
            {!dryRun && apiKey && !datasetId && (
              <p className="text-sm text-berry-ink">Pick a dataset to train on.</p>
            )}
            {!runActive && !isTerminal && (
              <Button variant="primary" size="lg" loading={starting} disabled={!canStart}
                icon={<Rocket className="w-5 h-5" />} onClick={start}>
                {dryRun ? 'Preview in demo' : 'Start training'}
              </Button>
            )}
            {runActive && (
              <p className="text-sm text-ink-soft flex items-center gap-2">
                <Spinner className="w-4 h-4" /> Running — watch the panel on the right.
              </p>
            )}
            {isTerminal && (
              <Button variant="outline" icon={<RotateCcw className="w-4 h-4" />} onClick={resetRun}>
                Start another run
              </Button>
            )}
          </div>
        </Card>

        {/* ---------------- right: summary / live progress ---------------- */}
        <div className="lg:sticky lg:top-4">
          {!jobId ? (
            <Card className="card-pad space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange" />
                <h3 className="font-display font-bold text-ink">What will happen</h3>
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">{recap}</p>
              <div className="space-y-2 text-sm">
                <RecapRow label="Method" value={<span className="inline-flex items-center gap-1.5">{TRAINING_TYPES[trainingType].label} <InfoTip term={trainingType} /></span>} />
                <RecapRow label="Data" value={selDataset ? selDataset.name : dryRun ? 'Sample demo data' : '—'} />
                <RecapRow label="Base model" value={selectedModel?.name ?? '—'} />
                <RecapRow label="Steps" value={<span className="font-mono">{fmtInt(numSteps)}</span>} />
              </div>
              {dryRun && (
                <div className="rounded-xl bg-amber-soft/60 border border-amber/30 p-3 text-sm text-amber-ink flex gap-2">
                  <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Demo — not a real run, no model saved.</span>
                </div>
              )}
            </Card>
          ) : (
            <ProgressPanel
              status={status}
              statusMessage={statusMessage}
              step={step}
              total={total}
              pct={pct}
              isDemo={jobIsDemo}
              kind={kind}
              lastLoss={lastLoss}
              lastReward={lastReward}
              lastMargin={lastMargin}
              lastPrefAcc={lastPrefAcc}
              chartData={chartData}
              hasChart={hasChart}
              primaryKey={primaryKey}
              primaryLabel={primaryLabel}
              error={job?.error ?? null}
              lostContact={lostContact}
              onCancel={cancel}
              onPlayground={() => setView('playground')}
              onAnalytics={() => setView('analytics')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-lg bg-charcoal text-white text-xs font-bold flex items-center justify-center font-display">{n}</span>
        <h3 className="font-display font-bold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function MiniStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-mute flex items-center gap-1">{label}</div>
      <div className="font-mono text-sm text-ink mt-0.5">{value}</div>
    </div>
  )
}

function RecapRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-mute">{label}</span>
      <span className="font-medium text-ink text-right">{value}</span>
    </div>
  )
}

function DataRow({ selected, disabled, onSelect, title, subtitle, dataset }: {
  selected: boolean; disabled?: boolean; onSelect: () => void
  title: string; subtitle: string; dataset?: Dataset
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => { if (!disabled) onSelect() }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onSelect() } }}
      className={cn(
        'cursor-pointer rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-orange/40',
        selected ? 'border-orange bg-orange-soft/60' : 'border-line bg-paper hover:border-line-strong',
        disabled && 'opacity-60 cursor-not-allowed',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-ink truncate">{title}</div>
          <div className="text-xs text-ink-soft mt-0.5">{subtitle}</div>
        </div>
        {dataset && (
          dataset.schema_ok
            ? <Badge tone="orange">Ready</Badge>
            : <Badge tone="berry">Needs fixing</Badge>
        )}
      </div>
      {dataset && !dataset.schema_ok && dataset.schema_notes?.[0] && (
        <p className="text-xs text-berry-ink mt-1.5">{dataset.schema_notes[0]}</p>
      )}
    </div>
  )
}

function ProgressPanel(props: {
  status: string; statusMessage: string; step: number; total: number; pct: number
  isDemo: boolean; kind: string
  lastLoss?: number; lastReward?: number; lastMargin?: number; lastPrefAcc?: number
  chartData: { step: number; loss?: number; reward?: number }[]; hasChart: boolean
  primaryKey: 'loss' | 'reward'; primaryLabel: string
  error: string | null
  lostContact: boolean
  onCancel: () => void; onPlayground: () => void; onAnalytics: () => void
}) {
  const {
    status, statusMessage, step, total, pct, isDemo, kind,
    lastLoss, lastReward, lastMargin, lastPrefAcc, chartData, hasChart,
    primaryKey, primaryLabel, error, lostContact, onCancel, onPlayground, onAnalytics,
  } = props
  const ss = statusStyle(status)
  const running = status === 'running' || status === 'queued'

  return (
    <Card className="card-pad space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-ink">{isDemo ? 'Demo run' : 'Training run'}</h3>
          {isDemo && <Badge tone="amber">Demo</Badge>}
        </div>
        <span className={cn('badge', ss.badge)}><Dot className={ss.dot} />{ss.label}</span>
      </div>

      {statusMessage && <p className="text-sm text-ink-soft">{statusMessage}</p>}

      <div>
        <div className="flex justify-between text-xs text-ink-mute mb-1.5">
          <span>Step <span className="font-mono text-ink-soft">{fmtInt(step)}</span> / {fmtInt(total)}</span>
          <span className="font-mono">{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>

      {/* live metrics */}
      <div className="grid grid-cols-2 gap-2">
        {lastLoss !== undefined && (
          <MetricTile label={<>Loss <InfoTip term="loss" /></>} value={fmtNum(lastLoss, 4)} />
        )}
        {kind === 'rl' && lastReward !== undefined && (
          <MetricTile label={<>Reward <InfoTip term="reward" /></>} value={fmtNum(lastReward, 3)} />
        )}
        {kind === 'dpo' && lastMargin !== undefined && (
          <MetricTile label={<>Margin <InfoTip term="reward_margin" /></>} value={fmtNum(lastMargin, 3)} />
        )}
        {kind === 'dpo' && lastPrefAcc !== undefined && (
          <MetricTile
            label={<>Pref acc. <InfoTip term="pref_accuracy" /></>}
            value={`${((lastPrefAcc <= 1 ? lastPrefAcc * 100 : lastPrefAcc)).toFixed(1)}%`}
          />
        )}
      </div>

      {/* live chart */}
      {hasChart ? (
        <div>
          <div className="text-xs font-semibold text-ink-mute mb-1 flex items-center gap-1.5">
            {primaryLabel} over steps
            <InfoTip term={primaryKey === 'reward' ? 'reward' : 'loss'} />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="#EAE4DC" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="step" tick={{ fill: '#948B80', fontSize: 11 }} stroke="#EAE4DC" />
              <YAxis tick={{ fill: '#948B80', fontSize: 11 }} stroke="#EAE4DC" width={44} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #EAE4DC', fontSize: 12 }} />
              <Line dataKey={primaryKey} name={primaryLabel} stroke="#FF6B1A" dot={false} strokeWidth={2} type="monotone" isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : running ? (
        <div className="flex items-center gap-2 text-sm text-ink-mute py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Waiting for the first metrics…
        </div>
      ) : null}

      {/* footer actions by status */}
      {running && (
        <Button variant="danger" icon={<Ban className="w-4 h-4" />} onClick={onCancel}>Cancel run</Button>
      )}

      {status === 'completed' && (
        <div className="space-y-3">
          <div className="rounded-xl bg-orange-soft/60 border border-orange/30 p-3 text-sm text-orange-ink flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{isDemo ? 'Demo finished — nothing was saved, but that’s how a real run looks.' : 'Done! Your fine-tuned model is ready to try.'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isDemo && (
              <Button variant="primary" icon={<MessageSquare className="w-4 h-4" />} onClick={onPlayground}>Try it in Playground</Button>
            )}
            <Button variant="outline" icon={<BarChart3 className="w-4 h-4" />} onClick={onAnalytics}>View analytics</Button>
          </div>
        </div>
      )}

      {lostContact && !TERMINAL.includes(status) && (
        <div className="rounded-xl bg-amber-soft/60 border border-amber/40 p-3 text-sm text-amber-ink">
          <div className="font-semibold flex items-center gap-1.5">
            <TriangleAlert className="w-4 h-4" /> Lost contact with the backend
          </div>
          <p className="mt-1 text-xs">
            The progress below is frozen at the last value received — it isn’t live, and the run may
            have already finished or failed. Check the backend is still running
            (<span className="font-mono">./START_UI.sh</span>); this clears itself the moment it answers again.
          </p>
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-xl bg-berry-soft/60 border border-berry/30 p-3 text-sm text-berry-ink">
          <div className="font-semibold flex items-center gap-1.5"><TriangleAlert className="w-4 h-4" /> Training failed</div>
          <p className="mt-1 font-mono text-xs break-words whitespace-pre-wrap">{error || 'Unknown error.'}</p>
        </div>
      )}

      {status === 'cancelled' && (
        <div className="rounded-xl bg-line-soft border border-line p-3 text-sm text-ink-soft">Run cancelled.</div>
      )}
    </Card>
  )
}

function MetricTile({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-raised px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-ink-mute flex items-center gap-1">{label}</div>
      <div className="font-mono text-lg text-ink leading-tight mt-0.5">{value}</div>
    </div>
  )
}
