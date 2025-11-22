import { TrendingUp, Activity, Award, Target, BarChart3, LineChart } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'

interface MetricCard {
  label: string
  value: string | number
  change: string
  changeType: 'positive' | 'negative' | 'neutral'
  icon: any
}

interface TrainingRun {
  name: string
  loss: number | null
  reward: number | null
  accuracy: number | null
  steps: number
}

export default function Analytics() {
  const backendUrl = useStore((state) => state.backendUrl)
  const apiKey = useStore((state) => state.apiKey)
  const [metrics, setMetrics] = useState<MetricCard[]>([])
  const [trainingRuns, setTrainingRuns] = useState<TrainingRun[]>([])
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d')

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // Fetch summary metrics
        const summaryResponse = await fetch(`${backendUrl}/api/analytics/summary`, {
          headers: {
            'X-API-Key': apiKey
          }
        })
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json()

          // Transform backend metrics to frontend format
          const fetchedMetrics: MetricCard[] = summaryData.metrics.map((metric: any) => ({
            label: metric.label,
            value: metric.value,
            change: metric.change,
            changeType: metric.trend === 'up' ? 'positive' : metric.trend === 'down' ? 'negative' : 'neutral',
            icon: getIconForMetric(metric.label)
          }))
          setMetrics(fetchedMetrics)
        }

        // Fetch training runs
        const runsResponse = await fetch(`${backendUrl}/api/analytics/training-runs`, {
          headers: {
            'X-API-Key': apiKey
          }
        })
        if (runsResponse.ok) {
          const runsData = await runsResponse.json()

          // Transform backend training runs to frontend format
          const fetchedRuns: TrainingRun[] = runsData.training_runs.map((run: any) => ({
            name: run.name,
            loss: run.loss || null,
            reward: null,  // Not currently tracked
            accuracy: null,  // Not currently tracked
            steps: run.steps
          }))
          setTrainingRuns(fetchedRuns)
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
      }
    }

    fetchAnalytics()

    // Refresh analytics every 5 seconds
    const interval = setInterval(fetchAnalytics, 5000)
    return () => clearInterval(interval)
  }, [backendUrl, apiKey])

  // Helper function to get icon for metric
  const getIconForMetric = (label: string) => {
    switch (label.toLowerCase()) {
      case 'total models':
        return Target
      case 'training jobs':
        return Activity
      case 'success rate':
        return Award
      case 'gpu hours':
        return TrendingUp
      default:
        return BarChart3
    }
  }

  return (
    <div className="h-full flex flex-col bg-obsidian-bg overflow-y-auto">
      {/* Header */}
      <div className="tactical-panel-header sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <span className="led led-emerald"></span>
          <span className="font-display font-semibold uppercase tracking-wider">Analytics Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-tactical text-xs px-3 py-1.5 font-mono"
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Metric Cards */}
        {metrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="w-16 h-16 text-tactical-500 mb-4 opacity-50" />
            <h3 className="text-lg font-semibold text-dark-text mb-2">No analytics data yet</h3>
            <p className="text-sm text-dark-text-secondary max-w-md">
              Start training models to see analytics and performance metrics. Data will appear here once training begins.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {metrics.map((metric, idx) => (
              <div
                key={idx}
                className="bg-dark-surface border border-dark-border rounded-ide p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <metric.icon className="w-5 h-5 text-brain-blue-500" />
                  <span
                    className={`text-xs font-medium ${
                      metric.changeType === 'positive'
                        ? 'text-green-400'
                        : metric.changeType === 'negative'
                        ? 'text-red-400'
                        : 'text-dark-text-secondary'
                    }`}
                  >
                    {metric.change}
                  </span>
                </div>
                <div className="text-2xl font-semibold mb-1">{metric.value}</div>
                <div className="text-xs text-dark-text-secondary">{metric.label}</div>
              </div>
            ))}
          </div>
        )}

        {metrics.length > 0 && (
          <>
            {/* Training Loss Chart (Placeholder) */}
            <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-brain-blue-500" />
                  Training Loss Over Time
                </h3>
                <div className="flex items-center gap-2">
                  <button className="btn btn-ghost btn-sm text-xs">SL</button>
                  <button className="btn btn-ghost btn-sm text-xs">RL</button>
                  <button className="btn btn-ghost btn-sm text-xs">RLHF</button>
                </div>
              </div>

              {/* Chart placeholder - will be replaced with Recharts */}
              <div className="h-64 bg-dark-hover rounded flex items-center justify-center">
                <div className="text-center text-dark-text-secondary">
                  <LineChart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Chart will render here with Recharts</p>
                  <p className="text-xs mt-1">Install: npm install recharts</p>
                </div>
              </div>
            </div>

            {/* Reward Distribution (Placeholder) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-brain-blue-500" />
                    Reward Distribution
                  </h3>
                </div>
                <div className="h-48 bg-dark-hover rounded flex items-center justify-center">
                  <div className="text-center text-dark-text-secondary">
                    <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Histogram placeholder</p>
                  </div>
                </div>
              </div>

              <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-brain-blue-500" />
                    Learning Rate Schedule
                  </h3>
                </div>
                <div className="h-48 bg-dark-hover rounded flex items-center justify-center">
                  <div className="text-center text-dark-text-secondary">
                    <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">LR schedule placeholder</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Training Runs Comparison */}
            <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
              <h3 className="font-semibold mb-4">Training Runs Comparison</h3>
              {trainingRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <LineChart className="w-12 h-12 text-tactical-500 mb-3 opacity-50" />
                  <p className="text-sm text-dark-text-secondary">No training runs to compare</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-border">
                        <th className="text-left py-2 px-3 text-dark-text-secondary font-medium">Model</th>
                        <th className="text-right py-2 px-3 text-dark-text-secondary font-medium">Steps</th>
                        <th className="text-right py-2 px-3 text-dark-text-secondary font-medium">Loss</th>
                        <th className="text-right py-2 px-3 text-dark-text-secondary font-medium">Reward</th>
                        <th className="text-right py-2 px-3 text-dark-text-secondary font-medium">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trainingRuns.map((run, idx) => (
                        <tr key={idx} className="border-b border-dark-border/50 hover:bg-dark-hover">
                          <td className="py-3 px-3 font-medium">{run.name}</td>
                          <td className="py-3 px-3 text-right font-mono text-dark-text-secondary">
                            {run.steps.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {run.loss !== null ? (
                              <span className="text-blue-400">{run.loss.toFixed(3)}</span>
                            ) : (
                              <span className="text-dark-text-secondary">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {run.reward !== null ? (
                              <span className="text-green-400">{run.reward.toFixed(2)}</span>
                            ) : (
                              <span className="text-dark-text-secondary">-</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            {run.accuracy !== null ? (
                              <span className="text-purple-400">{(run.accuracy * 100).toFixed(1)}%</span>
                            ) : (
                              <span className="text-dark-text-secondary">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Evaluation Results */}
            <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
              <h3 className="font-semibold mb-4">Evaluation Results</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="border border-dark-border rounded p-3">
                  <div className="text-xs text-dark-text-secondary mb-1">InspectAI - MMLU</div>
                  <div className="text-2xl font-semibold text-blue-400">72.3%</div>
                </div>
                <div className="border border-dark-border rounded p-3">
                  <div className="text-xs text-dark-text-secondary mb-1">InspectAI - IFEval</div>
                  <div className="text-2xl font-semibold text-green-400">84.1%</div>
                </div>
                <div className="border border-dark-border rounded p-3">
                  <div className="text-xs text-dark-text-secondary mb-1">Custom - Code Review</div>
                  <div className="text-2xl font-semibold text-purple-400">89.4%</div>
                </div>
              </div>
            </div>

            {/* System Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
                <h3 className="font-semibold mb-4">GPU Utilization</h3>
                <div className="space-y-3">
                  {['GPU 0', 'GPU 1', 'GPU 2', 'GPU 3'].map((gpu, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-dark-text-secondary">{gpu}</span>
                        <span className="font-mono">{75 + idx * 3}%</span>
                      </div>
                      <div className="h-1.5 bg-dark-hover rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brain-blue-500"
                          style={{ width: `${75 + idx * 3}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-dark-surface border border-dark-border rounded-ide p-4">
                <h3 className="font-semibold mb-4">Resource Usage</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">GPU Memory:</span>
                    <span className="font-mono">24.3 / 32 GB</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">CPU Usage:</span>
                    <span className="font-mono">45%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">RAM:</span>
                    <span className="font-mono">18.2 / 64 GB</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-dark-text-secondary">Network I/O:</span>
                    <span className="font-mono">124 MB/s</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
