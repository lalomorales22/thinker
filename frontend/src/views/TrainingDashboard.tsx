import { Play, Pause, Trash2, Plus, Clock, Zap, TrendingUp, Server, Cpu, Activity, Target, Database as DatabaseIcon, Brain, GitBranch, Info, HelpCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

interface TrainingJob {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed' | 'queued' | 'cancelled'
  baseModel: string
  trainingType: 'SL' | 'RL' | 'RLHF' | 'DPO'
  progress: number
  currentStep: number
  totalSteps: number
  loss?: number
  reward?: number
  timeElapsed: string
  createdAt: string
}

export default function TrainingDashboard() {
  const backendUrl = useStore((state) => state.backendUrl)
  const apiKey = useStore((state) => state.apiKey)
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [showNewJobModal, setShowNewJobModal] = useState(false)
  const [datasets, setDatasets] = useState<any[]>([])

  // Form State
  const [jobName, setJobName] = useState('')
  const [baseModel, setBaseModel] = useState('Qwen/Qwen3-30B-A3B-Base')
  const [trainingType, setTrainingType] = useState<'SL' | 'RL' | 'RLHF' | 'DPO'>('SL')
  const [selectedDataset, setSelectedDataset] = useState('')
  const [learningRate, setLearningRate] = useState('1e-4')
  const [loraRank, setLoraRank] = useState('32')
  const [batchSize, setBatchSize] = useState('4')
  const [totalSteps, setTotalSteps] = useState('100')
  const [showTrainingTypeInfo, setShowTrainingTypeInfo] = useState(false)
  const [showMetricsInfo, setShowMetricsInfo] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<string>('')

  // Fetch datasets on mount
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/datasets/`, {
          headers: {
            'X-API-Key': apiKey
          }
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
  }, [backendUrl, apiKey])

  // Fetch jobs on mount and poll
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/training/jobs`, {
          headers: {
            'X-API-Key': apiKey
          }
        })
        if (response.ok) {
          const data = await response.json()
          // Transform backend data to frontend interface if needed
          // For now assuming direct mapping or close enough
          const mappedJobs = data.jobs.map((j: any) => ({
            id: j.job_id,
            name: j.config?.model_name || 'Unnamed Job',
            status: j.status,
            baseModel: j.config?.model_name || 'Unknown',
            trainingType: j.config?.training_type || 'SL',
            progress: j.metrics?.progress || 0,
            currentStep: j.currentStep || 0,
            totalSteps: j.config?.num_steps || 0,
            loss: j.metrics?.loss,
            reward: j.metrics?.reward,
            timeElapsed: '0s', // calc from started_at
            createdAt: j.started_at || new Date().toISOString()
          }))
          setJobs(mappedJobs)
        }
      } catch (error) {
        console.error('Failed to fetch jobs:', error)
      }
    }

    fetchJobs()
    const interval = setInterval(fetchJobs, 2000)
    return () => clearInterval(interval)
  }, [backendUrl, apiKey])

  const handleDeployJob = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/training/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          model_name: baseModel,
          rank: parseInt(loraRank),
          learning_rate: parseFloat(learningRate),
          num_steps: parseInt(totalSteps),
          batch_size: parseInt(batchSize),
          training_type: trainingType,
          dataset_id: selectedDataset || null
        })
      })

      if (response.ok) {
        setShowNewJobModal(false)
        // Reset form
        setSelectedDataset('')
      } else {
        console.error('Failed to deploy job')
      }
    } catch (error) {
      console.error('Error deploying job:', error)
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/training/jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey
        }
      })

      if (response.ok) {
        // Refresh jobs list
        setJobs(jobs.filter(j => j.id !== jobId))
      } else {
        console.error('Failed to delete job')
      }
    } catch (error) {
      console.error('Error deleting job:', error)
    }
  }

  const handleToggleJob = async (jobId: string, currentStatus: string) => {
    // For now, this is a placeholder since pause/resume isn't fully implemented in backend
    console.log(`Toggle job ${jobId} from ${currentStatus}`)
    // TODO: Implement pause/resume API endpoint in backend
  }

  const getStatusLED = (status: string) => {
    switch (status) {
      case 'running': return 'led-cyan'
      case 'completed': return 'led-green'
      case 'failed': return 'led-red'
      case 'queued': return 'led-yellow'
      default: return 'led-teal'
    }
  }

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'SL': return { bg: 'bg-led-blue/20', text: 'text-led-blue', border: 'border-led-blue/30' }
      case 'RL': return { bg: 'bg-led-green/20', text: 'text-led-green', border: 'border-led-green/30' }
      case 'RLHF': return { bg: 'bg-led-purple/20', text: 'text-led-purple', border: 'border-led-purple/30' }
      case 'DPO': return { bg: 'bg-led-orange/20', text: 'text-led-orange', border: 'border-led-orange/30' }
      default: return { bg: 'bg-led-teal/20', text: 'text-led-teal', border: 'border-led-teal/30' }
    }
  }

  return (
    <div className="h-full flex flex-col bg-obsidian-bg overflow-hidden">
      {/* Header */}
      <div className="tactical-panel-header">
        <div className="flex items-center gap-3">
          <span className="led led-cyan"></span>
          <span className="font-display font-semibold uppercase tracking-wider">Training Operations</span>
        </div>
        <button
          className="btn btn-primary btn-sm flex items-center gap-2"
          onClick={() => setShowNewJobModal(true)}
        >
          <Plus className="w-3.5 h-3.5" />
          Deploy New Job
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Top Stats Grid - 3 rows */}
        <div className="grid grid-cols-4 gap-3">
          {/* Row 1: Primary Metrics */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-cyan"></span>
                <span className="text-xs text-tactical-text-secondary uppercase tracking-wide">Active Jobs</span>
              </div>
              <Play className="w-4 h-4 text-led-cyan" />
            </div>
            <div className="text-2xl font-bold text-glow-cyan">{jobs.filter(j => j.status === 'running').length}</div>
            <div className="text-xs text-tactical-text-muted mt-1">Currently training</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-green"></span>
                <span className="text-xs text-tactical-text-secondary uppercase tracking-wide">Completed</span>
              </div>
              <TrendingUp className="w-4 h-4 text-led-green" />
            </div>
            <div className="text-2xl font-bold text-led-green">{jobs.filter(j => j.status === 'completed').length}</div>
            <div className="text-xs text-tactical-text-muted mt-1">Successful runs</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-yellow"></span>
                <span className="text-xs text-tactical-text-secondary uppercase tracking-wide">Queued</span>
              </div>
              <Clock className="w-4 h-4 text-led-yellow" />
            </div>
            <div className="text-2xl font-bold text-led-yellow">{jobs.filter(j => j.status === 'queued').length}</div>
            <div className="text-xs text-tactical-text-muted mt-1">Pending start</div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-red"></span>
                <span className="text-xs text-tactical-text-secondary uppercase tracking-wide">Failed</span>
              </div>
              <Trash2 className="w-4 h-4 text-led-red" />
            </div>
            <div className="text-2xl font-bold text-led-red">{jobs.filter(j => j.status === 'failed').length}</div>
            <div className="text-xs text-tactical-text-muted mt-1">Error states</div>
          </div>

          {/* Row 2: Resource Metrics */}
          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-purple"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">GPU Util</span>
              </div>
              <Cpu className="w-4 h-4 text-led-purple" />
            </div>
            <div className="text-xl font-bold">0%</div>
            <div className="progress-bar mt-2">
              <div className="progress-fill" style={{ width: '0%' }}></div>
            </div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-teal"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Total Steps</span>
              </div>
              <Zap className="w-4 h-4 text-led-teal" />
            </div>
            <div className="text-xl font-bold font-mono">{jobs.reduce((sum, j) => sum + j.currentStep, 0).toLocaleString()}</div>
            <div className="text-xs text-tactical-text-muted mt-1">Training iterations</div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-orange"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">GPU Hours</span>
              </div>
              <Server className="w-4 h-4 text-led-orange" />
            </div>
            <div className="text-xl font-bold">0.0</div>
            <div className="text-xs text-tactical-text-muted mt-1">Compute time</div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-lime"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Avg Loss</span>
              </div>
              <Activity className="w-4 h-4 text-led-lime" />
            </div>
            <div className="text-xl font-bold font-mono">--</div>
            <div className="text-xs text-tactical-text-muted mt-1">Current epoch</div>
          </div>

          {/* Row 3: Model Stats */}
          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-blue"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Models</span>
              </div>
              <Brain className="w-4 h-4 text-led-blue" />
            </div>
            <div className="text-xl font-bold">0</div>
            <div className="text-xs text-tactical-text-muted mt-1">Trained agents</div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-emerald"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Datasets</span>
              </div>
              <DatabaseIcon className="w-4 h-4 text-led-emerald" />
            </div>
            <div className="text-xl font-bold">0</div>
            <div className="text-xs text-tactical-text-muted mt-1">Available</div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-magenta"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Success Rate</span>
              </div>
              <Target className="w-4 h-4 text-led-magenta" />
            </div>
            <div className="text-xl font-bold">--</div>
            <div className="text-xs text-tactical-text-muted mt-1">Job completion</div>
          </div>

          <div className="tactical-widget">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="led led-yellow"></span>
                <span className="text-xs text-tactical-text-secondary uppercase">Checkpoints</span>
              </div>
              <GitBranch className="w-4 h-4 text-led-yellow" />
            </div>
            <div className="text-xl font-bold">0</div>
            <div className="text-xs text-tactical-text-muted mt-1">Saved states</div>
          </div>
        </div>

        {/* Active Training Jobs */}
        <div className="tactical-panel-elevated">
          <div className="tactical-panel-header">
            <div className="flex items-center gap-2">
              <span className="led led-cyan animate-pulse"></span>
              <span className="text-xs font-semibold uppercase tracking-wider">Active Training Operations</span>
            </div>
            <span className="text-xs text-tactical-text-muted font-mono">{jobs.length} total</span>
          </div>

          <div className="p-4">
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Zap className="w-12 h-12 text-tactical-primary/30 mb-3" />
                <p className="text-sm text-tactical-text-secondary mb-1">No training operations</p>
                <p className="text-xs text-tactical-text-muted">Deploy a new job to begin training</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => {
                  const badge = getTypeBadge(job.trainingType)
                  return (
                    <div
                      key={job.id}
                      className="tactical-panel p-3 hover:border-tactical-primary/40 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className={`led ${getStatusLED(job.status)}`}></span>
                          <div>
                            <h3 className="font-semibold text-sm">{job.name}</h3>
                            <p className="text-xs text-tactical-text-muted font-mono">{job.baseModel}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-tactical-sm text-xs font-medium border ${badge.bg} ${badge.text} ${badge.border}`}>
                            {job.trainingType}
                          </span>
                          <button
                            className="btn btn-ghost btn-xs p-1"
                            onClick={() => handleToggleJob(job.id, job.status)}
                          >
                            {job.status === 'running' ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            className="btn btn-ghost btn-xs p-1 text-led-red hover:text-led-red"
                            onClick={() => handleDeleteJob(job.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-tactical-text-muted mb-1.5">
                          <span>Step {job.currentStep.toLocaleString()} / {job.totalSteps.toLocaleString()}</span>
                          <span className="font-mono">{job.progress.toFixed(1)}%</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-4 text-xs">
                        {job.loss !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="led led-blue"></span>
                            <span className="text-tactical-text-muted">Loss:</span>
                            <span className="font-mono text-led-blue">{job.loss.toFixed(3)}</span>
                          </div>
                        )}
                        {job.reward !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="led led-green"></span>
                            <span className="text-tactical-text-muted">Reward:</span>
                            <span className="font-mono text-led-green">{job.reward.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="led led-cyan"></span>
                          <Clock className="w-3 h-3 text-tactical-text-muted" />
                          <span className="text-tactical-text-muted font-mono">{job.timeElapsed}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Job Modal */}
      {showNewJobModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="tactical-panel-elevated w-full max-w-2xl mx-4">
            <div className="tactical-panel-header">
              <div className="flex items-center gap-2">
                <span className="led led-cyan"></span>
                <span className="font-semibold uppercase tracking-wide">Deploy Training Operation</span>
              </div>
              <button className="btn btn-ghost btn-xs p-1" onClick={() => setShowNewJobModal(false)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Job Name
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g., Code Review Agent v2"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Base Model
                </label>
                <select
                  className="input-field"
                  value={baseModel}
                  onChange={(e) => setBaseModel(e.target.value)}
                >
                  <option value="Qwen/Qwen3-30B-A3B-Base">Qwen/Qwen3-30B-A3B-Base</option>
                  <option value="Qwen/Qwen3-8B-Base">Qwen/Qwen3-8B-Base</option>
                  <option value="meta-llama/Llama-3.1-8B">meta-llama/Llama-3.1-8B</option>
                  <option value="meta-llama/Llama-3.2-1B">meta-llama/Llama-3.2-1B</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Training Dataset
                </label>
                <select
                  className="input-field"
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                >
                  <option value="">No dataset (simulated training)</option>
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} ({dataset.numSamples} samples, {dataset.format})
                    </option>
                  ))}
                </select>
                {datasets.length === 0 && (
                  <p className="text-xs text-tactical-text-muted mt-1">
                    No datasets uploaded. Go to Dataset Manager to upload training data.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide">
                    Training Type
                  </label>
                  <button
                    className="text-led-cyan hover:text-led-cyan/80 transition-colors"
                    onClick={() => setShowTrainingTypeInfo(true)}
                    title="Learn about training types"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['SL', 'RL', 'RLHF', 'DPO'].map((type) => {
                    const badge = getTypeBadge(type as any)
                    const isSelected = trainingType === type
                    return (
                      <button
                        key={type}
                        className={`btn btn-ghost border ${isSelected ? 'bg-tactical-primary/20 border-tactical-primary text-tactical-primary' : `${badge.border} ${badge.text} hover:${badge.bg}`}`}
                        onClick={() => setTrainingType(type as any)}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide">
                      Learning Rate
                    </label>
                    <button
                      className="text-led-cyan/60 hover:text-led-cyan transition-colors"
                      onClick={() => { setSelectedMetric('learningRate'); setShowMetricsInfo(true); }}
                      title="Learn about learning rate"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="1e-4"
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide">
                      LoRA Rank
                    </label>
                    <button
                      className="text-led-cyan/60 hover:text-led-cyan transition-colors"
                      onClick={() => { setSelectedMetric('loraRank'); setShowMetricsInfo(true); }}
                      title="Learn about LoRA rank"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="32"
                    value={loraRank}
                    onChange={(e) => setLoraRank(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide">
                      Batch Size
                    </label>
                    <button
                      className="text-led-cyan/60 hover:text-led-cyan transition-colors"
                      onClick={() => { setSelectedMetric('batchSize'); setShowMetricsInfo(true); }}
                      title="Learn about batch size"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="4"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide">
                      Total Steps
                    </label>
                    <button
                      className="text-led-cyan/60 hover:text-led-cyan transition-colors"
                      onClick={() => { setSelectedMetric('totalSteps'); setShowMetricsInfo(true); }}
                      title="Learn about total steps"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="100"
                    value={totalSteps}
                    onChange={(e) => setTotalSteps(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 pt-0">
              <button className="btn btn-ghost" onClick={() => setShowNewJobModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary flex items-center gap-2"
                onClick={handleDeployJob}
              >
                <Play className="w-4 h-4" />
                Deploy Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Training Type Info Modal */}
      {showTrainingTypeInfo && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="tactical-panel-elevated w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="tactical-panel-header sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-led-cyan" />
                <span className="font-semibold uppercase tracking-wide">Training Type Guide</span>
              </div>
              <button className="btn btn-ghost btn-xs p-1" onClick={() => setShowTrainingTypeInfo(false)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* SL */}
              <div className="tactical-panel p-4 border-l-4 border-led-blue">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 rounded-tactical-sm text-sm font-bold bg-led-blue/20 text-led-blue border border-led-blue/30">SL</span>
                  <h3 className="font-bold text-lg">Supervised Learning</h3>
                </div>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-blue">What it is:</strong> The model learns from labeled input→output examples.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-blue">When to use:</strong> You have correct examples (e.g., code + review pairs), task has clear right/wrong answers, you want the model to mimic your examples.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-blue">How it works:</strong> Model sees input, predicts output token by token, compares to correct output, adjusts to make correct output more likely.
                </p>
                <p className="text-sm text-tactical-text-secondary">
                  <strong className="text-led-blue">Example:</strong> Code review pairs, Q&A datasets, text + summary pairs.
                </p>
              </div>

              {/* RL */}
              <div className="tactical-panel p-4 border-l-4 border-led-green">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 rounded-tactical-sm text-sm font-bold bg-led-green/20 text-led-green border border-led-green/30">RL</span>
                  <h3 className="font-bold text-lg">Reinforcement Learning</h3>
                </div>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-green">What it is:</strong> The model learns from rewards/scores, not perfect examples.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-green">When to use:</strong> You can score outputs but don't have perfect examples, task has many correct answers, you want to optimize for a metric.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-green">How it works:</strong> Model generates multiple outputs, each gets a reward score, high-reward outputs are reinforced, low-reward outputs are suppressed.
                </p>
                <p className="text-sm text-tactical-text-secondary">
                  <strong className="text-led-green">Example:</strong> Code that passes tests (+1 reward), fast code (reward based on speed), user feedback (thumbs up/down).
                </p>
              </div>

              {/* RLHF */}
              <div className="tactical-panel p-4 border-l-4 border-led-purple">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 rounded-tactical-sm text-sm font-bold bg-led-purple/20 text-led-purple border border-led-purple/30">RLHF</span>
                  <h3 className="font-bold text-lg">RL from Human Feedback</h3>
                </div>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-purple">What it is:</strong> Two-stage training using human preferences.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-purple">When to use:</strong> You have pairwise comparisons (A is better than B), humans can judge quality but can't create perfect examples, you want to align with subjective preferences.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-purple">How it works:</strong> <span className="text-led-cyan">Stage 1:</span> Train reward model from human preferences. <span className="text-led-cyan">Stage 2:</span> Use reward model scores for RL training.
                </p>
                <p className="text-sm text-tactical-text-secondary">
                  <strong className="text-led-purple">Dataset format:</strong> Prompt + chosen response + rejected response pairs.
                </p>
              </div>

              {/* DPO */}
              <div className="tactical-panel p-4 border-l-4 border-led-orange">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 rounded-tactical-sm text-sm font-bold bg-led-orange/20 text-led-orange border border-led-orange/30">DPO</span>
                  <h3 className="font-bold text-lg">Direct Preference Optimization</h3>
                </div>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-orange">What it is:</strong> Learn from preferences WITHOUT a separate reward model.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-orange">When to use:</strong> Same as RLHF but you want simpler/faster training.
                </p>
                <p className="text-sm text-tactical-text-secondary mb-3">
                  <strong className="text-led-orange">How it works:</strong> Directly update model to increase P(chosen) and decrease P(rejected). One-stage instead of two-stage like RLHF.
                </p>
                <p className="text-sm text-tactical-text-secondary">
                  <strong className="text-led-orange">Advantages:</strong> Simpler (one model vs two), faster (no reward model training), more stable (no RL optimization issues).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Info Modal */}
      {showMetricsInfo && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="tactical-panel-elevated w-full max-w-2xl">
            <div className="tactical-panel-header">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-led-cyan" />
                <span className="font-semibold uppercase tracking-wide">Metric Guide</span>
              </div>
              <button className="btn btn-ghost btn-xs p-1" onClick={() => setShowMetricsInfo(false)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {selectedMetric === 'learningRate' && (
                <div className="space-y-3">
                  <h3 className="font-bold text-lg text-led-cyan">Learning Rate</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-tactical-text-primary">What:</strong> <span className="text-tactical-text-secondary">Size of optimization steps during training.</span></p>
                    <p><strong className="text-tactical-text-primary">LoRA Typical:</strong> <span className="text-tactical-text-secondary font-mono">1e-4 to 5e-4</span></p>
                    <p><strong className="text-tactical-text-primary">Full Fine-tune Typical:</strong> <span className="text-tactical-text-secondary font-mono">1e-5 to 5e-5</span></p>
                    <div className="tactical-panel p-3 bg-led-red/10 border border-led-red/20">
                      <p className="text-xs"><strong className="text-led-red">⚠ Too high:</strong> Training unstable, loss increases or spikes</p>
                      <p className="text-xs"><strong className="text-led-yellow">⚠ Too low:</strong> Training extremely slow, may not converge</p>
                    </div>
                    <p className="text-xs text-tactical-text-muted italic">Tip: Start with 1e-4 for LoRA training. Reduce by half if you see loss spikes.</p>
                  </div>
                </div>
              )}

              {selectedMetric === 'loraRank' && (
                <div className="space-y-3">
                  <h3 className="font-bold text-lg text-led-cyan">LoRA Rank</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-tactical-text-primary">What:</strong> <span className="text-tactical-text-secondary">Model capacity/parameter count for LoRA adapters.</span></p>
                    <p><strong className="text-tactical-text-primary">Low (16-32):</strong> <span className="text-tactical-text-secondary">Fast training, good for small datasets (&lt;1000 examples)</span></p>
                    <p><strong className="text-tactical-text-primary">High (64-128):</strong> <span className="text-tactical-text-secondary">Slower training, better for large datasets (&gt;10k examples)</span></p>
                    <div className="tactical-panel p-3 bg-led-cyan/10 border border-led-cyan/20">
                      <p className="text-xs"><strong className="text-led-cyan">📊 Tradeoff:</strong> Higher rank = more capacity but slower training and more memory</p>
                    </div>
                    <p className="text-xs text-tactical-text-muted italic">Tip: Start with 32 for most tasks. Use 64+ only if your model isn't learning well.</p>
                  </div>
                </div>
              )}

              {selectedMetric === 'batchSize' && (
                <div className="space-y-3">
                  <h3 className="font-bold text-lg text-led-cyan">Batch Size</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-tactical-text-primary">What:</strong> <span className="text-tactical-text-secondary">Number of examples processed together in one training step.</span></p>
                    <p><strong className="text-tactical-text-primary">Larger (8-16):</strong> <span className="text-tactical-text-secondary">Faster training, needs more GPU memory, more stable gradients</span></p>
                    <p><strong className="text-tactical-text-primary">Smaller (1-4):</strong> <span className="text-tactical-text-secondary">Slower training, less GPU memory, noisier gradients</span></p>
                    <div className="tactical-panel p-3 bg-led-orange/10 border border-led-orange/20">
                      <p className="text-xs"><strong className="text-led-orange">💡 Memory:</strong> If you get out-of-memory errors, reduce batch size</p>
                    </div>
                    <p className="text-xs text-tactical-text-muted italic">Tip: Use 4-8 for most LoRA training. Larger batches generally give better results.</p>
                  </div>
                </div>
              )}

              {selectedMetric === 'totalSteps' && (
                <div className="space-y-3">
                  <h3 className="font-bold text-lg text-led-cyan">Total Steps</h3>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-tactical-text-primary">What:</strong> <span className="text-tactical-text-secondary">Total number of training iterations/updates.</span></p>
                    <p><strong className="text-tactical-text-primary">Formula:</strong> <span className="text-tactical-text-secondary font-mono">steps = (dataset_size / batch_size) * num_epochs</span></p>
                    <p><strong className="text-tactical-text-primary">Example:</strong> <span className="text-tactical-text-secondary">1000 examples, batch size 4, 2 epochs = 500 steps</span></p>
                    <div className="tactical-panel p-3 bg-led-green/10 border border-led-green/20">
                      <p className="text-xs"><strong className="text-led-green">✓ Sweet spot:</strong> 2-3 epochs is usually optimal. More can lead to overfitting.</p>
                    </div>
                    <p className="text-xs text-tactical-text-muted italic">Tip: Monitor loss - when it stops improving, you can stop training early.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
