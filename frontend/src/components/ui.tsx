import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '../lib/util'
import { InfoTip } from '../lib/glossary'

// --- Button -----------------------------------------------------------------
type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg' | 'xs'
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  const v = { primary: 'btn-primary', dark: 'btn-dark', outline: 'btn-outline', ghost: 'btn-ghost', danger: 'btn-danger', soft: 'btn-soft' }[variant]
  const s = { xs: 'btn-xs', sm: 'btn-sm', md: '', lg: 'btn-lg' }[size]
  return (
    <button className={cn('btn', v, s, className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ className, children, label, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return <button aria-label={label} className={cn('btn btn-ghost btn-icon', className)} {...rest}>{children}</button>
}

// --- Card -------------------------------------------------------------------
export function Card({ className, children, hover, ...rest }:
  React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn('card', hover && 'transition-shadow hover:shadow-raised', className)} {...rest}>{children}</div>
}

// --- Badge & status ---------------------------------------------------------
export function Badge({ tone = 'neutral', className, children }:
  { tone?: 'neutral' | 'orange' | 'dark' | 'berry' | 'amber' | 'outline'; className?: string; children: ReactNode }) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>
}
export function Dot({ className }: { className?: string }) {
  return <span className={cn('dot', className)} />
}

// --- Form -------------------------------------------------------------------
export function Field({ label, term, hint, children, className }:
  { label?: ReactNode; term?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <label className="label flex items-center gap-1.5">
          {label}{term && <InfoTip term={term} />}
        </label>
      )}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input', props.className)} />
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn('input', props.className)} />
}

// --- Segmented control ------------------------------------------------------
export function Segmented<T extends string>({ value, onChange, options, className }:
  { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('segmented', className)} role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" data-active={value === o.value} aria-selected={value === o.value}
          className="segmented-item" onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

// --- Progress ---------------------------------------------------------------
export function Progress({ value, className }: { value: number; className?: string }) {
  return <div className={cn('progress', className)}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

// --- Stat -------------------------------------------------------------------
export function Stat({ label, value, hint, accent }: { label: ReactNode; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">{label}</div>
      <div className={cn('font-display font-bold text-3xl mt-1.5 leading-none', accent ? 'text-orange-ink' : 'text-ink')}>{value}</div>
      {hint && <div className="text-xs text-ink-mute mt-2">{hint}</div>}
    </div>
  )
}

// --- Empty state ------------------------------------------------------------
export function EmptyState({ icon, title, description, action }:
  { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="w-14 h-14 rounded-2xl bg-orange-soft text-orange-ink flex items-center justify-center mb-4">{icon}</div>}
      <h3 className="font-display font-bold text-lg text-ink">{title}</h3>
      {description && <p className="text-sm text-ink-soft mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// --- Spinner / Skeleton -----------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-ink-mute', className)} />
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

// --- Modal ------------------------------------------------------------------
export function Modal({ open, onClose, title, subtitle, children, footer, wide }:
  { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm animate-pop-in" onClick={onClose} />
      <div className={cn('relative card shadow-pop w-full animate-fade-up flex flex-col max-h-[90vh]', wide ? 'max-w-3xl' : 'max-w-lg')}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
            <div>
              {title && <h2 className="font-display font-bold text-xl text-ink">{title}</h2>}
              {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
            </div>
            <IconButton label="Close" onClick={onClose}><X className="w-5 h-5" /></IconButton>
          </div>
        )}
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-2 bg-raised rounded-b-xl2">{footer}</div>}
      </div>
    </div>
  )
}

// --- Toasts (tiny module store) --------------------------------------------
type Toast = { id: number; msg: string; tone: 'ok' | 'error' | 'info' }
let _toasts: Toast[] = []
let _seq = 1
const _subs = new Set<(t: Toast[]) => void>()
function emit() { _subs.forEach(fn => fn([..._toasts])) }
export function toast(msg: string, tone: Toast['tone'] = 'ok') {
  const t = { id: _seq++, msg, tone }
  _toasts = [..._toasts, t]
  emit()
  setTimeout(() => { _toasts = _toasts.filter(x => x.id !== t.id); emit() }, 4200)
}
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => { _subs.add(setItems); return () => { _subs.delete(setItems) } }, [])
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 items-end">
      {items.map(t => (
        <div key={t.id} className={cn('animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-pop max-w-sm',
          t.tone === 'ok' ? 'bg-charcoal text-white' : t.tone === 'error' ? 'bg-berry text-white' : 'bg-paper border border-line text-ink')}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}
