/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global Error Boundary for TrustGate AI.
 * Catches any 'Chaos' events (timeouts/API failures) and provides safe fallbacks.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] [Uncaught Error]:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback as React.ReactElement;
      }

      return (
        <section 
          className="p-12 flex flex-col items-center justify-center space-y-6 text-center"
          role="alert"
          aria-labelledby="error-heading"
          aria-describedby="error-description"
        >
          <div className="p-4 bg-rose-100 rounded-full">
            <AlertTriangle className="w-12 h-12 text-rose-600" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 id="error-heading" className="text-2xl font-bold text-slate-900 tracking-tight">
              A System Error Occurred
            </h2>
            <p id="error-description" className="text-slate-500 max-w-md mx-auto">
              The TrustGate AI engine encountered an unexpected failure. This could be due to a network timeout or API instability.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center space-x-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
            aria-label="Reset application and retry"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>Reset & Retry</span>
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
