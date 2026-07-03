import { useState } from 'react'
import { KeyRound, Server, Bot, Plug, Eye, EyeOff, RefreshCw, ExternalLink, Sparkles } from 'lucide-react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { TermText } from '../lib/glossary'
import { Modal, Button, Input, Select, Field, Spinner, Badge, IconButton, toast } from './ui'

interface AssistantStatus {
  available: boolean
  models: string[]
  default: string
  error?: string
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  // Draft state — initialized from the store, only committed on Save so Cancel truly discards.
  const store = useStore()
  const [draftKey, setDraftKey] = useState(store.apiKey)
  const [draftUrl, setDraftUrl] = useState(store.backendUrl)
  const [draftModel, setDraftModel] = useState(store.ollamaModel)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)

  const { data: assistant, loading: assistantLoading, reload: reloadAssistant } =
    useAsync<AssistantStatus>(() => api.assistant.status(), [])

  async function testConnection() {
    setTesting(true)
    try {
      const h = await api.health()
      const parts = [
        h.tinker_api_key ? 'Tinker key set' : 'no Tinker key',
        h.tinker_sdk ? 'SDK ready' : 'SDK not installed',
        `${h.catalog_count} models (${h.catalog_source})`,
      ]
      toast(`Connected — ${parts.join(' · ')}`, 'ok')
    } catch (e: any) {
      toast(e.message || 'Could not reach the backend', 'error')
    } finally {
      setTesting(false)
    }
  }

  function save() {
    store.setApiKey(draftKey.trim())
    store.setBackendUrl(draftUrl.trim() || 'http://localhost:8000')
    store.setOllamaModel(draftModel)
    toast('Settings saved')
    onClose()
  }

  function replayWelcome() {
    store.setSeenWelcome(false)
    onClose()
  }

  // Keep the user's current selection available even if it's not in the live list.
  const ollamaOptions = assistant?.available
    ? Array.from(new Set([...(assistant.models || []), draftModel].filter(Boolean)))
    : []

  return (
    <Modal
      open
      onClose={onClose}
      title="Settings"
      subtitle="Connect Thinker to Tinker and Ollama"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Tinker API key */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-soft text-orange-ink flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </span>
            <h3 className="font-display font-bold text-ink">Tinker API key</h3>
          </div>
          <Field
            hint={
              <>
                Needed to actually train and chat with models. Without it you can still explore everything in{' '}
                <TermText id="dry_run">Demo mode</TermText>.{' '}
                <a className="link" href="https://tinker-docs.thinkingmachines.ai/" target="_blank" rel="noreferrer">
                  where do I get a key?
                </a>
              </>
            }
          >
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="sk-tinker-…"
                autoComplete="off"
                spellCheck={false}
                className="pr-11 font-mono"
              />
              <IconButton
                label={showKey ? 'Hide key' : 'Show key'}
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </IconButton>
            </div>
          </Field>
        </section>

        {/* Backend URL + test */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-soft text-orange-ink flex items-center justify-center">
              <Server className="w-4 h-4" />
            </span>
            <h3 className="font-display font-bold text-ink">Backend</h3>
          </div>
          <Field hint="Where the Thinker backend is running. The default is fine for most people.">
            <Input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="http://localhost:8000"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Button
            variant="outline"
            size="sm"
            loading={testing}
            icon={<Plug className="w-4 h-4" />}
            onClick={testConnection}
          >
            Test connection
          </Button>
        </section>

        {/* Ollama model for the assistant */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-soft text-orange-ink flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </span>
            <h3 className="font-display font-bold text-ink flex items-center gap-2">
              Assistant model
              {assistant?.available && <Badge tone="orange">Ollama running</Badge>}
            </h3>
          </div>

          {assistantLoading ? (
            <div className="flex items-center gap-2 text-sm text-ink-mute">
              <Spinner className="w-4 h-4" /> Checking Ollama…
            </div>
          ) : assistant?.available ? (
            <Field hint="Which local Ollama model powers the in-app assistant.">
              <Select value={draftModel} onChange={(e) => setDraftModel(e.target.value)}>
                <option value="">Server default{assistant.default ? ` (${assistant.default})` : ''}</option>
                {ollamaOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="rounded-xl border border-line bg-raised p-3.5 text-sm text-ink-soft space-y-1.5">
              <p>
                Ollama isn't running, so the assistant will fall back to a simple built-in helper.
              </p>
              <p className="text-ink-mute">
                Install and start{' '}
                <a className="link" href="https://ollama.com/" target="_blank" rel="noreferrer">
                  Ollama <ExternalLink className="w-3 h-3 inline-block -mt-0.5" />
                </a>{' '}
                for smarter, local answers.
              </p>
              <button onClick={() => reloadAssistant().catch(() => {})} className="link inline-flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" /> Check again
              </button>
            </div>
          )}
        </section>

        {/* Replay welcome */}
        <div className="pt-1 border-t border-line">
          <Button variant="ghost" size="sm" icon={<Sparkles className="w-4 h-4" />} onClick={replayWelcome}>
            Replay welcome
          </Button>
        </div>
      </div>
    </Modal>
  )
}
