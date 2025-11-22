import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, BookOpen, Loader2, Server } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponse {
  message: string;
  suggested_config?: any;
  actions?: Array<{ type: string; [key: string]: any }>;
}

interface OllamaModel {
  name: string;
  size: number;
}

interface AITrainingAssistantProps {
  onCreateJob?: (config: any) => void;
}

export default function AITrainingAssistant({ onCreateJob }: AITrainingAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI training assistant for Thinker. I'm here to help you train custom models using the Tinker SDK.\n\n**What I can help with:**\n- Choosing the right training type (SL, RL, RLHF, DPO)\n- Configuring hyperparameters\n- Understanding the Thinker platform and its features\n- Troubleshooting training issues\n\nTo get started, tell me:\n1. What task do you want your model to perform?\n2. Do you have training data already?\n\nFor example: 'I want to train a model to review Python code' or 'Help me understand DPO training'."
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedConfig, setSuggestedConfig] = useState<any>(null);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3.2');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check Ollama availability on mount
  useEffect(() => {
    checkOllamaAvailability();
  }, []);

  const checkOllamaAvailability = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/assistant/models');
      const data = await response.json();
      setOllamaAvailable(data.available);
      setAvailableModels(data.models || []);
      // Set first model as default if available
      if (data.models && data.models.length > 0) {
        setSelectedModel(data.models[0].name);
      }
    } catch (error) {
      console.error('Failed to check Ollama availability:', error);
      setOllamaAvailable(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:8000/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel
        })
      });

      const data: AssistantResponse = await response.json();

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message
      }]);

      // Handle suggested config
      if (data.suggested_config) {
        setSuggestedConfig(data.suggested_config);
      }

      // Handle actions
      if (data.actions) {
        for (const action of data.actions) {
          if (action.type === 'create_job' && action.ready && onCreateJob) {
            // Don't auto-create, just show the suggestion
          }
        }
      }

    } catch (error) {
      console.error('Error chatting with assistant:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCreateJob = () => {
    if (suggestedConfig && onCreateJob) {
      onCreateJob(suggestedConfig);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "✅ Great! I've sent the configuration to create your training job. Check the Training Dashboard to monitor progress!"
      }]);
      setSuggestedConfig(null);
    }
  };

  const quickPrompts = [
    "I want to train a code review model",
    "Help me understand DPO vs RLHF",
    "What are the different views in Thinker?",
    "How should I format my dataset?"
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] rounded-lg border border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">AI Training Assistant</h2>
        </div>
        <div className="flex items-center gap-3">
          {ollamaAvailable !== null && (
            <div className="flex items-center gap-2 text-xs">
              <Server className={`w-4 h-4 ${ollamaAvailable ? 'text-green-400' : 'text-yellow-400'}`} />
              <span className={ollamaAvailable ? 'text-green-400' : 'text-yellow-400'}>
                {ollamaAvailable ? `Ollama (${availableModels.length} models)` : 'Ollama unavailable (using fallback)'}
              </span>
            </div>
          )}
          {ollamaAvailable && availableModels.length > 0 && (
            <select
              id="model-selector"
              name="model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              {availableModels.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <BookOpen className="w-4 h-4" />
            <span>Tinker SDK</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100'
                  : 'bg-gray-800/50 border border-gray-700 text-gray-100'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-2 text-xs text-purple-400">
                  <Sparkles className="w-3 h-3" />
                  <span>Assistant</span>
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2 text-purple-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {/* Suggested Configuration Card */}
        {suggestedConfig && (
          <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-purple-300">Suggested Configuration</h3>
              <button
                onClick={handleCreateJob}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded transition-colors"
              >
                Create Job
              </button>
            </div>
            <div className="space-y-2 text-xs text-gray-300">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500">Type:</span> {suggestedConfig.training_type}
                </div>
                <div>
                  <span className="text-gray-500">Model:</span> {suggestedConfig.model_name}
                </div>
                <div>
                  <span className="text-gray-500">LoRA Rank:</span> {suggestedConfig.rank}
                </div>
                <div>
                  <span className="text-gray-500">Learning Rate:</span> {suggestedConfig.learning_rate}
                </div>
                <div>
                  <span className="text-gray-500">Batch Size:</span> {suggestedConfig.batch_size}
                </div>
                <div>
                  <span className="text-gray-500">Steps:</span> {suggestedConfig.num_steps}
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <div className="text-xs text-gray-500 mb-2">Quick prompts:</div>
          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => setInput(prompt)}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-full border border-gray-700 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <textarea
            id="chat-input"
            name="chatMessage"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about training models..."
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}
