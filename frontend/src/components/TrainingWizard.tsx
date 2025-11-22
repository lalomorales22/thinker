import { useState } from 'react'
import { ArrowRight, ArrowLeft, Check, Code, MessageSquare, ThumbsUp, Zap, Upload, Database, Settings, Play, X } from 'lucide-react'
import { useStore } from '../store/useStore'

interface TrainingWizardProps {
  onClose: () => void
  onComplete: (config: any) => void
}

type Step = 1 | 2 | 3 | 4

export default function TrainingWizard({ onClose, onComplete }: TrainingWizardProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1)
  const [selectedGoal, setSelectedGoal] = useState<string>('')
  const [selectedDataset, setSelectedDataset] = useState<string>('')
  const [useExampleDataset, setUseExampleDataset] = useState(false)
  const backendUrl = useStore((state) => state.backendUrl)
  const apiKey = useStore((state) => state.apiKey)
  const [datasets, setDatasets] = useState<any[]>([])

  // Config state
  const [config, setConfig] = useState({
    jobName: '',
    baseModel: 'Qwen/Qwen3-8B-Base',
    trainingType: 'SL' as 'SL' | 'RL' | 'RLHF' | 'DPO',
    learningRate: '1e-4',
    loraRank: '32',
    batchSize: '4',
    totalSteps: '1000'
  })

  // Fetch datasets on mount
  useState(() => {
    const fetchDatasets = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/datasets/`, {
          headers: { 'X-API-Key': apiKey }
        })
        if (response.ok) {
          const data = await response.json()
          setDatasets(data.datasets || [])
        }
      } catch (error) {
        console.error('Failed to fetch datasets:', error)
      }
    }
    fetchDatasets()
  })

  const goals = [
    {
      id: 'code-review',
      title: 'Review Code',
      description: 'Train a model to review and critique code',
      icon: Code,
      trainingType: 'SL',
      example: 'Code review pairs, code + feedback datasets'
    },
    {
      id: 'qa',
      title: 'Answer Questions',
      description: 'Train a model to answer questions accurately',
      icon: MessageSquare,
      trainingType: 'SL',
      example: 'Q&A datasets, instruction-following data'
    },
    {
      id: 'feedback',
      title: 'Improve with Feedback',
      description: 'Train using human preferences and feedback',
      icon: ThumbsUp,
      trainingType: 'DPO',
      example: 'Preference pairs (chosen/rejected responses)'
    },
    {
      id: 'optimize',
      title: 'Optimize for Rewards',
      description: 'Train to maximize a reward signal',
      icon: Zap,
      trainingType: 'RL',
      example: 'Task-based rewards, test pass/fail metrics'
    }
  ]

  const handleGoalSelect = (goalId: string) => {
    setSelectedGoal(goalId)
    const goal = goals.find(g => g.id === goalId)
    if (goal) {
      setConfig(prev => ({
        ...prev,
        trainingType: goal.trainingType as any,
        jobName: `${goal.title} Model - ${new Date().toLocaleDateString()}`
      }))
    }
  }

  const getRecommendedConfig = () => {
    const datasetSize = selectedDataset && datasets.length > 0
      ? datasets.find(d => d.id === selectedDataset)?.numSamples || 0
      : 1000

    let rank = '32'
    let lr = '1e-4'
    let steps = '1000'
    let batchSize = '4'

    if (datasetSize < 100) {
      rank = '16'
      lr = '3e-4'
      steps = '500'
      batchSize = '2'
    } else if (datasetSize < 1000) {
      rank = '32'
      lr = '1e-4'
      steps = '1000'
      batchSize = '4'
    } else if (datasetSize < 10000) {
      rank = '64'
      lr = '5e-5'
      steps = '2000'
      batchSize = '8'
    } else {
      rank = '128'
      lr = '1e-5'
      steps = '5000'
      batchSize = '16'
    }

    setConfig(prev => ({
      ...prev,
      loraRank: rank,
      learningRate: lr,
      totalSteps: steps,
      batchSize
    }))
  }

  const estimateTrainingTime = () => {
    const steps = parseInt(config.totalSteps)
    const batchSize = parseInt(config.batchSize)
    // Rough estimate: ~1 second per step for small models
    const totalSeconds = steps
    const minutes = Math.floor(totalSeconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `~${hours}h ${minutes % 60}m`
    return `~${minutes}m`
  }

  const estimateCost = () => {
    const steps = parseInt(config.totalSteps)
    // Very rough estimate: $0.0001 per step
    const cost = (steps * 0.0001).toFixed(2)
    return `$${cost}`
  }

  const handleNext = () => {
    if (currentStep === 2 && selectedDataset) {
      getRecommendedConfig()
    }
    setCurrentStep(Math.min(4, currentStep + 1) as Step)
  }

  const handleBack = () => {
    setCurrentStep(Math.max(1, currentStep - 1) as Step)
  }

  const handleFinish = () => {
    onComplete({
      ...config,
      dataset_id: selectedDataset || null,
      model_name: config.baseModel,
      rank: parseInt(config.loraRank),
      learning_rate: parseFloat(config.learningRate),
      num_steps: parseInt(config.totalSteps),
      batch_size: parseInt(config.batchSize),
      training_type: config.trainingType
    })
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedGoal !== ''
      case 2: return selectedDataset !== '' || useExampleDataset
      case 3: return true
      case 4: return true
      default: return false
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="tactical-panel-elevated w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="tactical-panel-header">
          <div className="flex items-center gap-3">
            <span className="led led-cyan"></span>
            <span className="font-semibold uppercase tracking-wide">Training Wizard</span>
            <span className="text-xs text-tactical-text-muted">Step {currentStep} of 4</span>
          </div>
          <button className="btn btn-ghost btn-xs p-1" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step < currentStep
                    ? 'bg-led-green text-obsidian-bg'
                    : step === currentStep
                    ? 'bg-tactical-primary text-obsidian-bg ring-2 ring-tactical-primary/50'
                    : 'bg-obsidian-surface border-2 border-obsidian-border text-tactical-text-muted'
                }`}>
                  {step < currentStep ? <Check className="w-4 h-4" /> : step}
                </div>
                {step < 4 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-all ${
                    step < currentStep ? 'bg-led-green' : 'bg-obsidian-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-tactical-text-muted">
            <span>Goal</span>
            <span>Data</span>
            <span>Config</span>
            <span>Review</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Choose Goal */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">What's your goal?</h2>
                <p className="text-tactical-text-secondary">Choose what you want your model to do. We'll configure everything automatically.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {goals.map((goal) => {
                  const Icon = goal.icon
                  const isSelected = selectedGoal === goal.id
                  return (
                    <button
                      key={goal.id}
                      className={`tactical-panel p-4 text-left transition-all hover:border-tactical-primary/50 ${
                        isSelected ? 'border-tactical-primary bg-tactical-primary/10' : ''
                      }`}
                      onClick={() => handleGoalSelect(goal.id)}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`p-2 rounded-tactical ${
                          isSelected ? 'bg-tactical-primary/20 text-tactical-primary' : 'bg-obsidian-surface text-tactical-text-muted'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold mb-1">{goal.title}</h3>
                          <p className="text-sm text-tactical-text-secondary">{goal.description}</p>
                        </div>
                        {isSelected && <Check className="w-5 h-5 text-tactical-primary" />}
                      </div>
                      <div className="text-xs text-tactical-text-muted">
                        <span className="text-led-cyan">Example:</span> {goal.example}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2: Prepare Data */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Prepare your training data</h2>
                <p className="text-tactical-text-secondary">Select a dataset or use an example to get started.</p>
              </div>

              <div className="space-y-3">
                {/* Upload Dataset Option */}
                <div className={`tactical-panel p-4 cursor-pointer transition-all ${
                  selectedDataset && !useExampleDataset ? 'border-tactical-primary bg-tactical-primary/10' : 'hover:border-tactical-primary/30'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <Database className="w-5 h-5 text-led-emerald" />
                    <h3 className="font-semibold">Use existing dataset</h3>
                  </div>
                  <select
                    className="input-field"
                    value={selectedDataset}
                    onChange={(e) => {
                      setSelectedDataset(e.target.value)
                      setUseExampleDataset(false)
                    }}
                  >
                    <option value="">Select a dataset...</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.id} value={dataset.id}>
                        {dataset.name} ({dataset.numSamples} samples, {dataset.format})
                      </option>
                    ))}
                  </select>
                  {datasets.length === 0 && (
                    <p className="text-xs text-tactical-text-muted mt-2">
                      No datasets uploaded yet. Go to Dataset Manager to upload data.
                    </p>
                  )}
                </div>

                {/* Example Dataset Option */}
                <button
                  className={`tactical-panel p-4 text-left w-full transition-all ${
                    useExampleDataset ? 'border-tactical-primary bg-tactical-primary/10' : 'hover:border-tactical-primary/30'
                  }`}
                  onClick={() => {
                    setUseExampleDataset(true)
                    setSelectedDataset('')
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-led-yellow" />
                      <div>
                        <h3 className="font-semibold">Use example dataset</h3>
                        <p className="text-sm text-tactical-text-secondary">Try with pre-loaded sample data</p>
                      </div>
                    </div>
                    {useExampleDataset && <Check className="w-5 h-5 text-tactical-primary" />}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Configure Training */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Configure training parameters</h2>
                <p className="text-tactical-text-secondary">We've pre-filled optimal settings based on your data. Adjust if needed.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Base Model
                  </label>
                  <select
                    className="input-field"
                    value={config.baseModel}
                    onChange={(e) => setConfig({...config, baseModel: e.target.value})}
                  >
                    <optgroup label="🦖 Large Models (70B+)">
                      <option value="Qwen/Qwen3-235B-A22B-Instruct-2507">Qwen3-235B Instruct (⚡ MoE)</option>
                      <option value="deepseek-ai/DeepSeek-V3.1">DeepSeek-V3.1 (🤔 Hybrid MoE)</option>
                      <option value="deepseek-ai/DeepSeek-V3.1-Base">DeepSeek-V3.1-Base (🐙 Base MoE)</option>
                      <option value="meta-llama/Llama-3.1-70B">Llama-3.1-70B (🐙 Base Dense)</option>
                      <option value="meta-llama/Llama-3.3-70B-Instruct">Llama-3.3-70B Instruct (⚡ Dense)</option>
                    </optgroup>
                    <optgroup label="🦅 Medium Models (30B-32B)">
                      <option value="Qwen/Qwen3-30B-A3B-Instruct-2507">Qwen3-30B Instruct (⚡ MoE)</option>
                      <option value="Qwen/Qwen3-30B-A3B">Qwen3-30B (🤔 Hybrid MoE)</option>
                      <option value="Qwen/Qwen3-30B-A3B-Base">Qwen3-30B-Base (🐙 Base MoE)</option>
                      <option value="Qwen/Qwen3-32B">Qwen3-32B (🤔 Hybrid Dense)</option>
                      <option value="openai/gpt-oss-120b">GPT-OSS-120B (💭 Reasoning MoE)</option>
                    </optgroup>
                    <optgroup label="🦆 Small Models (8B)">
                      <option value="Qwen/Qwen3-8B">Qwen3-8B (🤔 Hybrid Dense)</option>
                      <option value="Qwen/Qwen3-8B-Base">Qwen3-8B-Base (🐙 Base Dense)</option>
                      <option value="meta-llama/Llama-3.1-8B">Llama-3.1-8B (🐙 Base Dense)</option>
                      <option value="meta-llama/Llama-3.1-8B-Instruct">Llama-3.1-8B Instruct (⚡ Dense)</option>
                      <option value="openai/gpt-oss-20b">GPT-OSS-20B (💭 Reasoning MoE)</option>
                    </optgroup>
                    <optgroup label="🐣 Compact Models (1B-4B)">
                      <option value="Qwen/Qwen3-4B-Instruct-2507">Qwen3-4B Instruct (⚡ Dense)</option>
                      <option value="meta-llama/Llama-3.2-3B">Llama-3.2-3B (🐙 Base Dense)</option>
                      <option value="meta-llama/Llama-3.2-1B">Llama-3.2-1B (🐙 Base Dense)</option>
                    </optgroup>
                  </select>
                  <p className="text-xs text-tactical-text-muted mt-1">
                    🐙 Base | ⚡ Instruction | 💭 Reasoning | 🤔 Hybrid | MoE = Cost-effective
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Training Type
                  </label>
                  <input
                    className="input-field font-mono bg-obsidian-surface/50 cursor-not-allowed"
                    value={config.trainingType}
                    disabled
                  />
                  <p className="text-xs text-tactical-text-muted mt-1">Based on your goal selection</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Learning Rate
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    value={config.learningRate}
                    onChange={(e) => setConfig({...config, learningRate: e.target.value})}
                  />
                  <p className="text-xs text-led-cyan mt-1">Recommended for your dataset size</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    LoRA Rank
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    value={config.loraRank}
                    onChange={(e) => setConfig({...config, loraRank: e.target.value})}
                  />
                  <p className="text-xs text-led-cyan mt-1">Optimized for your data</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Batch Size
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    value={config.batchSize}
                    onChange={(e) => setConfig({...config, batchSize: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Total Steps
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    value={config.totalSteps}
                    onChange={(e) => setConfig({...config, totalSteps: e.target.value})}
                  />
                  <p className="text-xs text-tactical-text-muted mt-1">~2-3 epochs recommended</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Launch */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2">Ready to launch!</h2>
                <p className="text-tactical-text-secondary">Review your configuration and start training.</p>
              </div>

              <div className="tactical-panel p-6 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Job Name</h3>
                    <p className="text-sm">{config.jobName}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Goal</h3>
                    <p className="text-sm">{goals.find(g => g.id === selectedGoal)?.title}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Base Model</h3>
                    <p className="text-sm font-mono">{config.baseModel}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Training Type</h3>
                    <p className="text-sm font-mono">{config.trainingType}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Dataset</h3>
                    <p className="text-sm">
                      {useExampleDataset ? 'Example dataset' : datasets.find(d => d.id === selectedDataset)?.name || 'None'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">Total Steps</h3>
                    <p className="text-sm font-mono">{config.totalSteps}</p>
                  </div>
                </div>

                <div className="border-t border-obsidian-border pt-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="tactical-widget">
                      <div className="text-xs text-tactical-text-secondary mb-1">Estimated Time</div>
                      <div className="text-2xl font-bold text-led-cyan">{estimateTrainingTime()}</div>
                    </div>
                    <div className="tactical-widget">
                      <div className="text-xs text-tactical-text-secondary mb-1">Estimated Cost</div>
                      <div className="text-2xl font-bold text-led-green">{estimateCost()}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tactical-panel p-4 bg-led-cyan/10 border border-led-cyan/30">
                <h3 className="font-semibold mb-2 text-led-cyan">What happens next?</h3>
                <ol className="space-y-1 text-sm text-tactical-text-secondary">
                  <li>1. Training job will be queued and start within a few seconds</li>
                  <li>2. You'll see real-time progress updates in the Training Dashboard</li>
                  <li>3. Model checkpoints will be saved every 500 steps</li>
                  <li>4. Once complete, test your model in the Playground</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-0 border-t border-obsidian-border">
          <div>
            {currentStep > 1 && (
              <button className="btn btn-ghost flex items-center gap-2" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost" onClick={onClose}>
              Skip Wizard
            </button>
            {currentStep < 4 ? (
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleNext}
                disabled={!canProceed()}
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleFinish}
              >
                <Play className="w-4 h-4" />
                Launch Training
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
