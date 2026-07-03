import { Component, ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-8">
        <div className="card card-pad max-w-lg w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-berry-soft text-berry-ink flex items-center justify-center mx-auto mb-4 text-2xl">!</div>
          <h1 className="font-display font-bold text-xl text-ink">Something broke</h1>
          <p className="text-sm text-ink-soft mt-2">The screen hit an unexpected error. Reloading usually fixes it.</p>
          {this.state.error && (
            <pre className="text-left text-xs text-ink-mute font-mono bg-line-soft rounded-xl p-3 mt-4 overflow-x-auto">{this.state.error.message}</pre>
          )}
          <div className="flex gap-2 justify-center mt-5">
            <button className="btn btn-outline" onClick={() => this.setState({ hasError: false, error: null })}>Try again</button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    )
  }
}
