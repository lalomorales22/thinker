import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react'
import { X, Sparkles, Send, ArrowRight, Wand2 } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import { useAsync } from '../lib/hooks'
import { Button, IconButton, Badge, Spinner, Textarea, toast } from './ui'
import { InfoTip } from '../lib/glossary'
import { TRAINING_TYPES, fmtInt } from '../lib/util'

// The config the backend can suggest and the Train screen knows how to load.
interface SuggestedConfig {
  training_type: string
  base_model: string
  rank: number
  learning_rate: number
  num_steps: number
  batch_size: number
}
interface ChatResult {
  message: string
  suggested_config: SuggestedConfig | null
  source: string
}
interface StatusResult {
  available: boolean
  models: string[]
  default: string
}

// One turn in the visible thread. `seed` marks the canned greeting so we don't
// feed it back to the model as if it had said it.
interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: string
  config?: SuggestedConfig | null
  seed?: boolean
}

const GREETING: Msg = {
  role: 'assistant',
  seed: true,
  content:
    "Hi! I'm your training assistant. Tell me what you want your model to do and I'll help you:\n\n" +
    '- pick an approach (teach by example, by preference, or by reward)\n' +
    '- get your data ready\n' +
    '- choose sensible settings for a first run\n\n' +
    'What are you hoping to build?',
}

// --- tiny markdown-ish rendering -------------------------------------------
// We keep it deliberately basic: **bold**, `inline code`, fenced code blocks,
// and preserved newlines (via whitespace-pre-wrap on the container).

function formatInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      out.push(<strong key={k++} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>)
    } else {
      out.push(<code key={k++} className="font-mono text-[12px] bg-line-soft rounded px-1 py-0.5">{tok.slice(1, -1)}</code>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderMessage(raw: string): ReactNode {
  // The suggested config is shown as its own card, so strip the fenced config
  // block and any leading "_(Ollama isn't running…)_" note from the prose.
  let text = raw
    .replace(/```(?:config|json)\s*\{[\s\S]*?\}\s*```/g, '')
    .replace(/^\s*_\([\s\S]*?\)_\s*/, '')
    .trim()
  if (!text) return null

  // Split remaining text into alternating prose / fenced-code segments.
  const parts = text.split(/```/)
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[a-zA-Z0-9_-]*\n/, '').replace(/\s+$/, '')
      if (!code) return null
      return (
        <pre key={i} className="my-1.5 overflow-x-auto rounded-lg bg-charcoal text-white/90 font-mono text-[12px] leading-relaxed p-3">
          {code}
        </pre>
      )
    }
    if (!part) return null
    return (
      <p key={i} className="whitespace-pre-wrap leading-relaxed">
        {formatInline(part)}
      </p>
    )
  })
}

function fmtLr(lr: number): string {
  if (lr === null || lr === undefined || Number.isNaN(lr)) return '—'
  return Number(lr).toExponential().replace('e+', 'e')
}

// --- suggested-settings card ------------------------------------------------

function ConfigRow({ label, term, children }: { label: string; term?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-mute">
        {label}{term && <InfoTip term={term} />}
      </div>
      <div className="mt-0.5 text-[13px] font-medium text-ink">{children}</div>
    </div>
  )
}

function ConfigCard({ config, onUse }: { config: SuggestedConfig; onUse: () => void }) {
  const tt = TRAINING_TYPES[config.training_type]
  return (
    <div className="mt-2.5 rounded-xl2 border border-orange/30 bg-orange-soft/60 p-3.5">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 className="w-4 h-4 text-orange" />
        <span className="font-display font-bold text-sm text-ink">Suggested settings</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <ConfigRow label="Approach" term={config.training_type}>
          {tt
            ? <Badge tone="orange">{tt.label}</Badge>
            : config.training_type}
        </ConfigRow>
        <ConfigRow label="Base model" term="base_model">
          <span className="break-all">{config.base_model}</span>
        </ConfigRow>
        <ConfigRow label="Rank" term="rank">{fmtInt(config.rank)}</ConfigRow>
        <ConfigRow label="Learning rate" term="learning_rate">
          <span className="font-mono">{fmtLr(config.learning_rate)}</span>
        </ConfigRow>
        <ConfigRow label="Steps" term="num_steps">{fmtInt(config.num_steps)}</ConfigRow>
        <ConfigRow label="Batch size" term="batch_size">{fmtInt(config.batch_size)}</ConfigRow>
      </div>
      <Button variant="primary" size="sm" className="w-full mt-3.5" icon={<ArrowRight className="w-4 h-4" />} onClick={onUse}>
        Use these settings
      </Button>
    </div>
  )
}

// --- panel ------------------------------------------------------------------

export default function Assistant({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
  const ollamaModel = useStore((s) => s.ollamaModel)
  const setPendingConfig = useStore((s) => s.setPendingConfig)
  const setView = useStore((s) => s.setView)

  const { data: status, loading: statusLoading } = useAsync<StatusResult>(() => api.assistant.status(), [])

  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest turn in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user', content: text } as Msg]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const payload = next
        .filter((m) => !m.seed)
        .map((m) => ({ role: m.role, content: m.content }))
      const res = (await api.assistant.chat({
        messages: payload,
        model: ollamaModel || undefined,
      })) as ChatResult
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.message || '',
          source: res.source,
          config: res.suggested_config || null,
        },
      ])
    } catch (e: any) {
      toast(e?.message || 'The assistant could not reply', 'error')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  function useConfig(config: SuggestedConfig) {
    setPendingConfig(config)
    setView('train')
    toast('Loaded into Train — review and start when you are ready', 'info')
    onClose()
  }

  const activeModel = ollamaModel || status?.default || ''
  const subtitle = statusLoading
    ? 'Connecting…'
    : status?.available
      ? (activeModel ? `via ${activeModel}` : 'ready')
      : 'built-in helper'

  return (
    <>
      {/* Subtle backdrop — mainly for narrow screens where the dock overlays content. */}
      <div className="fixed inset-0 z-30 bg-charcoal/20 lg:bg-transparent lg:pointer-events-none" onClick={onClose} />

      <aside
        className="fixed right-0 top-0 h-full w-[380px] max-w-full bg-paper border-l border-line shadow-pop z-40 flex flex-col animate-fade-up"
        role="complementary"
        aria-label="Training assistant"
      >
        {/* Header */}
        <div className="h-16 shrink-0 flex items-center gap-3 px-4 border-b border-line">
          <div className="w-9 h-9 rounded-xl bg-orange-soft text-orange-ink flex items-center justify-center shrink-0">
            <Sparkles className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-ink leading-tight">Training assistant</div>
            <div className="text-[11px] text-ink-mute truncate">{subtitle}</div>
          </div>
          <IconButton label="Close assistant" onClick={onClose}><X className="w-5 h-5" /></IconButton>
        </div>

        {/* Offline note */}
        {!statusLoading && status && !status.available && (
          <div className="shrink-0 px-4 py-2.5 text-[12px] text-ink-soft bg-amber-soft/50 border-b border-line">
            Ollama isn't running, so I'll use the built-in helper.{' '}
            <button onClick={onOpenSettings} className="font-semibold text-ink underline underline-offset-2">
              Set your model in Settings
            </button>{' '}for smarter, conversational help.
          </div>
        )}

        {/* Thread */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-charcoal text-white text-sm px-3.5 py-2.5 whitespace-pre-wrap leading-relaxed">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-start">
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-raised border border-line text-ink text-sm px-3.5 py-2.5 space-y-2">
                  {renderMessage(m.content)}
                </div>
                {m.source === 'heuristic' && (
                  <p className="text-[11px] text-ink-mute mt-1 pl-1">
                    Built-in helper — start Ollama for smarter help.
                  </p>
                )}
                {m.config && (
                  <div className="w-[92%] max-w-full">
                    <ConfigCard config={m.config} onUse={() => useConfig(m.config!)} />
                  </div>
                )}
              </div>
            )
          ))}

          {sending && (
            <div className="flex items-center gap-2 pl-1 text-sm text-ink-mute">
              <Spinner className="w-4 h-4" /> Thinking…
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-line p-3 bg-paper">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Describe your task…"
              aria-label="Message the assistant"
              className="flex-1 resize-none min-h-[42px] max-h-32"
              disabled={sending}
            />
            <Button
              variant="primary"
              onClick={send}
              loading={sending}
              disabled={!input.trim()}
              className="shrink-0"
              aria-label="Send message"
              icon={<Send className="w-4 h-4" />}
            />
          </div>
          <p className="text-[11px] text-ink-mute mt-1.5 px-1">Enter to send · Shift+Enter for a new line</p>
        </div>
      </aside>
    </>
  )
}
