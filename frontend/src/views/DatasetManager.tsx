import { Upload, Trash2, Eye, Database, Download } from 'lucide-react'
import { useState } from 'react'

interface Dataset {
  id: string
  name: string
  type: 'code_review' | 'preference' | 'rl_reward' | 'qa' | 'custom'
  format: 'jsonl' | 'json' | 'csv'
  size: string
  numSamples: number
  split: {
    train?: number
    validation?: number
    test?: number
  }
  uploadedAt: string
  previewSamples?: any[]
}

export default function DatasetManager() {
  const [datasets] = useState<Dataset[]>([])
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'code_review': return 'bg-blue-500/20 text-blue-400'
      case 'preference': return 'bg-purple-500/20 text-purple-400'
      case 'rl_reward': return 'bg-green-500/20 text-green-400'
      case 'qa': return 'bg-yellow-500/20 text-yellow-400'
      case 'custom': return 'bg-gray-500/20 text-gray-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  return (
    <div className="h-full flex bg-dark-bg">
      {/* Datasets List */}
      <div className="flex-1 flex flex-col">
        <div className="panel-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-brain-blue-500" />
            <span className="text-lg font-semibold">Dataset Manager</span>
          </div>
          <button
            className="btn btn-primary flex items-center gap-2"
            onClick={() => setShowUploadModal(true)}
          >
            <Upload className="w-4 h-4" />
            Upload Dataset
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {datasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Database className="w-16 h-16 text-tactical-500 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-dark-text mb-2">No datasets yet</h3>
              <p className="text-sm text-dark-text-secondary max-w-md">
                Upload your first dataset to begin training. Click "Upload Dataset" to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {datasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className={`bg-dark-surface border rounded-ide p-4 cursor-pointer transition-all ${
                    selectedDataset?.id === dataset.id
                      ? 'border-brain-blue-500 ring-1 ring-brain-blue-500/50'
                      : 'border-dark-border hover:border-brain-blue-500/50'
                  }`}
                  onClick={() => setSelectedDataset(dataset)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{dataset.name}</h3>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(dataset.type)}`}>
                          {dataset.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-dark-text-secondary">{dataset.format.toUpperCase()}</span>
                        <span className="text-xs text-dark-text-secondary">{dataset.size}</span>
                        <span className="text-xs text-dark-text-secondary">
                          {dataset.numSamples.toLocaleString()} samples
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button className="btn btn-ghost btn-sm p-1.5" title="Preview">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5" title="Download">
                        <Download className="w-4 h-4" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5 text-red-400" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Split Info */}
                  <div className="flex items-center gap-4 text-sm border-t border-dark-border pt-3">
                    {dataset.split.train && (
                      <div>
                        <span className="text-dark-text-secondary">Train:</span>{' '}
                        <span className="font-mono text-blue-400">{dataset.split.train.toLocaleString()}</span>
                      </div>
                    )}
                    {dataset.split.validation && (
                      <div>
                        <span className="text-dark-text-secondary">Val:</span>{' '}
                        <span className="font-mono text-green-400">{dataset.split.validation.toLocaleString()}</span>
                      </div>
                    )}
                    {dataset.split.test && (
                      <div>
                        <span className="text-dark-text-secondary">Test:</span>{' '}
                        <span className="font-mono text-purple-400">{dataset.split.test.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dataset Details Sidebar */}
      {selectedDataset && (
        <div className="w-96 border-l border-dark-border flex flex-col bg-dark-surface">
          <div className="panel-header">
            <span className="text-sm font-semibold">DATASET DETAILS</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">{selectedDataset.name}</h3>
              <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTypeColor(selectedDataset.type)}`}>
                {selectedDataset.type.replace('_', ' ')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                FORMAT
              </label>
              <div className="text-sm">{selectedDataset.format.toUpperCase()}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                SIZE
              </label>
              <div className="text-sm">{selectedDataset.size}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                TOTAL SAMPLES
              </label>
              <div className="text-sm font-mono">{selectedDataset.numSamples.toLocaleString()}</div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-2">
                DATA SPLIT
              </label>
              <div className="space-y-2">
                {selectedDataset.split.train && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">Train:</span>
                    <span className="font-mono text-blue-400">{selectedDataset.split.train.toLocaleString()}</span>
                  </div>
                )}
                {selectedDataset.split.validation && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">Validation:</span>
                    <span className="font-mono text-green-400">{selectedDataset.split.validation.toLocaleString()}</span>
                  </div>
                )}
                {selectedDataset.split.test && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">Test:</span>
                    <span className="font-mono text-purple-400">{selectedDataset.split.test.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-dark-text-secondary mb-1">
                UPLOADED
              </label>
              <div className="text-sm">{selectedDataset.uploadedAt}</div>
            </div>

            {selectedDataset.previewSamples && selectedDataset.previewSamples.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-dark-text-secondary mb-2">
                  SAMPLE PREVIEW
                </label>
                <div className="bg-dark-hover rounded p-3 space-y-2">
                  {selectedDataset.previewSamples.map((sample, idx) => (
                    <div key={idx} className="text-xs space-y-1">
                      {Object.entries(sample).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-dark-text-secondary">{key}:</span>
                          <pre className="font-mono text-xs mt-1 whitespace-pre-wrap">
                            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 space-y-2">
              <button className="btn btn-primary w-full flex items-center justify-center gap-2">
                <Eye className="w-4 h-4" />
                View Full Preview
              </button>
              <button className="btn btn-ghost w-full flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Download Dataset
              </button>
              <button className="btn btn-ghost w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
                Delete Dataset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="tactical-panel-elevated w-full max-w-2xl mx-4">
            <div className="tactical-panel-header">
              <div className="flex items-center gap-2">
                <span className="led led-emerald"></span>
                <span className="font-semibold uppercase tracking-wide">Upload Dataset</span>
              </div>
              <button className="btn btn-ghost btn-xs p-1" onClick={() => setShowUploadModal(false)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Dataset Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., code-reviews-javascript"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Dataset Type
                </label>
                <select className="input-field font-mono">
                  <option value="code_review">Code Review</option>
                  <option value="preference">Preference Pairs</option>
                  <option value="rl_reward">RL Reward</option>
                  <option value="qa">Question Answering</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  File Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['JSONL', 'JSON', 'CSV'].map((fmt) => (
                    <button
                      key={fmt}
                      className="btn btn-ghost border border-obsidian-border hover:border-tactical-primary text-tactical-text-secondary hover:text-tactical-primary"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Upload File
                </label>
                <div className="border-2 border-dashed border-obsidian-border rounded-tactical p-8 text-center hover:border-tactical-primary/50 transition-all cursor-pointer bg-obsidian-surface/30">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-tactical-text-muted" />
                  <p className="text-sm text-tactical-text-secondary mb-1">
                    Drag and drop your file here, or click to browse
                  </p>
                  <p className="text-xs text-tactical-text-muted font-mono">
                    Supports JSONL, JSON, CSV (max 500MB)
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Data Split
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-tactical-text-muted mb-1">Train %</label>
                    <input type="number" className="input-field font-mono" placeholder="80" />
                  </div>
                  <div>
                    <label className="block text-xs text-tactical-text-muted mb-1">Val %</label>
                    <input type="number" className="input-field font-mono" placeholder="15" />
                  </div>
                  <div>
                    <label className="block text-xs text-tactical-text-muted mb-1">Test %</label>
                    <input type="number" className="input-field font-mono" placeholder="5" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 pt-0">
              <button
                className="btn btn-ghost"
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Dataset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
