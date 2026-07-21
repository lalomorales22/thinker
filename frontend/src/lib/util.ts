import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names, with Tailwind conflicts resolved last-wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// --- Training types ---------------------------------------------------------

export interface TrainingTypeMeta {
  /** Short human label, e.g. "Supervised". */
  label: string
  /** One-line plain-English explanation, shown as helper text. */
  short: string
  /** The columns your dataset must have for this method. */
  needs: string
  /** When to reach for this method over the others. */
  goodFor: string
  /** A concrete, one-line example of a single training row. */
  example: string
  /** Class for a <Dot />, e.g. "bg-orange". */
  dot: string
  /** Badge class from index.css, e.g. "badge-orange". */
  accent: string
}

/**
 * The three training methods (plus the Arena's multi-agent runs), keyed by the
 * `kind` / `training_type` string the backend uses.
 */
export const TRAINING_TYPES: Record<string, TrainingTypeMeta> = {
  sl: {
    label: 'Supervised',
    short: 'Show the model example answers and it learns to copy them.',
    needs: 'A prompt and the ideal answer for each example.',
    goodFor: 'Teaching a format, a tone, or a specific task. Start here if you’re unsure.',
    example: '“Summarise this ticket” → the summary you’d actually write.',
    dot: 'bg-orange',
    accent: 'badge-orange',
  },
  dpo: {
    label: 'Preference',
    short: 'Show two answers and pick the better one — the model learns your taste.',
    needs: 'A prompt plus two answers: one chosen, one rejected.',
    goodFor: 'Style, tone and judgement — when “better” is easier to point at than to write.',
    example: 'Same question, your preferred reply vs. the one that missed.',
    dot: 'bg-charcoal',
    accent: 'badge-dark',
  },
  rl: {
    label: 'Reinforcement',
    short: 'The model tries answers and is scored, so it improves by practising.',
    needs: 'A prompt, and a way to score the answer (usually a reference answer).',
    goodFor: 'Tasks with a checkable right answer — maths, code, strict formats.',
    example: '“What’s 17 × 23?” → scored against 391.',
    dot: 'bg-amber',
    accent: 'badge-amber',
  },
  multi_agent: {
    label: 'Multi-agent',
    short: 'Several models train together, competing or cooperating on tasks.',
    needs: 'A set of tasks the agents can attempt and be scored on.',
    goodFor: 'Pushing past what one model reaches alone, by having them compete.',
    example: 'Three agents answer the same problem; the best answer wins the round.',
    dot: 'bg-berry',
    accent: 'badge-berry',
  },
}

// --- Job / run status -------------------------------------------------------

export interface StatusStyle {
  label: string
  /** Badge class from index.css, e.g. "badge-orange". */
  badge: string
  /** Class for a <Dot />, e.g. "bg-orange". */
  dot: string
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  queued: { label: 'Queued', badge: 'badge-outline', dot: 'bg-ink-mute' },
  running: { label: 'Running', badge: 'badge-orange', dot: 'bg-orange animate-breathe' },
  completed: { label: 'Completed', badge: 'badge-dark', dot: 'bg-charcoal' },
  failed: { label: 'Failed', badge: 'badge-berry', dot: 'bg-berry' },
  cancelled: { label: 'Cancelled', badge: 'badge-neutral', dot: 'bg-ink-mute' },
}

export function statusStyle(status?: string | null): StatusStyle {
  const key = (status ?? '').toLowerCase()
  return (
    STATUS_STYLES[key] ?? {
      label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
      badge: 'badge-neutral',
      dot: 'bg-ink-mute',
    }
  )
}

// --- Formatting -------------------------------------------------------------

const DASH = '—'

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 12345 -> "12,345". Nullish/NaN renders as an em dash. */
export function fmtInt(n?: number | null): string {
  if (!isNum(n)) return DASH
  return Math.round(n).toLocaleString('en-US')
}

/** 0.12345 -> "0.12". Nullish/NaN renders as an em dash. */
export function fmtNum(n?: number | null, digits = 2): string {
  if (!isNum(n)) return DASH
  return n.toFixed(digits)
}

/** 0.67 -> "$0.67" (Tinker prices are USD per million tokens). */
export function fmtMoney(n?: number | null): string {
  if (!isNum(n)) return DASH
  if (n > 0 && n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

/** 65536 -> "64K", 262144 -> "256K", 1048576 -> "1M". */
export function fmtContext(tokens?: number | null): string {
  if (!isNum(tokens) || tokens <= 0) return DASH
  if (tokens >= 1024 * 1024) {
    const m = tokens / (1024 * 1024)
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (tokens >= 1024) {
    const k = tokens / 1024
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return String(tokens)
}

/**
 * Parse a backend timestamp. The API emits ISO-8601 UTC, but tolerate a naive
 * string (no offset) by treating it as UTC rather than local time.
 */
function parseTime(iso?: string | null): number | null {
  if (!iso) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  const ms = Date.parse(hasZone ? iso : `${iso}Z`)
  return Number.isNaN(ms) ? null : ms
}

/** "just now", "5m ago", "3h ago", "2d ago", then an absolute date. */
export function relTime(iso?: string | null): string {
  const ms = parseTime(iso)
  if (ms === null) return DASH

  const secs = Math.round((Date.now() - ms) / 1000)
  if (secs < 0) return 'just now'
  if (secs < 45) return 'just now'
  if (secs < 90) return '1m ago'

  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`

  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
