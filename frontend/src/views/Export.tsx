import { useEffect, useRef, useState } from 'react'
import { Smartphone, Check, X, AlertTriangle, Download, Cpu } from 'lucide-react'
import { api, TrainedModel } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { cn, fmtNum } from '../lib/util'
import {
  Button, Card, Badge, Field, Select, EmptyState, Spinner, Progress, toast,
} from '../components/ui'

interface SizeRow { bits: number; size_gb: number; fits_tiers: string[]; fits_any: boolean }
interface Check { ok: boolean; label: string; detail: string }
interface Preflight {
  model: { id: string; base_model: string; params_b: number | null }
  machine: { arch: string; apple_silicon: boolean; ram_gb: number; free_disk_gb: number; mlx_installed: boolean }
  sizes: SizeRow[]
  requirements: { base_download_gb: number | null; merge_ram_gb: number | null; disk_needed_gb: number | null }
  checks: Check[]
  can_run: boolean
  blockers: string[]
}

function CheckRow({ c }: { c: Check }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {c.ok
        ? <Check className="w-4 h-4 text-orange shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 text-amber-ink shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{c.label}</div>
        <div className="text-xs text-ink-soft">{c.detail}</div>
      </div>
    </div>
  )
}

export default function Export() {
  const setView = useStore(s => s.setView)
  const dataVersion = useStore(s => s.dataVersion)
  const saved = useAsync<{ models: TrainedModel[] }>(() => api.models.saved(), [dataVersion])
  const models = saved.data?.models ?? []

  const [modelId, setModelId] = useState('')
  const [bits, setBits] = useState(4)
  const [pre, setPre] = useState<Preflight | null>(null)
  const [checking, setChecking] = useState(false)
  const [job, setJob] = useState<any>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { if (!modelId && models[0]) setModelId(models[0].id) }, [saved.data])

  useEffect(() => {
    if (!modelId) return
    let alive = true
    setChecking(true); setPre(null)
    api.export.preflight(modelId)
      .then(r => { if (alive) setPre(r) })
      .catch(e => { if (alive) toast(e.message, 'error') })
      .finally(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [modelId])

  // Export is a long local job; poll until it settles.
  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  async function start() {
    if (!pre?.can_run) return
    try {
      const r = await api.export.start(modelId, bits)
      setJob(r.job)
      if (poll.current) clearInterval(poll.current)
      poll.current = setInterval(async () => {
        try {
          const j = await api.export.job(r.job_id)
          setJob(j)
          if (j.status === 'complete' || j.status === 'failed') {
            if (poll.current) clearInterval(poll.current)
            toast(j.status === 'complete' ? 'Export finished.' : 'Export failed.',
              j.status === 'complete' ? 'ok' : 'error')
          }
        } catch { /* keep polling; the backend may just be busy */ }
      }, 2000)
    } catch (e: any) { toast(e.message, 'error') }
  }

  if (saved.loading) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>

  if (!models.length) {
    return (
      <div>
        <h1 className="font-display font-bold text-3xl text-ink">Export</h1>
        <p className="text-sm text-ink-soft mt-1 mb-6">
          Take a fine-tune out of Tinker and shrink it to run on a phone.
        </p>
        <Card className="card-pad">
          <EmptyState
            icon={<Smartphone className="w-6 h-6" />}
            title="Nothing to export yet"
            description="Once a training run finishes, its model shows up here and can be merged, quantized, and converted to MLX for on-device use."
            action={<Button onClick={() => setView('train')}>Train a model</Button>}
          />
        </Card>
      </div>
    )
  }

  const running = job && job.status === 'running'
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl text-ink">Export</h1>
        <p className="text-sm text-ink-soft mt-1">
          Merge your fine-tune into its base model, quantize it, and convert to MLX — the
          format Apple Silicon and iOS run natively.
        </p>
      </div>

      <Card className="card-pad space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Which model?">
            <Select value={modelId} onChange={e => { setModelId(e.target.value); setJob(null) }}>
              {models.map(m => <option key={m.id} value={m.id}>{m.id} · {m.base_model}</option>)}
            </Select>
          </Field>
          <Field label="Precision" hint="Fewer bits means a smaller file and some quality loss.">
            <Select value={String(bits)} onChange={e => setBits(Number(e.target.value))}>
              {[4, 6, 8, 16].map(b => <option key={b} value={b}>{b}-bit</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {checking && <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>}

      {pre && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="card-pad">
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-4 h-4 text-orange" />
              <h3 className="font-display font-bold text-ink">Will it fit on a phone?</h3>
            </div>
            {pre.model.params_b == null ? (
              <p className="text-sm text-berry-ink">
                Couldn’t work out the size of {pre.model.base_model}.
              </p>
            ) : (
              <div className="space-y-1.5">
                {pre.sizes.map(s => (
                  <div key={s.bits}
                    className={cn('flex items-center justify-between gap-3 rounded-xl px-3 py-2 border',
                      s.bits === bits ? 'border-orange bg-orange-soft/50' : 'border-line')}>
                    <span className="font-mono text-sm text-ink w-14">{s.bits}-bit</span>
                    <span className="font-mono text-sm text-ink-soft w-20">~{fmtNum(s.size_gb, 1)} GB</span>
                    <span className="flex-1 text-right">
                      {s.fits_any
                        ? <span className="text-xs text-ink-soft">{s.fits_tiers.length} of 3 iPhone tiers</span>
                        : <Badge tone="berry">too big for any iPhone</Badge>}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-ink-mute pt-1">
                  Sizes are the merged weights plus ~10% runtime headroom. iOS only lets an app
                  address part of physical RAM, so a 12 GB phone is not a 12 GB budget.
                </p>
              </div>
            )}
          </Card>

          <Card className="card-pad">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-orange" />
              <h3 className="font-display font-bold text-ink">Can this Mac do it?</h3>
            </div>
            <div className="divide-y divide-line-soft">
              {pre.checks.map(c => <CheckRow key={c.label} c={c} />)}
            </div>
            {pre.requirements.base_download_gb != null && (
              <p className="text-[11px] text-ink-mute mt-2">
                Merging downloads the full base model (~{fmtNum(pre.requirements.base_download_gb, 1)} GB)
                and holds it in memory. That step, not the quantizing, is what makes big models
                impossible on a small machine.
              </p>
            )}
          </Card>
        </div>
      )}

      {pre && (
        <Card className="card-pad space-y-3">
          {!pre.can_run ? (
            <div className="flex items-start gap-2.5">
              <X className="w-4 h-4 text-berry-ink shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-ink text-sm">
                  This machine can’t complete the export
                </div>
                <div className="text-xs text-ink-soft mt-0.5">
                  Blocked by: {pre.blockers.join(', ')}. Nothing is downloaded until this passes,
                  so no time is wasted finding out halfway through.
                </div>
              </div>
            </div>
          ) : (
            <>
              <Button icon={<Download className="w-4 h-4" />} loading={running}
                disabled={running} onClick={start}>
                {running ? 'Exporting…' : `Export as ${bits}-bit MLX`}
              </Button>
              {!pre.machine.mlx_installed && !running && (
                <p className="text-xs text-ink-mute">mlx-lm isn’t installed yet — the first export installs it.</p>
              )}
            </>
          )}

          {job && (
            <div className="rounded-xl2 border border-line bg-raised p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-ink">{job.step || 'Working'}</span>
                <Badge tone={job.status === 'failed' ? 'berry' : job.status === 'complete' ? 'orange' : 'neutral'}>
                  {job.status}
                </Badge>
              </div>
              <Progress value={job.progress ?? 0} />
              {job.message && (
                <p className="text-[11px] font-mono text-ink-soft break-words whitespace-pre-wrap">{job.message}</p>
              )}
              {job.output_path && (
                <p className="text-xs text-ink">
                  Saved to <span className="font-mono">{job.output_path}</span>
                  {job.size_gb ? ` (${fmtNum(job.size_gb, 2)} GB)` : ''}
                </p>
              )}
              {job.error && <p className="text-xs text-berry-ink whitespace-pre-wrap">{job.error}</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
