import { Play, Pause, Trash2, Plus, Clock, Zap, TrendingUp, Server, Cpu, Activity, Target, Database as DatabaseIcon, Brain, GitBranch } from 'lucide-react'
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
                <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                  Training Type
                </label>
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
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Learning Rate
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="1e-4"
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    LoRA Rank
                  </label>
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
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Batch Size
                  </label>
                  <input
                    type="text"
                    className="input-field font-mono"
                    placeholder="4"
                    value={batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-tactical-text-secondary uppercase tracking-wide mb-2">
                    Total Steps
                  </label>
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
    </div>
  )
}
