import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, a render error in any one page (missing IPC method after a
 * stale preload build, a bad API response, whatever) unmounts the whole
 * React tree and leaves the app permanently blank — nothing left to click,
 * not even navigation, since App.tsx itself is inside the crashed tree.
 *
 * Mounted per-route with `key={pathname}` (see App.tsx) so navigating away
 * from the crashed page remounts a fresh boundary automatically.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] caught render error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl rounded-lg border border-red-900 bg-red-950/40 p-4">
          <p className="font-medium text-red-300">Esta página tuvo un error y no se pudo mostrar.</p>
          <p className="mt-1 text-sm text-neutral-400">{this.state.error.message}</p>
          <a href="#/" className="mt-3 inline-block rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-white">
            Volver al inicio
          </a>
        </div>
      )
    }
    return this.props.children
  }
}
