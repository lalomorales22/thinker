import { useEffect, useMemo, useState } from 'react'
import {
  Database, UploadCloud, PencilLine, DownloadCloud, Plus, Trash2, Eye,
  Rocket, Search, ArrowLeft, Heart, Download, X, FileJson,
} from 'lucide-react'
import { api, Dataset } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { InfoTip } from '../lib/glossary'
import { TRAINING_TYPES, fmtInt, relTime } from '../lib/util'
import {
  Button, IconButton, Card, Badge, Field, Input, Textarea, Select, Segmented,
  Progress, EmptyState, Spinner, Skeleton, Modal, toast,
} from '../components/ui'

// --- shared types -----------------------------------------------------------
type TT = 'sl' | 'dpo' | 'rl'
type Tone = 'neutral' | 'orange' | 'dark' | 'berry' | 'amber' | 'outline'

interface TemplateEntry {
  label: string
  help: string
  example: Record<string, string>
  also_accepts: string[]
}
type Templates = Record<string, TemplateEntry>

interface PreviewData { columns: string[]; rows: Record<string, unknown>[] }
interface HFSearchItem { name: string; description: string; downloads: number; likes: number; tags: string[] }
interface HFPopularItem { name: string; description: string; samples?: number; subset?: string }
interface HFPopular { sl: HFPopularItem[]; dpo: HFPopularItem[]; rl: HFPopularItem[] }
interface HFInfo {
  name: string; description: string; configs: string[]; splits: string[]
  features: Record<string, string>; num_rows: Record<string, number>
  field_paths?: string[]
}

// The fields each training type learns from (with a glossary term for each).
const TARGET_FIELDS: Record<TT, { key: string; term: string }[]> = {
  sl: [{ key: 'prompt', term: 'prompt' }, { key: 'completion', term: 'completion' }],
  dpo: [{ key: 'prompt', term: 'prompt' }, { key: 'chosen', term: 'chosen' }, { key: 'rejected', term: 'rejected' }],
  rl: [{ key: 'prompt', term: 'prompt' }, { key: 'reference', term: 'reference' }],
}

const TYPE_OPTIONS: { value: TT; label: string }[] = [
  { value: 'sl', label: 'Supervised' },
  { value: 'dpo', label: 'Preference' },
  { value: 'rl', label: 'Reinforcement' },
]

// Common column names for each target, used to auto-suggest a mapping.
const SUGGEST: Record<string, string[]> = {
  prompt: ['prompt', 'instruction', 'question', 'input', 'query', 'text', 'context'],
  completion: ['completion', 'response', 'answer', 'output', 'target', 'label'],
  chosen: ['chosen', 'preferred', 'response_j', 'positive', 'good'],
  rejected: ['rejected', 'response_k', 'negative', 'bad'],
  reference: ['reference', 'answer', 'solution', 'gold', 'output', 'completion', 'target'],
}
function guessColumn(target: string, cols: string[]): string {
  const cands = SUGGEST[target] || [target]
  const lower = cols.map(c => c.toLowerCase())
  for (const c of cands) { const i = lower.indexOf(c); if (i >= 0) return cols[i] }
  for (const c of cands) { const i = lower.findIndex(x => x.includes(c)); if (i >= 0) return cols[i] }
  return ''
}

function sourceMeta(s: string): { label: string; tone: Tone } {
  switch (s) {
    case 'upload': return { label: 'Uploaded', tone: 'neutral' }
    case 'huggingface': return { label: 'Hugging Face', tone: 'dark' }
    case 'generated': return { label: 'Hand-made', tone: 'orange' }
    case 'feedback': return { label: 'From feedback', tone: 'amber' }
    default: return { label: s || 'Dataset', tone: 'outline' }
  }
}
function ttLabel(tt: string): string { return TRAINING_TYPES[tt]?.label ?? (tt === 'any' ? 'Any type' : tt) }
function ttTone(tt: string): Tone {
  return ({ sl: 'orange', dpo: 'dark', rl: 'amber', multi_agent: 'berry' } as Record<string, Tone>)[tt] ?? 'neutral'
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

// --- reusable bits ----------------------------------------------------------
function TypePicker({ value, onChange, templates }: { value: TT; onChange: (v: TT) => void; templates: Templates | null }) {
  return (
    <div>
      <Segmented value={value} onChange={onChange} options={TYPE_OPTIONS} />
      <p className="hint mt-2 flex items-start gap-1.5">
        <InfoTip term={value} />
        <span>{templates?.[value]?.help || TRAINING_TYPES[value]?.short}</span>
      </p>
    </div>
  )
}

function ExampleShape({ tpl }: { tpl?: TemplateEntry }) {
  if (!tpl) return null
  return (
    <div className="mt-1">
      <p className="text-xs font-semibold text-ink-soft mb-1.5">Your rows should look like this</p>
      <pre className="font-mono text-xs bg-charcoal text-white/90 rounded-xl p-3 overflow-x-auto whitespace-pre">
        {JSON.stringify(tpl.example, null, 2)}
      </pre>
      {tpl.also_accepts?.length > 0 && (
        <p className="hint mt-1.5">Also accepts: {tpl.also_accepts.join(' · ')}</p>
      )}
    </div>
  )
}

function PreviewTable({ columns, rows }: PreviewData) {
  if (!rows.length) return <p className="text-sm text-ink-mute">No rows to show.</p>
  const cols = columns.length ? columns : Object.keys(rows[0] ?? {})
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-raised">
            {cols.map(c => (
              <th key={c} className="text-left font-semibold text-ink-soft px-3 py-2 border-b border-line whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {cols.map(c => {
                const val = cell(r[c])
                return (
                  <td key={c} className="px-3 py-2 border-b border-line max-w-[280px]">
                    <div className="line-clamp-4 whitespace-pre-wrap break-words text-ink" title={val}>
                      {val || <span className="text-ink-mute">—</span>}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// --- dataset card -----------------------------------------------------------
function DatasetCard({ ds, onPreview, onTrain, onDelete }:
  { ds: Dataset; onPreview: () => void; onTrain: () => void; onDelete: () => void }) {
  const src = sourceMeta(ds.source)
  return (
    <Card hover className="card-pad flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-lg text-ink truncate">{ds.name}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge tone={src.tone}>{src.label}</Badge>
            <Badge tone={ttTone(ds.training_type)}>{ttLabel(ds.training_type)}</Badge>
            <span className="text-sm text-ink-soft">{fmtInt(ds.num_samples)} examples</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {ds.schema_ok
            ? <Badge tone="orange">Ready to train</Badge>
            : <span className="inline-flex items-center gap-1">
                <Badge tone="berry">Needs fixing</Badge>
                <InfoTip text={ds.schema_notes?.[0] || 'This dataset needs fixing before you can train on it.'} />
              </span>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-ink-mute">Added {relTime(ds.created_at) || 'recently'}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Eye className="w-4 h-4" />} onClick={onPreview}>Preview</Button>
          <Button size="sm" variant="outline" icon={<Rocket className="w-4 h-4" />} onClick={onTrain}
            disabled={!ds.schema_ok} title={ds.schema_ok ? undefined : 'Fix the schema before training'}>Use to train</Button>
          <IconButton label="Delete dataset" onClick={onDelete}><Trash2 className="w-4 h-4" /></IconButton>
        </div>
      </div>
    </Card>
  )
}

// --- preview modal ----------------------------------------------------------
function PreviewModal({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const { data, loading, error } = useAsync<PreviewData>(() => api.datasets.preview(id, 8), [id])
  return (
    <Modal open onClose={onClose} wide title="Dataset preview" subtitle={name}>
      {loading && <div className="flex justify-center py-10"><Spinner className="w-6 h-6" /></div>}
      {error && <p className="text-sm text-berry-ink">{error}</p>}
      {data && !loading && <PreviewTable columns={data.columns || []} rows={data.rows || []} />}
    </Modal>
  )
}

// --- upload modal -----------------------------------------------------------
function UploadModal({ templates, onClose }: { templates: Templates | null; onClose: () => void }) {
  const bump = useStore(s => s.bump)
  const [name, setName] = useState('')
  const [type, setType] = useState<TT>('sl')
  const [file, setFile] = useState<File | null>(null)
  const [splits, setSplits] = useState({ train: 80, val: 10, test: 10 })
  const [busy, setBusy] = useState(false)

  const inferFormat = (fname: string): 'jsonl' | 'json' | 'csv' => {
    const l = fname.toLowerCase()
    if (l.endsWith('.csv')) return 'csv'
    if (l.endsWith('.json')) return 'json'
    return 'jsonl'
  }
  const sum = splits.train + splits.val + splits.test

  async function submit() {
    if (!file) return toast('Choose a file first.', 'error')
    if (!name.trim()) return toast('Give your dataset a name.', 'error')
    if (sum !== 100) return toast(`Splits must add up to 100% (they add up to ${sum}%).`, 'error')
    const form = new FormData()
    form.append('file', file)
    form.append('name', name.trim())
    form.append('training_type', type)
    form.append('format', inferFormat(file.name))
    form.append('train_split', String(splits.train))
    form.append('val_split', String(splits.val))
    form.append('test_split', String(splits.test))
    setBusy(true)
    try {
      await api.datasets.upload(form)
      bump(); toast('Dataset uploaded.', 'ok'); onClose()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} wide title="Upload a file" subtitle="Bring a .jsonl, .json, or .csv of examples."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button icon={<UploadCloud className="w-4 h-4" />} loading={busy} onClick={submit}>Upload</Button>
      </>}>
      <div className="space-y-5">
        <Field label="Dataset name">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My support replies" />
        </Field>

        <Field label="What are you teaching?">
          <TypePicker value={type} onChange={setType} templates={templates} />
        </Field>

        <ExampleShape tpl={templates?.[type]} />

        <Field label="File" hint="Accepted: .jsonl (one JSON object per line), .json, or .csv.">
          <input type="file" accept=".jsonl,.json,.csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-soft cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-charcoal file:text-white file:px-3 file:py-2 file:text-sm file:font-semibold" />
          {file && <p className="hint mt-1.5 flex items-center gap-1"><FileJson className="w-3.5 h-3.5" /> {file.name}</p>}
        </Field>

        <Field label="Train / validation / test split" term="split"
          hint={sum !== 100 ? `These add up to ${sum}% — they need to make 100%.` : 'Most for training, a little held back to check the model isn’t just memorizing.'}>
          <div className="grid grid-cols-3 gap-3">
            {(['train', 'val', 'test'] as const).map(k => (
              <div key={k}>
                <Input type="number" min={0} max={100} value={splits[k]}
                  onChange={e => setSplits(s => ({ ...s, [k]: Number(e.target.value) || 0 }))} />
                <p className="text-xs text-ink-mute mt-1 capitalize">{k === 'val' ? 'validation' : k} %</p>
              </div>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

// --- create-by-hand modal ---------------------------------------------------
function CreateModal({ templates, onClose }: { templates: Templates | null; onClose: () => void }) {
  const bump = useStore(s => s.bump)
  const [name, setName] = useState('')
  const [type, setType] = useState<TT>('sl')
  const [rows, setRows] = useState<Record<string, string>[]>([{}])
  const [busy, setBusy] = useState(false)

  const fields = TARGET_FIELDS[type]
  const blank = useMemo(() => Object.fromEntries(fields.map(f => [f.key, ''])), [type])

  // Prefill one example whenever the type (or its template) changes.
  useEffect(() => {
    const ex = templates?.[type]?.example
    setRows([ex ? fields.reduce((a, f) => ({ ...a, [f.key]: String(ex[f.key] ?? '') }), {}) : { ...blank }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, templates])

  const update = (i: number, key: string, v: string) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: v } : r))

  async function submit() {
    if (!name.trim()) return toast('Give your dataset a name.', 'error')
    const kept = rows.filter(r => fields.every(f => (r[f.key] || '').trim() !== ''))
    if (!kept.length) return toast('Add at least one example with every field filled in.', 'error')
    setBusy(true)
    try {
      await api.datasets.create({ name: name.trim(), training_type: type, rows: kept })
      bump(); toast(`Created a dataset with ${kept.length} example${kept.length === 1 ? '' : 's'}.`, 'ok'); onClose()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} wide title="Create by hand" subtitle="Just type your examples — no file needed."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button icon={<PencilLine className="w-4 h-4" />} loading={busy} onClick={submit}>Create dataset</Button>
      </>}>
      <div className="space-y-5">
        <Field label="Dataset name">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="My first examples" />
        </Field>

        <Field label="What are you teaching?">
          <TypePicker value={type} onChange={setType} templates={templates} />
        </Field>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <Card key={i} className="p-4 bg-raised">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-mute">Example {i + 1}</span>
                {rows.length > 1 && (
                  <IconButton label="Remove example" onClick={() => setRows(rs => rs.filter((_, idx) => idx !== i))}>
                    <X className="w-4 h-4" />
                  </IconButton>
                )}
              </div>
              <div className="space-y-3">
                {fields.map(f => (
                  <Field key={f.key} term={f.term} label={<span className="capitalize">{f.key}</span>}>
                    <Textarea rows={f.key === 'prompt' ? 2 : 3} value={row[f.key] || ''}
                      onChange={e => update(i, f.key, e.target.value)}
                      placeholder={String(templates?.[type]?.example?.[f.key] ?? `Type the ${f.key}…`)} />
                  </Field>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <Button variant="soft" size="sm" icon={<Plus className="w-4 h-4" />}
          onClick={() => setRows(rs => [...rs, { ...blank }])}>Add example</Button>
      </div>
    </Modal>
  )
}

// --- hugging face: configure a chosen dataset -------------------------------
function HFConfig({ name, presetSubset, onBack, onClose }:
  { name: string; presetSubset?: string; onBack: () => void; onClose: () => void }) {
  const bump = useStore(s => s.bump)
  const { data: info, loading: infoLoading, error: infoError } = useAsync<HFInfo>(() => api.hf.info(name), [name])

  const [type, setType] = useState<TT>('sl')
  const [split, setSplit] = useState('train')
  const [subset, setSubset] = useState<string>(presetSubset || '')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [maxSamples, setMaxSamples] = useState(1000)
  const [datasetName, setDatasetName] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)

  const cols = useMemo(() => {
    // Prefer nested field paths (e.g. "message.content") so trace-style datasets
    // can be mapped without exporting; fall back to top-level columns.
    const paths = info?.field_paths?.length ? info.field_paths : Object.keys(info?.features || {})
    return paths.length ? paths : (preview?.columns || [])
  }, [info, preview])

  // Apply sensible defaults once info arrives.
  useEffect(() => {
    if (!info) return
    setSplit(prev => info.splits?.includes(prev) ? prev : (info.splits?.includes('train') ? 'train' : info.splits?.[0] || 'train'))
    setSubset(prev => prev || presetSubset || info.configs?.[0] || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  // Auto-suggest a column for each target field of the chosen type.
  useEffect(() => {
    if (!cols.length) return
    setMapping(TARGET_FIELDS[type].reduce((a, f) => ({ ...a, [f.key]: guessColumn(f.key, cols) }), {}))
  }, [type, cols])

  const buildMappings = () =>
    TARGET_FIELDS[type].map(f => ({ source_field: mapping[f.key], target_field: f.key }))
      .filter(m => m.source_field)

  async function doPreview() {
    setPreviewing(true)
    try {
      const res = await api.hf.preview({ dataset_name: name, split, subset: subset || undefined, num_samples: 5 })
      setPreview({ columns: res.columns || [], rows: res.rows || [] })
    } catch (e: any) { toast(e.message, 'error') } finally { setPreviewing(false) }
  }

  async function doImport() {
    setImporting(true)
    try {
      const res = await api.hf.import({
        dataset_name: name, split, subset: subset || undefined, training_type: type,
        field_mappings: buildMappings(), max_samples: Math.max(1, maxSamples), name: datasetName.trim() || undefined,
      })
      bump()
      toast(`Imported ${fmtInt(res?.dataset?.num_samples)} examples — it’s ready to train.`, 'ok')
      onClose()
    } catch (e: any) { toast(e.message, 'error') } finally { setImporting(false) }
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-ink">
        <ArrowLeft className="w-4 h-4" /> Choose a different dataset
      </button>

      <div>
        <h3 className="font-display font-bold text-lg text-ink break-all">{name}</h3>
        {infoLoading && <div className="flex items-center gap-2 text-sm text-ink-mute mt-1"><Spinner className="w-4 h-4" /> Loading details…</div>}
        {infoError && <p className="text-sm text-berry-ink mt-1">{infoError}</p>}
        {info?.description && <p className="text-sm text-ink-soft mt-1 line-clamp-3">{info.description}</p>}
      </div>

      {info && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Split" term="split"
              hint={info.num_rows?.[split] ? `${fmtInt(info.num_rows[split])} rows` : undefined}>
              <Select value={split} onChange={e => setSplit(e.target.value)}>
                {(info.splits.length ? info.splits : ['train']).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            {info.configs?.length > 0 && (
              <Field label="Subset" hint="Some datasets ship several configurations.">
                <Select value={subset} onChange={e => setSubset(e.target.value)}>
                  {info.configs.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            )}
          </div>

          <Field label="What are you teaching?">
            <TypePicker value={type} onChange={setType} templates={null} />
          </Field>

          <div>
            <p className="label mb-1">Map columns to fields</p>
            <p className="hint mb-2 mt-0">Nested fields work too — e.g. <code className="text-ink">message.content</code> for trace-style datasets.</p>
            <div className="space-y-3">
              {TARGET_FIELDS[type].map(f => (
                <div key={f.key} className="grid grid-cols-[7rem,1fr] items-center gap-3">
                  <span className="text-sm font-semibold text-ink flex items-center gap-1 capitalize">
                    {f.key}<InfoTip term={f.term} />
                  </span>
                  <Select value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}>
                    <option value="">— none —</option>
                    {cols.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            {!cols.length && <p className="hint mt-2">Run a preview to discover this dataset’s columns.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="How many examples?" hint="We stream just this many — no giant download.">
              <Input type="number" min={1} value={maxSamples}
                onChange={e => setMaxSamples(Number(e.target.value) || 1)} />
            </Field>
            <Field label="Name it (optional)">
              <Input value={datasetName} onChange={e => setDatasetName(e.target.value)} placeholder={name.split('/').pop()} />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<Eye className="w-4 h-4" />} loading={previewing} onClick={doPreview}>Preview</Button>
            <Button icon={<DownloadCloud className="w-4 h-4" />} loading={importing} onClick={doImport}>Import</Button>
          </div>

          {importing && <Progress value={100} className="animate-pulse" />}
          {preview && (
            <div>
              <p className="label mb-2">First rows</p>
              <PreviewTable columns={preview.columns} rows={preview.rows} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- hugging face: browse + search ------------------------------------------
/** Verdict from the backend on whether a dataset can be trained on as-is. */
interface Fit {
  status: 'ready' | 'partial' | 'needs_mapping' | 'unknown'
  training_type?: string | null
  columns?: string[]
  also_fits?: string[]
  detail?: string
  split?: string
  subset?: string | null
}
interface RecDataset { name: string; why: string; subset?: string; fit: Fit }
interface RecGoal { goal: string; training_type: string; datasets: RecDataset[] }

/**
 * The point of this badge: say plainly whether you can press import and train,
 * or whether you're in for a field-mapping session first.
 */
function FitBadge({ fit }: { fit?: Fit }) {
  if (!fit) return <Badge tone="neutral">checking…</Badge>
  switch (fit.status) {
    case 'ready':
      return <Badge tone="orange">Ready · {ttLabel(fit.training_type || '')}</Badge>
    case 'partial':
      return <Badge tone="amber">Partly usable</Badge>
    case 'needs_mapping':
      return <Badge tone="amber">Needs field mapping</Badge>
    default:
      return <Badge tone="neutral">Couldn’t check</Badge>
  }
}

function FitDetail({ fit }: { fit?: Fit }) {
  if (!fit) return null
  return (
    <>
      {fit.detail && <p className="text-[11px] text-ink-mute mt-1.5">{fit.detail}</p>}
      {!!fit.columns?.length && (
        <p className="text-[11px] text-ink-mute mt-1 font-mono truncate">
          {fit.columns.slice(0, 5).join(' · ')}
        </p>
      )}
    </>
  )
}

function HFBrowse({ onSelect }: { onSelect: (name: string, subset?: string) => void }) {
  const recommended = useAsync<{ goals: RecGoal[] }>(() => api.hf.recommended(), [])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<HFSearchItem[] | null>(null)
  const [searching, setSearching] = useState(false)
  // Fit verdicts arrive after the results, so cards render instantly and fill in.
  const [fits, setFits] = useState<Record<string, Fit>>({})

  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (!q.trim()) { setResults(null); return }
    setSearching(true)
    setFits({})
    try {
      const res = await api.hf.search(q.trim(), 12)
      const items: HFSearchItem[] = res.datasets || []
      setResults(items)
      if (items.length) {
        // Deliberately not awaited with the search: checking fit hits the HF
        // viewer once per dataset, and results shouldn't wait on it.
        api.hf.fit(items.map(i => i.name))
          .then(r => setFits(r.fits || {}))
          .catch(() => { /* badges just stay as "couldn't check" */ })
      }
    } catch (err: any) { toast(err.message, 'error') } finally { setSearching(false) }
  }

  const ResultCard = ({ item }: { item: HFSearchItem }) => {
    const fit = fits[item.name]
    return (
      <button onClick={() => onSelect(item.name, fit?.subset || undefined)}
        className="card card-pad text-left w-full hover:shadow-raised transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-ink break-all">{item.name}</div>
          <span className="shrink-0"><FitBadge fit={fit} /></span>
        </div>
        <p className="text-sm text-ink-soft mt-1 line-clamp-2">{item.description}</p>
        <FitDetail fit={fit} />
        <div className="flex items-center gap-3 mt-2 text-xs text-ink-mute">
          <span className="inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> {fmtInt(item.downloads)}</span>
          <span className="inline-flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {fmtInt(item.likes)}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-5">
      <form onSubmit={search} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-mute absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={e => setQ(e.target.value)} className="pl-9"
            placeholder="Search Hugging Face datasets…" />
        </div>
        <Button type="submit" loading={searching}>Search</Button>
      </form>

      {results ? (
        results.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map(r => <ResultCard key={r.name} item={r} />)}
          </div>
        ) : <p className="text-sm text-ink-mute">No datasets matched “{q}”. Try a different search.</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-ink-soft">
            Not sure what to pick? Start from what you want the model to do — every
            suggestion below was just checked against Hugging Face, so the badge tells
            you whether it will train as-is.
          </p>

          {recommended.loading && <div className="flex justify-center py-8"><Spinner className="w-6 h-6" /></div>}
          {recommended.error && <p className="text-sm text-berry-ink">{recommended.error}</p>}

          {recommended.data?.goals?.map(g => (
            <div key={g.goal}>
              <div className="flex items-center gap-1.5 mb-2">
                <h4 className="font-display font-bold text-ink">{g.goal}</h4>
                <InfoTip term={g.training_type} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.datasets.map(d => (
                  <button key={d.name} onClick={() => onSelect(d.name, d.fit?.subset || d.subset)}
                    className="card card-pad text-left w-full hover:shadow-raised transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-ink break-all">{d.name}</div>
                      <span className="shrink-0"><FitBadge fit={d.fit} /></span>
                    </div>
                    <p className="text-sm text-ink-soft mt-1">{d.why}</p>
                    <FitDetail fit={d.fit} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- hugging face modal (wrapper) -------------------------------------------
function HFModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<{ name: string; subset?: string } | null>(null)
  return (
    <Modal open onClose={onClose} wide title="Import from Hugging Face"
      subtitle="Pull real examples from the Hub — they land in your list, ready to train.">
      {selected
        ? <HFConfig key={selected.name} name={selected.name} presetSubset={selected.subset}
            onBack={() => setSelected(null)} onClose={onClose} />
        : <HFBrowse onSelect={(name, subset) => setSelected({ name, subset })} />}
    </Modal>
  )
}

// --- main view --------------------------------------------------------------
export default function Data() {
  const dataVersion = useStore(s => s.dataVersion)
  const bump = useStore(s => s.bump)
  const setView = useStore(s => s.setView)
  const setPendingConfig = useStore(s => s.setPendingConfig)

  const { data, loading, error } = useAsync<{ datasets: Dataset[] }>(() => api.datasets.list(), [dataVersion])
  const { data: templates } = useAsync<Templates>(() => api.datasets.templates(), [])

  const [modal, setModal] = useState<null | 'upload' | 'create' | 'hf'>(null)
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)

  const datasets = data?.datasets ?? []

  async function remove(ds: Dataset) {
    if (!window.confirm(`Delete “${ds.name}”? This can’t be undone.`)) return
    try {
      await api.datasets.remove(ds.id)
      bump(); toast('Dataset deleted.', 'ok')
    } catch (e: any) { toast(e.message, 'error') }
  }

  function useToTrain(ds: Dataset) {
    setPendingConfig({ dataset_id: ds.id, training_type: ds.training_type })
    setView('train')
    toast('Picked up your dataset — finish setting up your run.', 'info')
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Data</h1>
          <p className="text-ink-soft mt-1">The examples your model learns from.</p>
        </div>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button size="lg" icon={<UploadCloud className="w-4 h-4" />} onClick={() => setModal('upload')}>Upload a file</Button>
        <Button size="lg" variant="dark" icon={<PencilLine className="w-4 h-4" />} onClick={() => setModal('create')}>Create by hand</Button>
        <Button size="lg" variant="outline" icon={<DownloadCloud className="w-4 h-4" />} onClick={() => setModal('hf')}>Import from Hugging Face</Button>
      </div>

      {/* List */}
      {loading && !data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl2" />)}
        </div>
      )}

      {error && !loading && (
        <Card className="card-pad">
          <p className="text-sm text-berry-ink">Couldn’t load your datasets: {error}</p>
        </Card>
      )}

      {data && !datasets.length && (
        <Card>
          <EmptyState icon={<Database className="w-7 h-7" />}
            title="No data yet"
            description="A dataset is just a set of examples. Upload a file, type a few by hand, or import one from Hugging Face to get started."
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button icon={<UploadCloud className="w-4 h-4" />} onClick={() => setModal('upload')}>Upload a file</Button>
              <Button variant="outline" icon={<PencilLine className="w-4 h-4" />} onClick={() => setModal('create')}>Create by hand</Button>
            </div>} />
        </Card>
      )}

      {datasets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {datasets.map(ds => (
            <DatasetCard key={ds.id} ds={ds}
              onPreview={() => setPreview({ id: ds.id, name: ds.name })}
              onTrain={() => useToTrain(ds)}
              onDelete={() => remove(ds)} />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal === 'upload' && <UploadModal templates={templates} onClose={() => setModal(null)} />}
      {modal === 'create' && <CreateModal templates={templates} onClose={() => setModal(null)} />}
      {modal === 'hf' && <HFModal onClose={() => setModal(null)} />}
      {preview && <PreviewModal id={preview.id} name={preview.name} onClose={() => setPreview(null)} />}
    </div>
  )
}
