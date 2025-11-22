import React, { useState } from 'react';
import { Users, Play, Trophy, GitBranch, Target, Zap, Loader2 } from 'lucide-react';
import { useStore } from '../store/useStore';

interface Agent {
  agent_id: string;
  score: number;
}

interface ArenaStats {
  num_agents: number;
  generation: number;
  mode: string;
  leaderboard: Agent[];
  history: any[];
}

export default function MultiAgentArena() {
  const backendUrl = useStore((state) => state.backendUrl);
  const [numAgents, setNumAgents] = useState(4);
  const [mode, setMode] = useState<'tournament' | 'collaborative' | 'swarm'>('tournament');
  const [numRounds, setNumRounds] = useState(3);
  const [tasks, setTasks] = useState('Review code\nOptimize SQL\nExplain algorithms');
  const [isRunning, setIsRunning] = useState(false);
  const [jobId, setJobId] = useState('');
  const [results, setResults] = useState<any>(null);

  const startMultiAgentTraining = async () => {
    setIsRunning(true);
    setResults(null);

    try {
      const response = await fetch(`${backendUrl}/api/training/multi-agent/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_agents: numAgents,
          base_model: 'meta-llama/Llama-3.2-1B',
          rank: 32,
          mode: mode,
          num_rounds: numRounds,
          tasks: tasks.split('\n').filter(t => t.trim())
        })
      });

      const data = await response.json();
      setJobId(data.job_id);

      // Poll for results
      pollForResults(data.job_id);
    } catch (error) {
      console.error('Error starting multi-agent training:', error);
      setIsRunning(false);
    }
  };

  const pollForResults = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${backendUrl}/api/training/jobs/${id}`);
        const job = await response.json();

        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(interval);
          setResults(job);
          setIsRunning(false);
        }
      } catch (error) {
        console.error('Error polling job:', error);
        clearInterval(interval);
        setIsRunning(false);
      }
    }, 2000);
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 bg-obsidian-bg">
      {/* Header */}
      <div className="tactical-widget-glow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-purple-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Multi-Agent Arena</h1>
              <p className="text-sm text-gray-400">Agents compete and collaborate to learn</p>
            </div>
          </div>
          <span className="led led-purple"></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="tactical-panel p-4">
            <h2 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Number of Agents</label>
                <input
                  type="number"
                  value={numAgents}
                  onChange={(e) => setNumAgents(parseInt(e.target.value))}
                  min={2}
                  max={10}
                  className="w-full px-3 py-2 bg-obsidian-elevated border border-obsidian-border rounded-tactical text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as any)}
                  className="w-full px-3 py-2 bg-obsidian-elevated border border-obsidian-border rounded-tactical text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <option value="tournament">Tournament (Competition)</option>
                  <option value="collaborative">Collaborative (Teamwork)</option>
                  <option value="swarm">Swarm (Evolution)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  {mode === 'swarm' ? 'Generations' : 'Rounds'}
                </label>
                <input
                  type="number"
                  value={numRounds}
                  onChange={(e) => setNumRounds(parseInt(e.target.value))}
                  min={1}
                  max={10}
                  className="w-full px-3 py-2 bg-obsidian-elevated border border-obsidian-border rounded-tactical text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Tasks (one per line)</label>
                <textarea
                  value={tasks}
                  onChange={(e) => setTasks(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-obsidian-elevated border border-obsidian-border rounded-tactical text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                />
              </div>

              <button
                onClick={startMultiAgentTraining}
                disabled={isRunning}
                className="w-full btn btn-primary flex items-center justify-center gap-2"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Start Arena
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Mode Info */}
          <div className="tactical-panel p-4 bg-purple-900/10">
            <h3 className="text-xs font-semibold text-purple-300 mb-2">Mode Info</h3>
            <p className="text-xs text-gray-400">
              {mode === 'tournament' && 'Agents compete on tasks individually. Best scorer wins.'}
              {mode === 'collaborative' && 'Agents work together: one creates, one critiques, one synthesizes.'}
              {mode === 'swarm' && 'Evolutionary approach: top agents survive and breed new generation.'}
            </p>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!results && !isRunning && (
            <div className="tactical-panel p-8 text-center">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">No Arena Running</h3>
              <p className="text-sm text-gray-500">Configure and start a multi-agent session to see results</p>
            </div>
          )}

          {isRunning && (
            <div className="tactical-panel p-8 text-center">
              <Loader2 className="w-16 h-16 text-purple-400 mx-auto mb-4 animate-spin" />
              <h3 className="text-lg font-semibold text-purple-300 mb-2">Arena Running</h3>
              <p className="text-sm text-gray-400">Agents are competing and learning...</p>
              <p className="text-xs text-gray-500 mt-2">Job ID: {jobId}</p>
            </div>
          )}

          {results && results.status === 'completed' && (
            <>
              {/* Leaderboard */}
              <div className="tactical-panel p-4">
                <h2 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Final Leaderboard
                </h2>

                {results.metrics?.stats?.leaderboard && (
                  <div className="space-y-2">
                    {results.metrics.stats.leaderboard.map((agent: Agent, idx: number) => (
                      <div
                        key={agent.agent_id}
                        className={`flex items-center justify-between p-3 rounded-tactical border ${
                          idx === 0
                            ? 'bg-yellow-900/20 border-yellow-500/30'
                            : 'bg-obsidian-elevated border-obsidian-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-bold ${
                            idx === 0 ? 'text-yellow-400' :
                            idx === 1 ? 'text-gray-300' :
                            idx === 2 ? 'text-orange-400' :
                            'text-gray-500'
                          }`}>
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-white">{agent.agent_id}</div>
                            {idx === 0 && <div className="text-xs text-yellow-400">🏆 Winner</div>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-purple-400">{agent.score.toFixed(3)}</div>
                          <div className="text-xs text-gray-500">points</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="tactical-panel p-4 text-center">
                  <Users className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{results.metrics?.stats?.num_agents || 0}</div>
                  <div className="text-xs text-gray-400">Agents</div>
                </div>
                <div className="tactical-panel p-4 text-center">
                  <GitBranch className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{results.metrics?.stats?.generation || 0}</div>
                  <div className="text-xs text-gray-400">Generations</div>
                </div>
                <div className="tactical-panel p-4 text-center">
                  <Zap className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-white">{mode}</div>
                  <div className="text-xs text-gray-400">Mode</div>
                </div>
              </div>

              {/* Raw Results (for debugging) */}
              <div className="tactical-panel p-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Details</h3>
                <div className="bg-obsidian-elevated p-3 rounded-tactical text-xs text-gray-400 font-mono max-h-64 overflow-y-auto">
                  <pre>{JSON.stringify(results.metrics, null, 2)}</pre>
                </div>
              </div>
            </>
          )}

          {results && results.status === 'failed' && (
            <div className="tactical-panel p-8 text-center border-red-500/30">
              <div className="text-red-400 text-lg font-semibold mb-2">Training Failed</div>
              <p className="text-sm text-gray-400">{results.metrics?.error || 'Unknown error'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
