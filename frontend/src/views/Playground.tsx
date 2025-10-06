import { Send, RotateCcw, Copy, ThumbsUp, ThumbsDown, Zap, Settings, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import Editor from '@monaco-editor/react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: {
    model?: string
    tokens?: number
    latency?: number
  }
}

export default function Playground() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState('code-review-agent-v1')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(512)
  const [showSettings, setShowSettings] = useState(false)
  const [codeInput, setCodeInput] = useState('')

  const handleSend = () => {
    if (!input.trim() && !codeInput.trim()) return

    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input || `Review this code:\n\n${codeInput}`,
      timestamp: new Date().toLocaleTimeString()
    }

    setMessages([...messages, newMessage])
    setInput('')

    // TODO: Connect to API endpoint
    // POST /api/chat/completions with message and selected model
  }

  return (
    <div className="h-full flex bg-obsidian-bg">
      {/* Left Panel - Code Editor */}
      <div className="flex-1 flex flex-col border-r border-obsidian-border">
        <div className="tactical-panel-header">
          <div className="flex items-center gap-2">
            <span className="led led-teal"></span>
            <span className="text-xs font-semibold uppercase tracking-wider">Code Input</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input-tactical text-xs px-3 py-1.5 font-mono"
              value="python"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
            <button className="btn btn-ghost btn-xs p-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1">
          <Editor
            language="python"
            theme="vs-dark"
            value={codeInput}
            onChange={(value) => setCodeInput(value || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>

        <div className="border-t border-obsidian-border p-3">
          <button
            className="btn btn-primary w-full flex items-center justify-center gap-2"
            onClick={handleSend}
          >
            <Zap className="w-4 h-4" />
            Review Code
          </button>
        </div>
      </div>

      {/* Right Panel - Chat Interface */}
      <div className="flex-1 flex flex-col">
        <div className="tactical-panel-header">
          <div className="flex items-center gap-2">
            <span className="led led-blue"></span>
            <span className="text-xs font-semibold uppercase tracking-wider">Conversation</span>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input-tactical text-xs px-3 py-1.5 font-mono"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="code-review-agent-v1">code-review-agent-v1</option>
              <option value="self-review-agent">self-review-agent</option>
              <option value="Qwen3-30B-A3B-Base">Qwen3-30B-A3B-Base</option>
            </select>
            <button
              className="btn btn-ghost btn-xs p-1.5"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button className="btn btn-ghost btn-xs p-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b border-obsidian-border p-4 bg-obsidian-surface space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">Temperature: {temperature}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max Tokens: {maxTokens}</label>
              <input
                type="range"
                min="64"
                max="2048"
                step="64"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-16 h-16 text-tactical-500 mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-dark-text mb-2">No messages yet</h3>
              <p className="text-sm text-dark-text-secondary max-w-md">
                Start a conversation by entering code or sending a message. Your chat history will appear here.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-ide p-3 ${
                    message.role === 'user'
                      ? 'bg-brain-blue-500/20 border border-brain-blue-500/50'
                      : 'bg-dark-surface border border-dark-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-dark-text-secondary">
                      {message.role === 'user' ? 'You' : message.metadata?.model || 'Assistant'}
                    </span>
                    <span className="text-xs text-dark-text-secondary">{message.timestamp}</span>
                  </div>

                  <div className="text-sm whitespace-pre-wrap prose prose-invert max-w-none">
                    {message.content}
                  </div>

                  {message.metadata && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-dark-border text-xs text-dark-text-secondary">
                      <span>{message.metadata.tokens} tokens</span>
                      <span>{message.metadata.latency}s</span>
                    </div>
                  )}

                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-border">
                      <button className="btn btn-ghost btn-sm p-1.5" title="Copy">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5 text-green-400" title="Good response">
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5 text-red-400" title="Bad response">
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="border-t border-dark-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              className="input-field flex-1 resize-none"
              rows={3}
              placeholder="Ask a question or request a code review..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
            />
            <button
              className="btn btn-primary p-2.5"
              onClick={handleSend}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-dark-text-secondary mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
