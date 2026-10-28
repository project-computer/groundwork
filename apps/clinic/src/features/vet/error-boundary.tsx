import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Keeps a render crash from blanking the whole clinic workspace. The document
 * on disk is untouched by a render error, so the recovery options are a retry
 * and a reload — never a data question.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('workspace render crash', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-screen" role="alert">
        <strong>Something went wrong while drawing the workspace</strong>
        <span className="crash-message">{this.state.error.message}</span>
        <span>Your records are saved on this computer — nothing was lost.</span>
        <div className="crash-actions">
          <button className="button primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="button secondary" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
