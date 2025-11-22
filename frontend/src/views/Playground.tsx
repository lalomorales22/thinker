import { Send, RotateCcw, Copy, ThumbsUp, ThumbsDown, Zap, Settings, MessageSquare, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useStore } from '../store/useStore'

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
  const backendUrl = useStore((state) => state.backendUrl)
  const apiKey = useStore((state) => state.apiKey)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(512)
  const [showSettings, setShowSettings] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/models/base/available`, {
          headers: {
            'X-API-Key': apiKey
          }
        })
        if (response.ok) {
          const data = await response.json()
          // Handle both string arrays and model objects with model_name property
          const models = data.models.map((model: string | { model_name: string }) =>
            typeof model === 'string' ? model : model.model_name
          )
          setAvailableModels(models)
          if (models.length > 0) {
            setSelectedModel(models[0])
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error)
        // Fallback
        setAvailableModels(['meta-llama/Llama-3.2-1B'])
      }
    }
    fetchModels()
  }, [backendUrl, apiKey])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if ((!input.trim() && !codeInput.trim()) || isLoading) return

    const userContent = input && codeInput
      ? `${input}\n\nCode Context:\n\`\`\`\n${codeInput}\n\`\`\``
      : input
        ? input
        : `Review this code:\n\n\`\`\`\n${codeInput}\n\`\`\``

    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date().toLocaleTimeString()
    }

    setMessages(prev => [...prev, newMessage])
    setInput('')
    setIsLoading(true)

    const startTime = Date.now()

    try {
      const response = await fetch(`${backendUrl}/api/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          model_name: selectedModel,
          messages: [{ role: 'user', content: userContent }],
          temperature: temperature,
          max_tokens: maxTokens
        })
      })

      if (response.ok) {
        const data = await response.json()
        const endTime = Date.now()

        const assistantMessage: Message = {
          id: `msg_${Date.now()}_a`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toLocaleTimeString(),
          metadata: {
            model: data.model,
            tokens: data.tokens_used,
            latency: (endTime - startTime) / 1000
          }
        }
        setMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error('Failed to get response')
      }
    } catch (error) {
      console.error('Chat error:', error)
      let errorMsg = "Sorry, I encountered an error processing your request."

      if (!apiKey) {
        errorMsg = "⚠️ API Key not set! Please go to Settings (top right) and enter your Tinker API key."
      } else if (!backendUrl) {
        errorMsg = "⚠️ Backend URL not configured! Please check Settings."
      } else {
        errorMsg = "❌ Error communicating with backend. Please ensure:\n1. Backend is running\n2. API key is correct\n3. Backend URL is correct"
      }

      const errorMessage: Message = {
        id: `msg_${Date.now()}_err`,
        role: 'assistant',
        content: errorMsg,
        timestamp: new Date().toLocaleTimeString()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-obsidian-bg">
      {/* API Key Warning Banner */}
      {!apiKey && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/50 px-4 py-2 text-sm text-yellow-200 flex items-center gap-2">
          <span>⚠️</span>
          <span>API Key not set! Please configure your Tinker API key in Settings to use the playground.</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
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
              defaultValue="python"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
            <button className="btn btn-ghost btn-xs p-1.5" onClick={() => setCodeInput('')}>
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
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
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
              className="input-tactical text-xs px-3 py-1.5 font-mono max-w-[200px]"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {availableModels.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            <button
              className={`btn btn-ghost btn-xs p-1.5 ${showSettings ? 'text-brain-blue-400' : ''}`}
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button className="btn btn-ghost btn-xs p-1.5" onClick={() => setMessages([])}>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b border-obsidian-border p-4 bg-obsidian-surface space-y-3 animate-in slide-in-from-top-2">
            <div>
              <div className="flex justify-between mb-1">
                <label className="block text-xs font-medium">Temperature</label>
                <span className="text-xs font-mono text-dark-text-secondary">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-brain-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="block text-xs font-medium">Max Tokens</label>
                <span className="text-xs font-mono text-dark-text-secondary">{maxTokens}</span>
              </div>
              <input
                type="range"
                min="64"
                max="4096"
                step="64"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full accent-brain-blue-500"
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
                Start a conversation by entering code or sending a message. Select a model from the dropdown to begin.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-ide p-3 ${message.role === 'user'
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

                  <div className="text-sm whitespace-pre-wrap prose prose-invert max-w-none font-sans">
                    {message.content}
                  </div>

                  {message.metadata && (
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-dark-border text-xs text-dark-text-secondary font-mono">
                      <span>{message.metadata.tokens} tokens</span>
                      <span>{message.metadata.latency?.toFixed(2)}s</span>
                    </div>
                  )}

                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-dark-border">
                      <button className="btn btn-ghost btn-sm p-1.5 hover:text-white" title="Copy">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5 text-green-400/70 hover:text-green-400" title="Good response">
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button className="btn btn-ghost btn-sm p-1.5 text-red-400/70 hover:text-red-400" title="Bad response">
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-dark-border p-3 bg-dark-bg">
          <div className="flex items-end gap-2">
            <textarea
              className="input-field flex-1 resize-none min-h-[80px]"
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
              disabled={isLoading}
            />
            <button
              className="btn btn-primary p-2.5 h-[42px] w-[42px] flex items-center justify-center"
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !codeInput.trim())}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-dark-text-secondary mt-2 flex justify-between">
            <span>Press Enter to send, Shift+Enter for new line</span>
            {isLoading && <span className="text-brain-blue-400 animate-pulse">Thinking...</span>}
          </p>
        </div>
      </div>
      </div>
    </div>
  )
}
