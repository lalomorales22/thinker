import { useEffect, useRef, useState } from 'react'
import { MessageSquare, GitCompare, ThumbsUp, ThumbsDown, Send, Database, KeyRound, Sparkles } from 'lucide-react'
import { api, CatalogModel, TrainedModel } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import { Button, Card, Field, Select, Textarea, Segmented, Spinner, Skeleton, EmptyState, Badge, toast } from '../components/ui'
import { InfoTip } from '../lib/glossary'
import { cn } from '../lib/util'

type Mode = 'chat' | 'compare'
interface ChatMsg { role: 'user' | 'assistant'; content: string; prompt?: string }

// "Qwen/Qwen3.5-4B" -> "Qwen3.5-4B"
const short = (s?: string | null) => (s || '').split('/').pop() || s || ''
const typeLabel = (t?: string) => (t || '').toUpperCase()

export default function Playground() {
  const apiKey = useStore((s) => s.apiKey)
  const bump = useStore((s) => s.bump)
  const dataVersion = useStore((s) => s.dataVersion)

  const saved = useAsync(() => api.models.saved(), [dataVersion])
  const catalog = useAsync(() => api.models.catalog(), [])
  const feedback = useAsync(() => api.chat.feedbackList(), [dataVersion])

  const trainedModels: TrainedModel[] = saved.data?.models ?? []
  const recommendedIds: string[] = catalog.data?.recommended ?? []
  const allCatalog: CatalogModel[] = catalog.data?.models ?? []
  const baseModels = allCatalog.filter((m) => m.recommended || recommendedIds.includes(m.id))

  const [mode, setMode] = useState<Mode>('chat')
  const [temperature, setTemperature] = useState(0.7)

  // --- Chat state -----------------------------------------------------------
  const [chatModel, setChatModel] = useState('')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [rated, setRated] = useState<Record<number, 'up' | 'down'>>({})
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [betterText, setBetterText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // --- Compare state --------------------------------------------------------
  const [cmpBase, setCmpBase] = useState('')
  const [cmpTrained, setCmpTrained] = useState('')
  const [cmpPrompt, setCmpPrompt] = useState('')
  const [cmpResult, setCmpResult] = useState<{ base: string; tuned: string } | null>(null)
  const [comparing, setComparing] = useState(false)

  // Pick sensible defaults once the catalog / saved models arrive.
  useEffect(() => {
    if (chatModel) return
    const def = catalog.data?.recommended_default
    if (def) setChatModel(def)
    else if (baseModels[0]) setChatModel(baseModels[0].id)
    // eslint-disable-next-line
  }, [catalog.data])
  useEffect(() => {
    if (!cmpBase && catalog.data?.recommended_default) setCmpBase(catalog.data.recommended_default)
    // eslint-disable-next-line
  }, [catalog.data])
  useEffect(() => {
    if (!cmpTrained && trainedModels[0]) setCmpTrained(trainedModels[0].sampler_path || trainedModels[0].id)
    // eslint-disable-next-line
  }, [saved.data])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const count: number = feedback.data?.count ?? 0

  // --- Actions --------------------------------------------------------------
  async function send() {
    const text = draft.trim()
    if (!text || !chatModel || sending || !apiKey) return
    const next = [...messages, { role: 'user' as const, content: text }]
    setMessages(next)
    setDraft('')
    setSending(true)
    try {
      const payload = next.map((m) => ({ role: m.role, content: m.content }))
      const res = await api.chat.message({ model: chatModel, messages: payload, temperature })
      setMessages((m) => [...m, { role: 'assistant', content: res.response ?? '', prompt: text }])
    } catch (e: any) {
      toast(e.message || 'Generation failed', 'error')
    } finally {
      setSending(false)
    }
  }

  async function submitBetter(idx: number) {
    const msg = messages[idx]
    const better = betterText.trim()
    if (!msg || !better) return
    try {
      await api.chat.feedback({ prompt: msg.prompt || '', chosen: better, rejected: msg.content })
      setRated((r) => ({ ...r, [idx]: 'down' }))
      setOpenIdx(null)
      setBetterText('')
      toast('Saved — your better answer is now preference data', 'ok')
      feedback.reload().catch(() => {})
      bump()
    } catch (e: any) {
      toast(e.message || 'Could not save feedback', 'error')
    }
  }

  function thumbUp(idx: number) {
    setRated((r) => ({ ...r, [idx]: 'up' }))
    setOpenIdx(null)
    toast('Glad it helped — thumbs up noted', 'info')
  }

  async function runCompare() {
    if (!cmpBase || !cmpTrained || !cmpPrompt.trim() || comparing || !apiKey) return
    setComparing(true)
    setCmpResult(null)
    try {
      const res = await api.chat.compare({ base_model: cmpBase, trained_model: cmpTrained, prompt: cmpPrompt })
      setCmpResult({ base: res.base?.response ?? '', tuned: res.tuned?.response ?? '' })
    } catch (e: any) {
      toast(e.message || 'Comparison failed', 'error')
    } finally {
      setComparing(false)
    }
  }

  async function pickBetter(which: 'base' | 'tuned') {
    if (!cmpResult) return
    const chosen = which === 'base' ? cmpResult.base : cmpResult.tuned
    const rejected = which === 'base' ? cmpResult.tuned : cmpResult.base
    try {
      await api.chat.feedback({ prompt: cmpPrompt, chosen, rejected })
      toast('Preference saved — great DPO data', 'ok')
      feedback.reload().catch(() => {})
      bump()
    } catch (e: any) {
      toast(e.message || 'Could not save feedback', 'error')
    }
  }

  const [making, setMaking] = useState(false)
  async function toDataset() {
    if (count < 1 || making) return
    setMaking(true)
    try {
      await api.chat.feedbackToDataset('playground-preferences')
      toast('Created dataset "playground-preferences" — train it with DPO from Train', 'ok')
      bump()
    } catch (e: any) {
      toast(e.message || 'Could not build dataset', 'error')
    } finally {
      setMaking(false)
    }
  }

  const modelsLoading = catalog.loading || saved.loading
  const canSend = !!apiKey && !!chatModel && !!draft.trim() && !sending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-3xl text-ink">Playground</h1>
        <p className="text-ink-soft mt-1 max-w-2xl">
          Chat with a model, compare a base model against one you tuned, and turn your ratings into training data.
        </p>
      </div>

      {/* No-key notice */}
      {!apiKey && (
        <div className="card card-pad flex items-start gap-3 border-orange/30 bg-orange-soft/50">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-orange-soft text-orange-ink flex items-center justify-center">
            <KeyRound className="w-4.5 h-4.5" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-ink">Chatting needs a Tinker key</p>
            <p className="text-ink-soft mt-0.5">
              Add your key in Settings (the gear at the bottom-left) to send messages. You can still look around and build a dataset from any ratings you already have.
            </p>
          </div>
        </div>
      )}

      {/* Feedback loop bar */}
      <Card className="card-pad">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-orange-soft text-orange-ink flex items-center justify-center">
              <ThumbsUp className="w-5 h-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg text-ink flex items-center gap-1.5">
                {feedback.loading && !feedback.data ? (
                  <Skeleton className="h-6 w-40" />
                ) : (
                  <>
                    {count} rating{count === 1 ? '' : 's'} collected
                    <InfoTip term="dpo" />
                  </>
                )}
              </div>
              <p className="text-sm text-ink-soft mt-0.5 max-w-xl">
                Your 👍/👎 and comparisons become preference pairs. Bundle them into a dataset and train with DPO — that closes the RLHF loop.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button variant="dark" icon={<Database className="w-4 h-4" />} loading={making} disabled={count < 1 || making} onClick={toDataset}>
              Turn into a preference dataset
            </Button>
            {count < 1 && !feedback.loading && (
              <span className="text-xs text-ink-mute">Rate a few replies first.</span>
            )}
          </div>
        </div>
      </Card>

      {/* Mode + temperature */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'chat', label: <span className="inline-flex items-center gap-1.5"><MessageSquare className="w-4 h-4" /> Chat</span> },
            { value: 'compare', label: <span className="inline-flex items-center gap-1.5"><GitCompare className="w-4 h-4" /> Compare</span> },
          ]}
        />
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold text-ink-soft flex items-center gap-1">
            Temperature <InfoTip term="temperature" />
          </span>
          <input
            type="range" min={0} max={1} step={0.1} value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            aria-label="Temperature"
            className="accent-orange w-36 cursor-pointer"
          />
          <span className="font-mono text-sm text-ink-soft w-8 text-right">{temperature.toFixed(1)}</span>
        </div>
      </div>

      {/* ---- CHAT ---- */}
      {mode === 'chat' && (
        <Card className="flex flex-col">
          <div className="p-5 border-b border-line">
            <Field label="Model">
              {modelsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                  <option value="" disabled>Choose a model…</option>
                  {trainedModels.length > 0 && (
                    <optgroup label="Your trained models">
                      {trainedModels.map((m) => (
                        <option key={m.id} value={m.sampler_path || m.id}>
                          {short(m.base_model)} · {typeLabel(m.training_type)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Base models">
                    {baseModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                </Select>
              )}
            </Field>
          </div>

          {/* Thread */}
          <div className="min-h-[280px] max-h-[52vh] overflow-y-auto px-5 py-5 space-y-4">
            {messages.length === 0 && !sending ? (
              <EmptyState
                icon={<MessageSquare className="w-6 h-6" />}
                title="Say hello"
                description="Send a message to see how this model responds. Rate each reply to build training data as you go."
              />
            ) : (
              messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-xl2 rounded-tr-md bg-orange text-white px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex flex-col items-start gap-1.5">
                    <div className="max-w-[85%] rounded-xl2 rounded-tl-md bg-paper border border-line px-4 py-2.5 text-sm text-ink whitespace-pre-wrap leading-relaxed">
                      {m.content || <span className="text-ink-mute italic">No response.</span>}
                    </div>
                    {/* Rating controls */}
                    <div className="flex items-center gap-2 pl-1">
                      {rated[i] === 'up' ? (
                        <span className="text-xs text-orange-ink font-semibold inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> Marked helpful</span>
                      ) : rated[i] === 'down' ? (
                        <span className="text-xs text-ink-mute font-semibold inline-flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5" /> Better answer saved</span>
                      ) : (
                        <>
                          <button
                            onClick={() => thumbUp(i)}
                            className="btn btn-ghost btn-xs" aria-label="Good reply"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" /> Good
                          </button>
                          <button
                            onClick={() => { setOpenIdx(openIdx === i ? null : i); setBetterText('') }}
                            className="btn btn-ghost btn-xs" aria-label="Suggest a better reply"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" /> Better?
                          </button>
                        </>
                      )}
                    </div>
                    {/* Inline "what would've been better" */}
                    {openIdx === i && rated[i] === undefined && (
                      <div className="w-full max-w-[85%] card card-pad bg-raised space-y-2">
                        <p className="text-xs text-ink-soft">
                          What would’ve been better? Your rewrite becomes the <b>chosen</b> answer and this reply the <b>rejected</b> one — ready to train with DPO.
                        </p>
                        <Textarea
                          rows={3} value={betterText} autoFocus
                          onChange={(e) => setBetterText(e.target.value)}
                          placeholder="Write the answer you wish it had given…"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => { setOpenIdx(null); setBetterText('') }}>Cancel</Button>
                          <Button variant="primary" size="sm" disabled={!betterText.trim()} onClick={() => submitBetter(i)}>Save preference</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )
            )}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-ink-mute pl-1">
                <Spinner className="w-4 h-4" /> Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <div className="p-4 border-t border-line bg-raised rounded-b-xl2">
            <div className="flex items-end gap-2">
              <Textarea
                rows={2} value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={apiKey ? 'Type a message… (Enter to send, Shift+Enter for a new line)' : 'Add a Tinker key in Settings to chat'}
                disabled={!apiKey}
                className="flex-1 resize-none"
              />
              <Button variant="primary" icon={<Send className="w-4 h-4" />} loading={sending} disabled={!canSend} onClick={send}>
                Send
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ---- COMPARE ---- */}
      {mode === 'compare' && (
        <div className="space-y-5">
          <Card className="card-pad space-y-4">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-orange mt-0.5 shrink-0" />
              <p className="text-sm text-ink-soft">
                Ask the same thing to a base model and one you tuned, then pick the better answer. Each pick is saved as a preference pair — exactly the data that trains a <InfoTip term="dpo" /> model.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Base model" term="base_model">
                {catalog.loading ? <Skeleton className="h-10 w-full" /> : (
                  <Select value={cmpBase} onChange={(e) => setCmpBase(e.target.value)}>
                    <option value="" disabled>Choose a base model…</option>
                    {baseModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Your tuned model">
                {saved.loading ? <Skeleton className="h-10 w-full" /> : trainedModels.length === 0 ? (
                  <div className="input flex items-center text-ink-mute text-sm">No trained models yet — train one first.</div>
                ) : (
                  <Select value={cmpTrained} onChange={(e) => setCmpTrained(e.target.value)}>
                    <option value="" disabled>Choose a tuned model…</option>
                    {trainedModels.map((m) => (
                      <option key={m.id} value={m.sampler_path || m.id}>{short(m.base_model)} · {typeLabel(m.training_type)}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Prompt" term="prompt">
              <Textarea
                rows={3} value={cmpPrompt}
                onChange={(e) => setCmpPrompt(e.target.value)}
                placeholder="Ask both models the same thing…"
              />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="primary" icon={<GitCompare className="w-4 h-4" />} loading={comparing}
                disabled={!apiKey || !cmpBase || !cmpTrained || !cmpPrompt.trim() || comparing}
                onClick={runCompare}
              >
                Compare answers
              </Button>
            </div>
            {!apiKey && <p className="text-xs text-ink-mute text-right -mt-2">Add a Tinker key in Settings to run a comparison.</p>}
          </Card>

          {comparing && (
            <Card className="card-pad flex items-center justify-center gap-2 text-ink-mute text-sm py-10">
              <Spinner className="w-4 h-4" /> Asking both models…
            </Card>
          )}

          {cmpResult && !comparing && (
            <div className="grid gap-4 md:grid-cols-2">
              {(['base', 'tuned'] as const).map((which) => (
                <Card key={which} className="card-pad flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <Badge tone={which === 'tuned' ? 'orange' : 'neutral'}>{which === 'tuned' ? 'Tuned' : 'Base'}</Badge>
                    <span className="text-xs text-ink-mute font-mono truncate max-w-[55%]" title={which === 'base' ? cmpBase : cmpTrained}>
                      {which === 'base' ? short(cmpBase) : short(cmpTrained)}
                    </span>
                  </div>
                  <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed min-h-[80px]">
                    {(which === 'base' ? cmpResult.base : cmpResult.tuned) || <span className="text-ink-mute italic">No response.</span>}
                  </div>
                  <Button variant="soft" size="sm" icon={<ThumbsUp className="w-4 h-4" />} className="self-start mt-auto" onClick={() => pickBetter(which)}>
                    This one’s better
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
