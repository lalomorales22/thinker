import { useStore } from '../store/useStore'

// --- Shared types -----------------------------------------------------------

/** A base model from the live Tinker catalog (backend: catalog.enrich). */
export interface CatalogModel {
  id: string
  name: string
  org: string
  type: string
  arch: string
  size: string
  context: string
  context_tokens: number
  vision: boolean
  reasoning: boolean
  is_base: boolean
  instruct: boolean
  long_context: boolean
  recommended: boolean
  retiring: boolean
  discount: boolean
  note: string
  url?: string | null
  price_prefill?: number | null
  price_sample?: number | null
  price_train?: number | null
  renderer?: string
}

/** A model you actually trained (backend: db.list_models). */
export interface TrainedModel {
  id: string
  name?: string
  base_model: string
  training_type: string
  status?: string
  created_at?: string
  job_id?: string
  sampler_path?: string | null
  final_metrics?: Record<string, number> | null
}

/** An uploaded, hand-made, or imported dataset (backend: db.list_datasets). */
export interface Dataset {
  id: string
  name: string
  training_type: string
  num_samples: number
  source: string
  format?: string
  path?: string
  size?: string
  created_at?: string
  /** False when columns are missing/malformed for the chosen training type. */
  schema_ok?: boolean
  schema_notes?: string[]
}

/** One row-filter rule applied at import time, before field mapping. */
export interface FilterRule {
  column: string
  /** non_empty | not_one_of | gte | lte | equals | not_equals | contains | not_contains | is_true | is_false */
  op: string
  value?: string | number
  /** Only present on suggestions — why the backend proposed this rule. */
  why?: string
}

/** A training or Arena run (backend: db.get_job). */
export interface Job {
  id: string
  name: string
  kind: string
  status: string
  base_model?: string
  dataset_id?: string | null
  total_steps?: number
  current_step?: number
  status_message?: string
  error?: string | null
  config?: Record<string, any>
  metrics?: Record<string, any> | null
  /** Final payload from the run — e.g. the Arena leaderboard and best agent. */
  result?: Record<string, any> | null
  created_at: string
  started_at?: string | null
  completed_at?: string | null
}

// --- Transport --------------------------------------------------------------

function settings() {
  // Read straight from the store so a Settings change applies immediately,
  // with a localStorage fallback for the very first call before hydration.
  try {
    const s = useStore.getState()
    return { baseUrl: s.backendUrl, apiKey: s.apiKey }
  } catch {
    return {
      baseUrl: localStorage.getItem('backend_url') ?? 'http://localhost:8000',
      apiKey: localStorage.getItem('tinker_api_key') ?? '',
    }
  }
}

const OFFLINE = Symbol.for('thinker.offline')

/** The backend didn't answer at all — as opposed to answering with an error. */
function offlineError(baseUrl: string): Error {
  const err = new Error(
    `Can’t reach the Thinker backend at ${baseUrl}. Start it with ./START_UI.sh, or change the address in Settings.`,
  )
  ;(err as any)[OFFLINE] = true
  return err
}

/** True when a request failed because nothing was listening, so a retry may work. */
export function isOfflineError(e: unknown): boolean {
  return !!(e && typeof e === 'object' && (e as any)[OFFLINE])
}

/** Pull a readable message out of the backend's `{error, message, ...}` body. */
async function errorMessage(res: Response): Promise<string> {
  let body: any = null
  try {
    body = await res.json()
  } catch {
    // Not JSON — fall through to the status line.
  }
  if (body) {
    const msg = body.message ?? body.detail ?? body.error
    if (typeof msg === 'string' && msg.trim()) return msg
    // Pydantic validation errors arrive as a list of {loc, msg}.
    if (Array.isArray(body.details) && body.details.length) {
      const first = body.details[0]
      if (first?.msg) return `${first.msg}${first.loc ? ` (${first.loc.join('.')})` : ''}`
    }
  }
  return `${res.status} ${res.statusText || 'Request failed'}`
}

interface RequestOpts {
  method?: string
  body?: unknown
  /** Send as-is (FormData); the browser sets the multipart boundary. */
  form?: FormData
  query?: Record<string, string | number | boolean | undefined>
}

async function request<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { baseUrl, apiKey } = settings()

  let url = `${baseUrl.replace(/\/+$/, '')}${path}`
  if (opts.query) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) url += `?${s}`
  }

  const headers: Record<string, string> = {}
  if (apiKey) headers['X-API-Key'] = apiKey
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    })
  } catch {
    // Tagged so useAsync can tell "backend isn't up yet" (worth retrying) apart
    // from a real 4xx/5xx (not worth retrying).
    throw offlineError(baseUrl)
  }

  if (!res.ok) throw new Error(await errorMessage(res))
  if (res.status === 204) return undefined as T

  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}

// --- API surface ------------------------------------------------------------

export const api = {
  /** Honest backend health: key presence, SDK availability, catalog source. */
  health: () =>
    request<{
      status: string
      tinker_api_key: boolean
      tinker_sdk: boolean
      catalog_source: string
      catalog_count: number
      ws_clients: number
    }>('/api/health'),

  training: {
    start: (config: Record<string, any>) =>
      request<{ job_id: string; status: string; job: Job }>('/api/training/start', { body: config }),
    multiAgentStart: (config: Record<string, any>) =>
      request<{ job_id: string; status: string; job: Job }>('/api/training/multi-agent/start', { body: config }),
    jobs: () => request<{ jobs: Job[] }>('/api/training/jobs'),
    job: (id: string) => request<Job>(`/api/training/jobs/${encodeURIComponent(id)}`),
    metrics: (id: string) =>
      request<{ job_id: string; history: Array<Record<string, any>> }>(
        `/api/training/jobs/${encodeURIComponent(id)}/metrics`,
      ),
    cancel: (id: string) =>
      request<{ job_id: string; status: string }>(`/api/training/jobs/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      }),
    remove: (id: string) =>
      request<{ message: string }>(`/api/training/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  models: {
    catalog: (refresh = false) =>
      request<{
        models: CatalogModel[]
        source: string
        recommended_default: string
        recommended: string[]
      }>('/api/models/catalog', { query: { refresh: refresh || undefined } }),
    /** Models you have actually trained. */
    saved: () => request<{ models: TrainedModel[] }>('/api/models/'),
    deleteSaved: (id: string) =>
      request<{ message: string }>(`/api/models/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  datasets: {
    list: () => request<{ datasets: Dataset[] }>('/api/datasets/'),
    upload: (form: FormData) => request<{ dataset: Dataset }>('/api/datasets/upload', { form }),
    /** Parse a file and report columns, fit, secrets — storing nothing permanent. */
    inspect: (form: FormData) => request<any>('/api/datasets/inspect', { form }),
    /** Show the training examples a given field mapping would actually produce. */
    previewMapping: (body: {
      staging_id: string; training_type: string
      mapping: Record<string, string>; filters?: FilterRule[]
    }) => request<any>('/api/datasets/preview-mapping', { body }),
    /** Promote an inspected file into a real, trainable dataset. */
    commit: (body: {
      staging_id: string; name: string; training_type: string
      mapping: Record<string, string>
      filters?: FilterRule[]
      train_split?: number; val_split?: number; test_split?: number
      secrets_action?: 'keep' | 'scrub' | 'drop_rows'
    }) => request<any>('/api/datasets/commit', { body }),
    /** What a blend of several datasets would look like — writes nothing. */
    mixPreview: (body: { sources: { dataset_id: string; weight: number }[]; target_rows?: number }) =>
      request<any>('/api/datasets/mix/preview', { body }),
    /** Write the blend out as one new dataset. */
    mix: (body: {
      sources: { dataset_id: string; weight: number }[]
      name: string; target_rows?: number; shuffle?: boolean; seed?: number
    }) => request<any>('/api/datasets/mix', { body }),
    discard: (id: string) =>
      request<any>(`/api/datasets/discard/${encodeURIComponent(id)}`, { method: 'POST' }),
    create: (body: { name: string; training_type: string; rows: any[] }) =>
      request<{ dataset: Dataset }>('/api/datasets/create', { body }),
    templates: () => request<Record<string, any>>('/api/datasets/templates'),
    preview: (id: string, n = 5) =>
      request<any>(`/api/datasets/${encodeURIComponent(id)}/preview`, { query: { n } }),
    remove: (id: string) =>
      request<{ message: string }>(`/api/datasets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },

  chat: {
    message: (body: { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number }) =>
      request<{ response: string; model: string }>('/api/chat/message', { body }),
    /** Returns `{prompt, base: {model, response}, tuned: {model, response}}`. */
    compare: (body: { base_model: string; trained_model: string; prompt: string; temperature?: number; max_tokens?: number }) =>
      request<any>('/api/chat/compare', { body }),
    feedback: (body: { prompt: string; chosen: string; rejected: string; source?: string }) =>
      request<{ message: string; count: number }>('/api/chat/feedback', { body }),
    feedbackList: () => request<{ preferences: any[]; count: number }>('/api/chat/feedback'),
    feedbackToDataset: (name = 'playground-preferences') =>
      request<{ dataset: Dataset }>('/api/chat/feedback/to-dataset', { body: { name } }),
  },

  analytics: {
    overview: () => request<any>('/api/analytics/overview'),
    runs: () => request<{ runs: any[] }>('/api/analytics/runs'),
    runMetrics: (id: string) =>
      request<{ series: any[] }>(`/api/analytics/runs/${encodeURIComponent(id)}/metrics`),
  },

  assistant: {
    chat: (body: { messages: Array<{ role: string; content: string }>; context?: Record<string, any>; model?: string }) =>
      request<{ message: string; suggested_config?: Record<string, any> | null; source: string }>(
        '/api/assistant/chat',
        { body },
      ),
    status: () => request<any>('/api/assistant/status'),
    suggestConfig: (body: { task_description?: string; num_examples?: number; data_format?: string }) =>
      request<Record<string, any>>('/api/assistant/suggest-config', { body }),
  },

  /** Hand-authored character voice, expanded with a local teacher model. */
  seeds: {
    all: () => request<any>('/api/seeds'),
    setPersona: (body: { name: string; description: string }) =>
      request<any>('/api/seeds/persona', { method: 'PUT', body }),
    upsert: (body: { id?: string; turns: { role: string; content: string }[]; note?: string }) =>
      request<any>('/api/seeds/seed', { body }),
    remove: (id: string) =>
      request<any>(`/api/seeds/seed/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    expand: (body: { count: number; model?: string; topic_hint?: string; temperature?: number }) =>
      request<any>('/api/seeds/expand', { body }),
    accept: (body: { candidates: { turns: { role: string; content: string }[] }[] }) =>
      request<any>('/api/seeds/accept', { body }),
    toDataset: (body: { name?: string; include_expanded?: boolean }) =>
      request<any>('/api/seeds/to-dataset', { body }),
  },

  /** Export a fine-tune to MLX for on-device (iPhone) use. */
  export: {
    /** Will it fit on a phone, and can this machine do the conversion? */
    preflight: (modelId: string) => request<any>('/api/export/preflight', { query: { model_id: modelId } }),
    start: (modelId: string, bits: number) =>
      request<any>('/api/export/start', { body: { model_id: modelId, bits } }),
    job: (id: string) => request<any>(`/api/export/jobs/${encodeURIComponent(id)}`),
  },

  hf: {
    search: (query: string, limit = 12) =>
      request<{ datasets: any[] }>('/api/huggingface/search', { query: { query, limit } }),
    popular: () => request<any>('/api/huggingface/popular'),
    /** Goal-first starting points, each carrying a live "will this train?" verdict. */
    recommended: () => request<any>('/api/huggingface/recommended'),
    /** Batch fit-check: can these datasets be trained on as-is? */
    fit: (datasets: string[]) => request<any>('/api/huggingface/fit', { body: { datasets } }),
    // The route is declared as `{dataset_name:path}`, so keep the "org/name"
    // slash intact — encoding it would 404.
    info: (name: string) => request<any>(`/api/huggingface/info/${name}`),
    preview: (body: { dataset_name: string; split?: string; subset?: string; num_samples?: number }) =>
      request<any>('/api/huggingface/preview', { body }),
    import: (body: {
      dataset_name: string
      split?: string
      subset?: string
      training_type?: string
      field_mappings?: Array<Record<string, any>>
      filters?: FilterRule[]
      max_samples?: number
      name?: string
    }) => request<{ dataset: Dataset }>('/api/huggingface/import', { body }),
  },
}

export default api
