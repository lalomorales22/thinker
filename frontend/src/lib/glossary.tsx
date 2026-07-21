import { ReactNode, useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './util'

/**
 * Plain-English definitions for every bit of jargon the UI shows.
 *
 * Keys match the ids used across the app: training types (`sl`/`dpo`/`rl`),
 * config fields (`rank`, `learning_rate`, …), dataset columns (`prompt`,
 * `chosen`, …) and metrics (`loss`, `reward_margin`, …).
 */
export const GLOSSARY: Record<string, string> = {
  // --- Training methods ---
  sl: 'Supervised fine-tuning. You give the model pairs of prompt and ideal answer, and it learns to produce answers like yours. This is the usual place to start.',
  dpo: 'Preference tuning (DPO). For each prompt you supply a better answer and a worse one. Instead of copying a single target, the model learns which of two replies you prefer — good for tone, style and judgement.',
  rl: 'Reinforcement learning. The model writes its own answers, each is scored by a reward function, and it practises toward higher scores. Best when you can grade an answer automatically (maths, code, format checks).',
  multi_agent: 'Several models train at once in the Arena — either competing on the same tasks or sharing what they learn — so they improve against each other rather than a fixed dataset.',

  // --- Arena modes ---
  tournament: 'Agents are paired against each other on each task and the winners are rewarded. Competition tends to sharpen answers, but takes more compute per round.',
  swarm: 'Agents work the same tasks in parallel and pool their best results, so every agent learns from the group. Steadier than a tournament and usually cheaper.',

  // --- Models ---
  base_model: 'The open model you start from. Fine-tuning does not build a model from scratch — it nudges an existing one toward your data. Bigger models cost more to train but generally understand more.',
  instruct: 'This model has already been taught to follow instructions and hold a conversation. Best default for chat-style assistants.',
  vision: 'This model can read images as well as text.',
  context: 'How much text the model can consider at once — your prompt plus its answer. Longer context costs more.',
  tokens: 'Models read text in chunks called tokens — roughly ¾ of a word each. Pricing and context limits are both counted in tokens.',

  // --- Dataset fields ---
  prompt: 'The input you give the model — a question, an instruction, or the start of a conversation.',
  completion: 'The answer you want the model to learn to give for that prompt.',
  chosen: 'The better of two answers to the same prompt. The model learns to move toward this one.',
  rejected: 'The worse of two answers to the same prompt. The model learns to move away from this one.',
  reference: 'The known-correct answer, used only to score what the model produces. The model never sees it — it is the answer key for the reward.',
  split: 'How your examples are divided: most for training, a slice held back to check the model on data it has not seen.',

  // --- Training settings ---
  rank: 'LoRA rank — how much new capacity you add to the model. Higher means it can learn more nuance, but risks memorising your data and costs more. 32 is a solid default.',
  learning_rate: 'How big a step the model takes on each update. Too high and training becomes unstable; too low and it barely moves. 1e-4 is a reasonable starting point.',
  num_steps: 'How many update steps to run. More steps means more learning, up to the point where the model starts overfitting your examples.',
  batch_size: 'How many examples the model looks at per step. Larger batches give a smoother, more reliable signal but use more memory.',
  temperature: 'How adventurous the model is when writing. Near 0 it picks the safest words every time; around 1 it takes more risks and sounds more varied.',
  dry_run: 'Demo mode runs the whole flow with simulated numbers and no Tinker API key, so you can explore the app. Nothing is actually trained and the metrics are not real.',

  // --- Metrics ---
  loss: 'How wrong the model was on the examples it just saw. Lower is better, and you want to see it drift down over the run. A flat or rising line means something is off.',
  reward: 'The score the reward function gave the model’s own answers. Higher is better — a rising line means practice is paying off.',
  reward_margin: 'How much more reward the preferred answer earned than the rejected one. A growing margin means the model is learning your preferences.',
  pref_accuracy: 'How often the model now prefers the answer you said was better. 50% is a coin flip; higher means it has picked up your taste.',
}

// --- Tooltip plumbing -------------------------------------------------------

interface TipPos {
  top: number
  left: number
}

/**
 * Shared hover/focus tooltip. Rendered into a portal with fixed positioning so
 * it is never clipped by a card, modal or scroll container.
 */
function useTip() {
  const ref = useRef<HTMLElement | null>(null)
  const [pos, setPos] = useState<TipPos | null>(null)

  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
  }, [])

  const hide = useCallback(() => setPos(null), [])

  return { ref, pos, show, hide }
}

function TipBubble({ pos, children }: { pos: TipPos; children: ReactNode }) {
  // Keep the bubble on screen: clamp its centre so a 264px card always fits.
  const half = 132
  const left = Math.min(Math.max(pos.left, half + 8), window.innerWidth - half - 8)

  return createPortal(
    <div
      role="tooltip"
      style={{ top: pos.top, left, width: 264 }}
      className="fixed z-[100] -translate-x-1/2 rounded-xl2 bg-charcoal px-3.5 py-2.5 text-xs
                 leading-relaxed text-white shadow-pop animate-pop-in pointer-events-none"
    >
      {children}
    </div>,
    document.body,
  )
}

function lookup(term?: string, text?: string): string | null {
  if (text) return text
  if (term && GLOSSARY[term]) return GLOSSARY[term]
  return null
}

// --- Public components ------------------------------------------------------

/**
 * A small "?" bubble that explains a term on hover or keyboard focus.
 * Pass either a glossary `term` id or literal `text`.
 */
export function InfoTip({ term, text, className }: { term?: string; text?: string; className?: string }) {
  const { ref, pos, show, hide } = useTip()
  const body = lookup(term, text)
  if (!body) return null

  return (
    <>
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        role="button"
        tabIndex={0}
        aria-label={term ? `What is ${term.replace(/_/g, ' ')}?` : 'More information'}
        className={cn('infotip-trigger', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          pos ? hide() : show()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide()
        }}
      >
        ?
      </span>
      {pos && <TipBubble pos={pos}>{body}</TipBubble>}
    </>
  )
}

/**
 * Inline prose with a dashed underline that explains itself on hover — for
 * dropping a glossary term into a sentence.
 */
export function TermText({ id, text, children, className }:
  { id?: string; text?: string; children: ReactNode; className?: string }) {
  const { ref, pos, show, hide } = useTip()
  const body = lookup(id, text)
  if (!body) return <>{children}</>

  return (
    <>
      <span
        ref={ref as React.RefObject<HTMLSpanElement>}
        tabIndex={0}
        className={cn('term', className)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {pos && <TipBubble pos={pos}>{body}</TipBubble>}
    </>
  )
}
