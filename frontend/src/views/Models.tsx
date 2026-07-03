import { useRef, useState } from 'react'
import {
  Boxes, Sparkles, Star, Eye, Brain, RefreshCw, Trash2, MessageSquare, AlertCircle,
} from 'lucide-react'
import { api, CatalogModel, TrainedModel } from '../lib/api'
import { InfoTip } from '../lib/glossary'
import { useAsync } from '../lib/hooks'
import { useStore } from '../store/useStore'
import {
  Button, Card, Badge, Dot, EmptyState, Skeleton, Modal, Segmented, toast,
} from '../components/ui'
import {
  cn, fmtMoney, fmtNum, fmtContext, relTime, TRAINING_TYPES, statusStyle,
} from '../lib/util'

type Tab = 'yours' | 'catalog'
type Filter = 'all' | 'recommended' | 'vision' | 'reasoning' | 'cheap'

const TYPE_TONE: Record<string, 'orange' | 'dark' | 'amber' | 'berry' | 'neutral'> = {
  sl: 'orange', dpo: 'dark', rl: 'amber', multi_agent: 'berry',
}
const HAS_TERM = new Set(['sl', 'dpo', 'rl'])

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'recommended', label: 'Recommended' },
  { k: 'vision', label: 'Vision' },
  { k: 'reasoning', label: 'Reasoning' },
  { k: 'cheap', label: 'Small & cheap' },
]

// Pull the first numeric value present under any of the candidate keys.
function metricNum(fm: any, keys: string[]): number | null {
  if (!fm || typeof fm !== 'object') return null
  for (const k of keys) {
    const v = fm[k]
    if (typeof v === 'number' && !Number.isNaN(v)) return v
  }
  return null
}

export default function Models() {
  const [tab, setTab] = useState<Tab>('yours')
  const setView = useStore((s) => s.setView)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-3xl text-ink">Models</h1>
          <p className="text-sm text-ink-soft mt-1">
            Your fine-tuned models, and the base models you can start from.
          </p>
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'yours', label: 'Your models' },
            { value: 'catalog', label: 'Model catalog' },
          ]}
        />
      </div>

      {tab === 'yours' ? <YourModels setView={setView} /> : <Catalog setView={setView} />}
    </div>
  )
}

// --- Your trained models ----------------------------------------------------

function YourModels({ setView }: { setView: (v: any) => void }) {
  const dataVersion = useStore((s) => s.dataVersion)
  const bump = useStore((s) => s.bump)
  const { data, loading, error, reload } = useAsync(() => api.models.saved(), [dataVersion])

  const [confirm, setConfirm] = useState<TrainedModel | null>(null)
  const [deleting, setDeleting] = useState(false)

  const doDelete = async () => {
    if (!confirm) return
    setDeleting(true)
    try {
      await api.models.deleteSaved(confirm.id)
      toast('Model deleted', 'info')
      setConfirm(null)
      bump()
    } catch (e: any) {
      toast(e.message || 'Could not delete model', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <CardGridSkeleton />
  if (error) return <ErrorNote message={error} onRetry={reload} />

  const models = data?.models ?? []
  if (models.length === 0) {
    return (
      <Card className="card-pad">
        <EmptyState
          icon={<Boxes className="w-6 h-6" />}
          title="No trained models yet"
          description="Once you fine-tune a model it shows up here, ready to test and share."
          action={<Button icon={<Sparkles className="w-4 h-4" />} onClick={() => setView('train')}>Train your first model</Button>}
        />
      </Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {models.map((m) => {
          const tt = TRAINING_TYPES[m.training_type]
          const tone = TYPE_TONE[m.training_type] ?? 'neutral'
          const loss = metricNum(m.final_metrics, ['loss', 'final_loss', 'train_loss', 'eval_loss'])
          const reward = metricNum(m.final_metrics, ['reward', 'final_reward', 'reward_margin', 'mean_reward'])
          const st = m.status ? statusStyle(m.status) : null
          return (
            <Card key={m.id} hover className="card-pad flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display font-bold text-ink truncate">{m.id}</div>
                  <div className="text-xs text-ink-mute mt-0.5 font-mono truncate">{m.base_model}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={tone}>{tt?.label ?? m.training_type}</Badge>
                  {HAS_TERM.has(m.training_type) && <InfoTip term={m.training_type} />}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                {loss != null && (
                  <span>Loss <span className="font-mono text-ink">{fmtNum(loss)}</span></span>
                )}
                {reward != null && (
                  <span>Reward <span className="font-mono text-ink">{fmtNum(reward)}</span></span>
                )}
                {st && m.status !== 'completed' && (
                  <span className="inline-flex items-center gap-1"><Dot className={st.dot} />{st.label}</span>
                )}
                <span className="ml-auto text-ink-mute">{relTime(m.created_at)}</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="soft" icon={<MessageSquare className="w-4 h-4" />} onClick={() => setView('playground')}>
                  Test in Playground
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirm(m)}>
                  Delete
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete this model?"
        subtitle={confirm?.id}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={doDelete}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          This removes the saved model from Thinker. Its training run stays in Analytics, so you can retrain any time.
        </p>
      </Modal>
    </>
  )
}

// --- Model catalog ----------------------------------------------------------

function Catalog({ setView }: { setView: (v: any) => void }) {
  const forceRef = useRef(false)
  const { data, loading, error, reload } = useAsync(() => api.models.catalog(forceRef.current), [])
  const [filter, setFilter] = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    forceRef.current = true
    try {
      await reload()
    } catch {
      /* error surfaces via `error` */
    } finally {
      forceRef.current = false
      setRefreshing(false)
    }
  }

  const source = data?.source || ''
  const live = /live/i.test(source)

  const models = (data?.models ?? [])
    .filter((m) => {
      switch (filter) {
        case 'recommended': return m.recommended
        case 'vision': return m.vision
        case 'reasoning': return m.reasoning
        case 'cheap': return /compact|small/i.test(m.size)
        default: return true
      }
    })
    .slice()
    .sort((a, b) => Number(b.recommended) - Number(a.recommended))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <Button
            key={f.k}
            size="sm"
            variant={filter === f.k ? 'dark' : 'outline'}
            onClick={() => setFilter(f.k)}
          >
            {f.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {data && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-mute" title={`Catalog source: ${source || 'unknown'}`}>
              <Dot className={live ? 'bg-orange' : 'bg-ink-mute'} />
              {live ? 'Live prices' : 'Snapshot'}
            </span>
          )}
          <Button size="sm" variant="ghost" icon={<RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />} loading={refreshing} onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : models.length === 0 ? (
        <Card className="card-pad">
          <EmptyState
            icon={<Boxes className="w-6 h-6" />}
            title="No models match that filter"
            description="Try a different filter to see more of the catalog."
            action={<Button variant="soft" onClick={() => setFilter('all')}>Show all models</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {models.map((m) => (
            <CatalogCard key={m.id} m={m} onUse={() => setView('train')} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogCard({ m, onUse }: { m: CatalogModel; onUse: () => void }) {
  const discountLabel = m.note && m.note.length <= 18 ? m.note : '50% off'
  return (
    <Card hover className="card-pad flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display font-bold text-ink flex items-center gap-1.5">
            {m.recommended && <Star className="w-4 h-4 text-orange shrink-0" fill="currentColor" aria-label="Recommended" />}
            <span className="truncate">{m.name}</span>
          </div>
          <div className="text-xs text-ink-mute mt-0.5 truncate">
            {[m.org, m.size, m.arch].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1">
          <Badge tone="outline">{fmtContext(m.context_tokens)} ctx</Badge>
          <InfoTip term="context" />
        </span>
        {m.instruct ? (
          <span className="inline-flex items-center gap-1">
            <Badge tone="neutral">Instruct</Badge>
            <InfoTip term="instruct" />
          </span>
        ) : m.is_base ? (
          <span className="inline-flex items-center gap-1">
            <Badge tone="neutral">Base</Badge>
            <InfoTip term="instruct" />
          </span>
        ) : null}
        {m.vision && (
          <span className="inline-flex items-center gap-1">
            <Badge tone="orange"><Eye className="w-3 h-3" /> Vision</Badge>
            <InfoTip term="vision" />
          </span>
        )}
        {m.reasoning && <Badge tone="dark"><Brain className="w-3 h-3" /> Reasoning</Badge>}
        {m.discount && <Badge tone="amber">{discountLabel}</Badge>}
        {m.retiring && <Badge tone="amber">Retiring</Badge>}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
        <div className="flex items-center gap-1 text-xs text-ink-soft">
          <span className="font-mono text-sm text-ink">{fmtMoney(m.price_train)}</span>
          <span>/Mtok train</span>
          <InfoTip term="tokens" />
        </div>
        <Button size="sm" variant="soft" icon={<Sparkles className="w-4 h-4" />} onClick={onUse}>
          Use to train
        </Button>
      </div>
    </Card>
  )
}

// --- Shared small pieces ----------------------------------------------------

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="card-pad flex flex-col gap-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Skeleton className="h-8 w-full mt-1" />
        </Card>
      ))}
    </div>
  )
}

function ErrorNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="card-pad">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-berry-soft text-berry-ink flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-ink">Something went wrong</div>
          <p className="text-sm text-ink-soft mt-0.5 break-words">{message}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>Try again</Button>
        </div>
      </div>
    </Card>
  )
}
