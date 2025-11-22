import { create } from 'zustand'

export type ViewType = 'code' | 'training' | 'models' | 'datasets' | 'playground' | 'analytics' | 'multiagent'

interface ThinkerStore {
  // Navigation
  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  // Training Jobs
  trainingJobs: any[]
  addTrainingJob: (job: any) => void
  updateTrainingJob: (id: string, updates: any) => void

  // Models
  models: any[]
  setModels: (models: any[]) => void
  selectedPlaygroundModel: string
  setSelectedPlaygroundModel: (model: string) => void

  // Datasets
  datasets: any[]
  addDataset: (dataset: any) => void

  // Settings
  apiKey: string
  setApiKey: (key: string) => void
  backendUrl: string
  setBackendUrl: (url: string) => void
  baseModel: string
  setBaseModel: (model: string) => void
  loraRank: number
  setLoraRank: (rank: number) => void
  learningRate: string
  setLearningRate: (rate: string) => void
  batchSize: number
  setBatchSize: (size: number) => void
  editorFontSize: number
  setEditorFontSize: (size: number) => void
  showMinimap: boolean
  setShowMinimap: (show: boolean) => void
  smoothScrolling: boolean
  setSmoothScrolling: (smooth: boolean) => void
}

export const useStore = create<ThinkerStore>((set) => ({
  // Navigation
  currentView: 'training',
  setCurrentView: (view) => set({ currentView: view }),

  // Training Jobs
  trainingJobs: [],
  addTrainingJob: (job) => set((state) => ({
    trainingJobs: [...state.trainingJobs, job]
  })),
  updateTrainingJob: (id, updates) => set((state) => ({
    trainingJobs: state.trainingJobs.map(job =>
      job.id === id ? { ...job, ...updates } : job
    )
  })),

  // Models
  models: [],
  setModels: (models) => set({ models }),
  selectedPlaygroundModel: '',
  setSelectedPlaygroundModel: (model) => set({ selectedPlaygroundModel: model }),

  // Datasets
  datasets: [],
  addDataset: (dataset) => set((state) => ({
    datasets: [...state.datasets, dataset]
  })),

  // Settings
  apiKey: localStorage.getItem('tinker_api_key') || '',
  setApiKey: (key) => {
    localStorage.setItem('tinker_api_key', key)
    set({ apiKey: key })
  },
  backendUrl: localStorage.getItem('backend_url') || 'http://localhost:8000',
  setBackendUrl: (url) => {
    localStorage.setItem('backend_url', url)
    set({ backendUrl: url })
  },
  baseModel: localStorage.getItem('base_model') || 'meta-llama/Llama-3.2-1B',
  setBaseModel: (model) => {
    localStorage.setItem('base_model', model)
    set({ baseModel: model })
  },
  loraRank: parseInt(localStorage.getItem('lora_rank') || '32'),
  setLoraRank: (rank) => {
    localStorage.setItem('lora_rank', rank.toString())
    set({ loraRank: rank })
  },
  learningRate: localStorage.getItem('learning_rate') || '1e-4',
  setLearningRate: (rate) => {
    localStorage.setItem('learning_rate', rate)
    set({ learningRate: rate })
  },
  batchSize: parseInt(localStorage.getItem('batch_size') || '4'),
  setBatchSize: (size) => {
    localStorage.setItem('batch_size', size.toString())
    set({ batchSize: size })
  },
  editorFontSize: parseInt(localStorage.getItem('editor_font_size') || '13'),
  setEditorFontSize: (size) => {
    localStorage.setItem('editor_font_size', size.toString())
    set({ editorFontSize: size })
  },
  showMinimap: localStorage.getItem('show_minimap') === 'true',
  setShowMinimap: (show) => {
    localStorage.setItem('show_minimap', show.toString())
    set({ showMinimap: show })
  },
  smoothScrolling: localStorage.getItem('smooth_scrolling') !== 'false',
  setSmoothScrolling: (smooth) => {
    localStorage.setItem('smooth_scrolling', smooth.toString())
    set({ smoothScrolling: smooth })
  },
}))
