import { useEffect, useState } from 'react'
import { Feather, Sparkles, Trash2, Plus, Check, X, Database } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { cn, fmtInt } from '../lib/util'
import {
  Button, IconButton, Card, Badge, Field, Input, Textarea, Select,
  EmptyState, Spinner, toast,
} from '../components/ui'

interface Turn { role: string; content: string }
interface Seed { id: string; turns: Turn[]; note?: string; origin?: string }
interface SeedsData {
  name: string; description: string; seeds: Seed[]
  counts: { total: number; hand: number; expanded: number }
}

const BLANK: Turn[] = [{ role: 'user', content: '' }, { role: 'assistant', content: '' }]

/** One exchange, editable turn by turn. */
function SeedEditor({ turns, onChange }: { turns: Turn[]; onChange: (t: Turn[]) => void }) {
  return (
    <div className="space-y-2">
      {turns.map((t, i) => (
        <div key={i} className="flex gap-2">
          <span className={cn('w-20 shrink-0 pt-2 text-xs font-mono font-semibold',
            t.role === 'assistant' ? 'text-orange-ink' : 'text-ink-mute')}>
            {t.role === 'assistant' ? 'them' : 'you'}
          </span>
          <Textarea rows={2} className="flex-1" value={t.content}
            placeholder={t.role === 'assistant' ? 'what they say back…' : 'what someone says to them…'}
            onChange={e => onChange(turns.map((x, j) => j === i ? { ...x, content: e.target.value } : x))} />
          {turns.length > 2 && (
            <IconButton label="Remove turn" onClick={() => onChange(turns.filter((_, j) => j !== i))}>
              <X className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      ))}
      <Button size="xs" variant="ghost" icon={<Plus className="w-3.5 h-3.5" />}
        onClick={() => onChange([...turns,
          { role: turns[turns.length - 1].role === 'user' ? 'assistant' : 'user', content: '' }])}>
        Add a turn
      </Button>
    </div>
  )
}

/**
 * Write a character's voice, then expand it.
 *
 * No dataset on the Hub is your character — the only way a fine-tune sounds
 * like someone specific is if a person writes that voice down first. A teacher
 * model can multiply what it's shown, but it can't invent the thing being
 * multiplied, which is why the hand-written count is the number worth watching.
 */
export default function Voice() {
  const setView = useStore(s => s.setView)
  const bump = useStore(s => s.bump)
  const data = useAsync<SeedsData>(() => api.seeds.all(), [])
  const status = useAsync<any>(() => api.assistant.status(), [])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<Turn[]>(BLANK)
  const [editing, setEditing] = useState<string | null>(null)

  const [model, setModel] = useState('')
  const [count, setCount] = useState(5)
  const [hint, setHint] = useState('')
  const [candidates, setCandidates] = useState<Turn[][] | null>(null)
  const [rejected, setRejected] = useState<Set<number>>(new Set())
  const [expanding, setExpanding] = useState(false)

  useEffect(() => {
    if (data.data) { setName(data.data.name); setDescription(data.data.description) }
  }, [data.data])
  useEffect(() => {
    const ms: string[] = status.data?.models ?? []
    if (!model && ms.length) {
      // Prefer a small local instruct model: reasoning models spend their
      // output on thinking tokens and return nothing usable here.
      setModel(ms.find(m => m.startsWith('llama3.2')) ?? ms.find(m => !m.includes('cloud')) ?? ms[0])
    }
  }, [status.data])

  const seeds = data.data?.seeds ?? []
  const counts = data.data?.counts ?? { total: 0, hand: 0, expanded: 0 }

  async function savePersona() {
    try { await api.seeds.setPersona({ name, description }); toast('Saved.', 'ok') }
    catch (e: any) { toast(e.message, 'error') }
  }

  async function saveSeed() {
    const turns = draft.filter(t => t.content.trim())
    if (turns.length < 2) return toast('Write a message and a reply.', 'error')
    try {
      await api.seeds.upsert({ id: editing ?? undefined, turns })
      setDraft(BLANK); setEditing(null); data.reload()
      toast(editing ? 'Updated.' : 'Seed added.', 'ok')
    } catch (e: any) { toast(e.message, 'error') }
  }

  async function removeSeed(id: string) {
    try { await api.seeds.remove(id); data.reload() }
    catch (e: any) { toast(e.message, 'error') }
  }

  async function expand() {
    setExpanding(true); setCandidates(null); setRejected(new Set())
    try {
      const r = await api.seeds.expand({ count, model, topic_hint: hint })
      setCandidates(r.candidates.map((c: any) => c.turns))
      if (r.got < r.asked_for) toast(`Got ${r.got} of ${r.asked_for} — smaller models drift.`, 'info')
    } catch (e: any) { toast(e.message, 'error') } finally { setExpanding(false) }
  }

  async function keepCandidates() {
    const keep = (candidates ?? []).filter((_, i) => !rejected.has(i))
    if (!keep.length) return toast('Nothing kept.', 'info')
    try {
      const r = await api.seeds.accept({ candidates: keep.map(turns => ({ turns })) })
      setCandidates(null); data.reload()
      toast(`Kept ${r.added}.`, 'ok')
    } catch (e: any) { toast(e.message, 'error') }
  }

  async function makeDataset() {
    try {
      const r = await api.seeds.toDataset({ name: `${name} seeds` })
      bump()
      toast(`Created “${r.dataset.name}” — ${fmtInt(r.dataset.num_samples)} examples.`, 'ok')
      setView('data')
    } catch (e: any) { toast(e.message, 'error') }
  }

  if (data.loading) return <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl text-ink">Voice</h1>
        <p className="text-sm text-ink-soft mt-1">
          Write how your character actually talks, then let a local model multiply it.
          This is the part no dataset can give you.
        </p>
      </div>

      <Card className="card-pad space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Who are they?" className="sm:col-span-2"
            hint="Rhythm and restraint matter more than biography — say how they talk, not where they grew up.">
            <Input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Warm, funny, quick. Listens more than he talks. Asks instead of advising." />
          </Field>
        </div>
        <Button size="sm" variant="outline" onClick={savePersona}>Save character</Button>
      </Card>

      <Card className="card-pad space-y-4">
        <div className="flex items-center gap-2">
          <Feather className="w-4 h-4 text-orange" />
          <h3 className="font-display font-bold text-ink">
            {editing ? 'Edit exchange' : 'Write an exchange'}
          </h3>
        </div>
        <SeedEditor turns={draft} onChange={setDraft} />
        <div className="flex gap-2">
          <Button size="sm" onClick={saveSeed}>{editing ? 'Save changes' : 'Add seed'}</Button>
          {editing && (
            <Button size="sm" variant="ghost"
              onClick={() => { setDraft(BLANK); setEditing(null) }}>Cancel</Button>
          )}
        </div>
      </Card>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-display font-bold text-ink">
            {fmtInt(counts.total)} seeds
            <span className="text-sm font-sans font-normal text-ink-soft ml-2">
              {fmtInt(counts.hand)} written by you · {fmtInt(counts.expanded)} expanded
            </span>
          </h3>
          {counts.total > 0 && (
            <Button size="sm" variant="dark" icon={<Database className="w-4 h-4" />} onClick={makeDataset}>
              Make a dataset
            </Button>
          )}
        </div>

        {counts.hand > 0 && counts.hand < 10 && (
          <p className="text-xs text-amber-ink mb-3">
            {counts.hand} hand-written {counts.hand === 1 ? 'seed' : 'seeds'}. Expansion copies what
            it's shown, so aim for 20–50 before leaning on it — below that the teacher fills the gaps
            with its own generic voice.
          </p>
        )}

        {seeds.length === 0 ? (
          <Card className="card-pad">
            <EmptyState icon={<Feather className="w-6 h-6" />} title="No seeds yet"
              description="Write a handful of exchanges above that sound unmistakably like them. Short is fine — it's the rhythm that carries." />
          </Card>
        ) : (
          <div className="space-y-2">
            {seeds.map(s => (
              <Card key={s.id} className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  {s.turns.map((t, i) => (
                    <div key={i} className="text-xs">
                      <span className={cn('font-mono font-semibold',
                        t.role === 'assistant' ? 'text-orange-ink' : 'text-ink-mute')}>
                        {t.role === 'assistant' ? 'them' : 'you'}
                      </span>
                      <span className="text-ink-soft"> · {t.content.slice(0, 140)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.origin === 'expanded' && <Badge tone="neutral">expanded</Badge>}
                  <IconButton label="Edit"
                    onClick={() => { setDraft(s.turns); setEditing(s.id) }}>
                    <Feather className="w-4 h-4" />
                  </IconButton>
                  <IconButton label="Delete seed" onClick={() => removeSeed(s.id)}>
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="card-pad space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-orange" />
          <h3 className="font-display font-bold text-ink">Expand with a local model</h3>
        </div>

        {status.data?.available === false ? (
          <p className="text-sm text-berry-ink">
            Ollama isn’t running. Start it with <span className="font-mono">ollama serve</span>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Teacher model"
                hint="Small instruct models work best. Reasoning models spend their output thinking and return nothing.">
                <Select value={model} onChange={e => setModel(e.target.value)}>
                  {(status.data?.models ?? []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
              <Field label="How many?" hint="Generation is slow on a laptop — small batches.">
                <Input type="number" min={1} max={30} value={count}
                  onChange={e => setCount(Number(e.target.value) || 1)} />
              </Field>
              <Field label="Nudge the topics (optional)">
                <Input value={hint} onChange={e => setHint(e.target.value)}
                  placeholder="grief, small wins, 2am spirals" />
              </Field>
            </div>
            <Button size="sm" loading={expanding} disabled={counts.total < 3}
              icon={<Sparkles className="w-4 h-4" />} onClick={expand}>
              {counts.total < 3 ? 'Write 3 seeds first' : 'Generate candidates'}
            </Button>
          </>
        )}

        {candidates && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                {candidates.length - rejected.size} of {candidates.length} kept
              </span>
              <Button size="sm" variant="dark" icon={<Check className="w-4 h-4" />} onClick={keepCandidates}>
                Keep these
              </Button>
            </div>
            <p className="text-xs text-ink-mute">
              Read every one. A teacher drifts toward its own voice, and drift you don’t catch
              is what turns a character back into a generic assistant.
            </p>
            {candidates.map((turns, i) => {
              const off = rejected.has(i)
              return (
                <Card key={i} className={cn('p-3.5 flex items-start justify-between gap-3',
                  off && 'opacity-40')}>
                  <div className="min-w-0 space-y-1">
                    {turns.map((t, j) => (
                      <div key={j} className="text-xs">
                        <span className={cn('font-mono font-semibold',
                          t.role === 'assistant' ? 'text-orange-ink' : 'text-ink-mute')}>
                          {t.role === 'assistant' ? 'them' : 'you'}
                        </span>
                        <span className="text-ink-soft"> · {t.content.slice(0, 160)}</span>
                      </div>
                    ))}
                  </div>
                  <IconButton label={off ? 'Put back' : 'Discard'}
                    onClick={() => setRejected(s => {
                      const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n
                    })}>
                    {off ? <Plus className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </IconButton>
                </Card>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
