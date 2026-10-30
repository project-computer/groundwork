import { Component, type ReactNode } from 'react'
import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'

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
      <div className="flex flex-col items-center justify-center gap-2.5 min-h-[60vh] p-8 text-center" role="alert">
        <strong className="text-[17px]">{i18n._(msg`Something went wrong while drawing the workspace`)}</strong>
        <span className="font-mono text-muted-foreground text-[13px]">{this.state.error.message}</span>
        <span className="text-muted-foreground text-[13px]">{i18n._(msg`Your records are saved on this computer — nothing was lost.`)}</span>
        <div className="flex gap-2.5 mt-2">
          <button className="button primary" onClick={() => this.setState({ error: null })}>
            {i18n._(msg`Try again`)}
          </button>
          <button className="button secondary" onClick={() => window.location.reload()}>
            {i18n._(msg`Reload the app`)}
          </button>
        </div>
      </div>
    )
  }
}
