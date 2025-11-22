import { Download, Trash2, Play, Copy, CheckCircle, Star, Package } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

interface Model {
  id: string
  name: string
  baseModel: string
  type: 'base' | 'fine-tuned' | 'rlhf'
  size: string
  checkpointPath: string
  trainingSteps: number
  performance: {
    loss?: number
    reward?: number
    accuracy?: number
  }
  createdAt: string
  isFavorite: boolean
}

export default function ModelsLibrary() {
  const backendUrl = useStore((state) => state.backendUrl)
  const apiKey = useStore((state) => state.apiKey)
  const setCurrentView = useStore((state) => state.setCurrentView)
  const setSelectedPlaygroundModel = useStore((state) => state.setSelectedPlaygroundModel)
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [deletingModel, setDeletingModel] = useState<string | null>(null)
  const [exportInfo, setExportInfo] = useState<string | null>(null)

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'base': return 'bg-gray-500/20 text-gray-400'
      case 'fine-tuned': return 'bg-blue-500/20 text-blue-400'
      case 'rlhf': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const allModels: Model[] = []

        // Fetch trained/saved models first (so they appear at the top)
        try {
          const trainedResponse = await fetch(`${backendUrl}/api/models/`, {
            headers: {
              'X-API-Key': apiKey
            }
          })
          if (trainedResponse.ok) {
            const trainedData = await trainedResponse.json()
            const trainedModels: Model[] = trainedData.models.map((model: any, index: number) => ({
              id: `trained-${index}`,
              name: model.name,
              baseModel: model.base_model,
              type: 'fine-tuned',
              size: model.size_mb ? `${model.size_mb.toFixed(1)} MB` : 'Unknown',
              checkpointPath: model.checkpoint_path || '',
              trainingSteps: model.training_config?.num_steps || 0,
              performance: {
                loss: model.final_metrics?.loss
              },
              createdAt: model.created_at ? new Date(model.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              isFavorite: false
            }))
            allModels.push(...trainedModels)
          }
        } catch (error) {
          console.error('Failed to fetch trained models:', error)
        }

        // Fetch base models
        try {
          const baseResponse = await fetch(`${backendUrl}/api/models/base/available`, {
            headers: {
              'X-API-Key': apiKey
            }
          })
          if (baseResponse.ok) {
            const baseData = await baseResponse.json()
            // Transform strings to Model objects
            const baseModels: Model[] = baseData.models
              .filter((item: any) => typeof item === 'string') // Only process strings
              .map((name: string, index: number) => ({
                id: `base-${index}`,
                name: name.split('/').pop() || name,
                baseModel: name,
                type: 'base',
                size: 'Unknown', // Could parse from name
                checkpointPath: name,
                trainingSteps: 0,
                performance: {},
                createdAt: new Date().toISOString().split('T')[0],
                isFavorite: false
              }))
            allModels.push(...baseModels)
          }
        } catch (error) {
          console.error('Failed to fetch base models:', error)
        }

        setModels(allModels)
      } catch (error) {
        console.error('Failed to fetch models:', error)
      }
    }
    fetchModels()
  }, [backendUrl, apiKey])

  const toggleFavorite = (id: string) => {
    setModels(models.map(m =>
      m.id === id ? { ...m, isFavorite: !m.isFavorite } : m
    ))
  }

  // Test model in Playground
  const handleTestInPlayground = (model: Model) => {
    console.log('Test in Playground clicked for:', model.name)
    // Set the checkpoint path as the selected model
    setSelectedPlaygroundModel(model.checkpointPath)
    // Navigate to playground
    setCurrentView('playground')
  }

  // Export/Download model
  const handleExportModel = (model: Model) => {
    console.log('Export model clicked for:', model.name)
    // Copy checkpoint path to clipboard and show notification
    navigator.clipboard.writeText(model.checkpointPath)
    setExportInfo(model.checkpointPath)
    setTimeout(() => setExportInfo(null), 3000)
  }

  // Delete model
  const handleDeleteModel = async (model: Model) => {
    console.log('Delete model clicked for:', model.name)

    // Don't allow deleting base models
    if (model.type === 'base') {
      console.log('Cannot delete base model')
      return
    }

    // Confirm deletion
    if (deletingModel === model.name) {
      console.log('Confirming deletion of:', model.name)
      try {
        const response = await fetch(`${backendUrl}/api/models/${encodeURIComponent(model.name)}`, {
          method: 'DELETE',
          headers: {
            'X-API-Key': apiKey
          }
        })

        if (response.ok) {
          console.log('Model deleted successfully')
          // Remove from local state
          setModels(models.filter(m => m.name !== model.name))
          if (selectedModel?.name === model.name) {
            setSelectedModel(null)
          }
          setDeletingModel(null)
        } else {
          console.error('Failed to delete model')
        }
      } catch (error) {
        console.error('Error deleting model:', error)
      }
    } else {
      // First click - set as deleting (requires confirmation)
      console.log('Setting delete confirmation for:', model.name)
      setDeletingModel(model.name)
      // Reset after 3 seconds
      setTimeout(() => setDeletingModel(null), 3000)
    }
  }

  return (
    <div className="h-full flex bg-dark-bg">
      {/* Models List */}
      <div className="flex-1 flex flex-col">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-brain-blue-500" />
            <span className="text-lg font-semibold">Models Library</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search models..."
              className="input-field w-64"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {models.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Package className="w-16 h-16 text-tactical-500 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-dark-text mb-2">No models yet</h3>
              <p className="text-sm text-dark-text-secondary max-w-md">
                Train your first model to get started. Models will appear here once training is complete.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {models.map((model) => (
                <div
                  key={model.id}
                  className={`bg-dark-surface border rounded-ide p-4 cursor-pointer transition-all ${selectedModel?.id === model.id
                    ? 'border-brain-blue-500 ring-1 ring-brain-blue-500/50'
                    : 'border-dark-border hover:border-brain-blue-500/50'
                    }`}
                  onClick={() => setSelectedModel(model)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{model.name}</h3>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(model.id)
                          }}
                        >
                          <Star
                            className={`w-4 h-4 ${model.isFavorite
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-dark-text-secondary'
                              }`}
                          />
                        </button>
                      </div>
                      <p className="text-sm text-dark-text-secondary mb-2">{model.baseModel}</p>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(model.type)}`}>
                          {model.type}
                        </span>
                        <span className="text-xs text-dark-text-secondary">{model.size}</span>
                        {model.trainingSteps > 0 && (
                          <span className="text-xs text-dark-text-secondary">
                            {model.trainingSteps} steps
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-sm p-1.5"
                        title="Test in Playground"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTestInPlayground(model)
                        }}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm p-1.5"
                        title="Export Model (Copy Path)"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExportModel(model)
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      {model.type !== 'base' && (
                        <button
                          className={`btn btn-ghost btn-sm p-1.5 ${
                            deletingModel === model.name ? 'text-red-600 bg-red-500/20' : 'text-red-400'
                          }`}
                          title={deletingModel === model.name ? 'Click again to confirm' : 'Delete'}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteModel(model)
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  {Object.keys(model.performance).length > 0 && (
                    <div className="grid grid-cols-3 gap-4 text-sm border-t border-dark-border pt-3 mt-3">
                      {model.performance.loss !== undefined && (
                        <div>
                          <span className="text-dark-text-secondary">Loss:</span>{' '}
                          <span className="font-mono text-blue-400">{model.performance.loss.toFixed(3)}</span>
                        </div>
                      )}
                      {model.performance.reward !== undefined && (
                        <div>
                          <span className="text-dark-text-secondary">Reward:</span>{' '}
                          <span className="font-mono text-green-400">{model.performance.reward.toFixed(2)}</span>
                        </div>
                      )}
                      {model.performance.accuracy !== undefined && (
                        <div>
                          <span className="text-dark-text-secondary">Accuracy:</span>{' '}
                          <span className="font-mono text-purple-400">{(model.performance.accuracy * 100).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Model Details Sidebar */}
      {selectedModel && (
        <div className="w-80 border-l border-dark-border flex flex-col bg-dark-surface">
          <div className="panel-header">
            <span className="text-sm font-semibold">MODEL DETAILS</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">{selectedModel.name}</h3>
              <p className="text-sm text-dark-text-secondary">{selectedModel.baseModel}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                CHECKPOINT PATH
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-dark-hover p-2 rounded font-mono truncate">
                  {selectedModel.checkpointPath}
                </code>
                <button
                  className="btn btn-ghost btn-sm p-1.5"
                  onClick={() => copyPath(selectedModel.checkpointPath)}
                >
                  {copiedPath === selectedModel.checkpointPath ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                TYPE
              </label>
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTypeColor(selectedModel.type)}`}>
                {selectedModel.type}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                SIZE
              </label>
              <div className="text-sm">{selectedModel.size}</div>
            </div>

            {selectedModel.trainingSteps > 0 && (
              <div>
                <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                  TRAINING STEPS
                </label>
                <div className="text-sm font-mono">{selectedModel.trainingSteps.toLocaleString()}</div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                CREATED
              </label>
              <div className="text-sm">{selectedModel.createdAt}</div>
            </div>

            {Object.keys(selectedModel.performance).length > 0 && (
              <div>
                <label className="block text-xs font-medium text-dark-text-secondary mb-2">
                  PERFORMANCE
                </label>
                <div className="space-y-2">
                  {selectedModel.performance.loss !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-dark-text-secondary">Loss:</span>
                      <span className="font-mono text-blue-400">{selectedModel.performance.loss.toFixed(3)}</span>
                    </div>
                  )}
                  {selectedModel.performance.reward !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-dark-text-secondary">Reward:</span>
                      <span className="font-mono text-green-400">{selectedModel.performance.reward.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedModel.performance.accuracy !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-dark-text-secondary">Accuracy:</span>
                      <span className="font-mono text-purple-400">{(selectedModel.performance.accuracy * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 space-y-2">
              <button
                className="btn btn-primary w-full flex items-center justify-center gap-2"
                onClick={() => handleTestInPlayground(selectedModel)}
              >
                <Play className="w-4 h-4" />
                Test in Playground
              </button>
              <button
                className="btn btn-ghost w-full flex items-center justify-center gap-2"
                onClick={() => handleExportModel(selectedModel)}
              >
                <Download className="w-4 h-4" />
                Export Model
              </button>
              {selectedModel.type !== 'base' && (
                <button
                  className={`btn btn-ghost w-full flex items-center justify-center gap-2 ${
                    deletingModel === selectedModel.name
                      ? 'text-red-600 bg-red-500/20'
                      : 'text-red-400 hover:text-red-300'
                  }`}
                  onClick={() => handleDeleteModel(selectedModel)}
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingModel === selectedModel.name ? 'Click to Confirm' : 'Delete Model'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Notification */}
      {exportInfo && (
        <div className="fixed bottom-4 right-4 bg-dark-surface border border-brain-blue-500 rounded-ide p-4 shadow-lg max-w-md z-50">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-sm mb-1">Checkpoint Path Copied!</h4>
              <p className="text-xs text-dark-text-secondary mb-2">
                Use this path to load your model:
              </p>
              <code className="block text-xs bg-dark-hover p-2 rounded font-mono break-all">
                {exportInfo}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
