'use client'

import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-8 py-6 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-lg font-semibold text-red-700 dark:text-red-400">
                Ocurrió un error inesperado
              </p>
              {this.state.message && (
                <p className="mt-2 font-mono text-xs text-red-500 dark:text-red-500">
                  {this.state.message}
                </p>
              )}
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                Reintentar
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
