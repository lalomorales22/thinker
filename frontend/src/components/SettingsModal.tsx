import { X, Heart } from 'lucide-react'
import { useStore } from '../store/useStore'

interface SettingsModalProps {
  onClose: () => void
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    apiKey, setApiKey,
    backendUrl, setBackendUrl,
    baseModel, setBaseModel,
    loraRank, setLoraRank,
    learningRate, setLearningRate,
    batchSize, setBatchSize,
    editorFontSize, setEditorFontSize,
    showMinimap, setShowMinimap,
    smoothScrolling, setSmoothScrolling
  } = useStore()

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="tactical-panel-elevated w-full max-w-2xl max-h-[80vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="tactical-panel-header">
          <div className="flex items-center gap-2">
            <span className="led led-cyan"></span>
            <span className="font-display font-semibold uppercase tracking-wider text-sm">System Settings</span>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-xs p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(80vh-120px)] space-y-5">
          {/* API Configuration */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="led led-purple"></span>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-tactical-text-secondary">API Configuration</h3>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                  Tinker API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter your Tinker API key"
                  className="input-tactical font-mono text-xs"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                  Backend URL
                </label>
                <input
                  type="text"
                  className="input-tactical font-mono text-xs"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Training Defaults */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="led led-teal"></span>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-tactical-text-secondary">Training Defaults</h3>
            </div>
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                    Base Model
                  </label>
                  <select
                    className="input-tactical font-mono text-xs"
                    value={baseModel}
                    onChange={(e) => setBaseModel(e.target.value)}
                  >
                    <option>meta-llama/Llama-3.2-1B</option>
                    <option>meta-llama/Llama-3.2-3B</option>
                    <option>Qwen/Qwen2.5-7B-Instruct</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                    LoRA Rank
                  </label>
                  <input
                    type="number"
                    className="input-tactical font-mono text-xs"
                    value={loraRank}
                    onChange={(e) => setLoraRank(parseInt(e.target.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                    Learning Rate
                  </label>
                  <input
                    type="text"
                    className="input-tactical font-mono text-xs"
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                    Batch Size
                  </label>
                  <input
                    type="number"
                    className="input-tactical font-mono text-xs"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="led led-blue"></span>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-tactical-text-secondary">Appearance</h3>
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-medium text-tactical-text-secondary mb-1.5 uppercase tracking-wide">
                  Editor Font Size
                </label>
                <input
                  type="number"
                  className="input-tactical font-mono text-xs"
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(parseInt(e.target.value))}
                />
              </div>
              <div className="tactical-panel p-2.5 flex items-center justify-between">
                <span className="text-xs text-tactical-text-secondary">Show Minimap</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-tactical-primary"
                  checked={showMinimap}
                  onChange={(e) => setShowMinimap(e.target.checked)}
                />
              </div>
              <div className="tactical-panel p-2.5 flex items-center justify-between">
                <span className="text-xs text-tactical-text-secondary">Smooth Scrolling</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-tactical-primary"
                  checked={smoothScrolling}
                  onChange={(e) => setSmoothScrolling(e.target.checked)}
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="led led-green"></span>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-tactical-text-secondary">About</h3>
            </div>
            <div className="tactical-widget-glow p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-tactical-text-secondary">Version</span>
                <span className="font-mono text-tactical-primary">1.0.0</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tactical-text-secondary">Framework</span>
                <span className="font-mono text-tactical-primary">Tinker API</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-tactical-text-secondary">Theme</span>
                <span className="font-mono text-tactical-primary">Obsidian Tactical</span>
              </div>
              <div className="pt-2 border-t border-obsidian-border text-center">
                <div className="flex items-center justify-center gap-2 text-tactical-text-muted text-xs">
                  <span>made w</span>
                  <Heart className="w-3.5 h-3.5 fill-led-red text-led-red animate-pulse-slow" />
                  <span>by lalo for Mira</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-obsidian-border p-4 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            Cancel
          </button>
          <button onClick={onClose} className="btn btn-primary btn-sm">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
