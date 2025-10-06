import { Activity, TrendingUp, Zap, Clock } from 'lucide-react'

export default function MetricsPanel() {
  const metrics = [
    { label: 'Training Step', value: '0 / 1000', icon: Zap, color: 'text-brain-blue-500' },
    { label: 'Loss', value: '—', icon: TrendingUp, color: 'text-green-500' },
    { label: 'Reward', value: '—', icon: Activity, color: 'text-yellow-500' },
    { label: 'Time Elapsed', value: '0s', icon: Clock, color: 'text-purple-500' },
  ]

  return (
    <div className="h-full flex flex-col bg-dark-surface overflow-hidden">
      {/* Header */}
      <div className="panel-header">
        <span className="text-sm font-semibold">METRICS</span>
        <span className="led led-gray"></span>
      </div>

      {/* Metrics Grid */}
      <div className="p-4 space-y-3">
        {metrics.map((metric, idx) => (
          <div key={idx} className="panel p-3 space-y-2">
            <div className="flex items-center gap-2">
              <metric.icon className={`w-4 h-4 ${metric.color}`} />
              <span className="text-xs text-dark-text-secondary">{metric.label}</span>
            </div>
            <div className="text-xl font-semibold font-mono">{metric.value}</div>
          </div>
        ))}
      </div>

      {/* Training Config */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4">
        <div className="panel p-3 mb-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-brain-blue-500" />
            Training Config
          </h3>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-dark-text-secondary">Model:</span>
              <span>Llama-3.2-1B</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-text-secondary">LoRA Rank:</span>
              <span>32</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-text-secondary">Learning Rate:</span>
              <span>1e-4</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dark-text-secondary">Batch Size:</span>
              <span>4</span>
            </div>
          </div>
        </div>

        <div className="panel p-3 mb-4">
          <h3 className="text-sm font-semibold mb-3">System Status</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-dark-text-secondary">Backend</span>
              <div className="flex items-center gap-2">
                <span className="led led-green"></span>
                <span className="text-green-500">Online</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-text-secondary">Tinker API</span>
              <div className="flex items-center gap-2">
                <span className="led led-yellow"></span>
                <span className="text-yellow-500">Pending</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-dark-text-secondary">WebSocket</span>
              <div className="flex items-center gap-2">
                <span className="led led-green"></span>
                <span className="text-green-500">Connected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="border-t border-dark-border p-3">
        <div className="text-xs text-dark-text-secondary space-y-1">
          <div>GPU: Not allocated</div>
          <div>Mode: Development</div>
        </div>
      </div>
    </div>
  )
}
