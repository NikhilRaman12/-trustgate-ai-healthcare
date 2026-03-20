/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { AlertCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Fallback UI for the Error Boundary.
 * Catches any 'Chaos' events (timeouts/API failures) and provides safe fallbacks.
 */
function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const handleReset = () => {
    resetErrorBoundary();
    window.location.reload();
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-rose-100 p-8 text-center"
      >
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-slate-900 mb-2">System Interruption</h2>
        <p className="text-slate-500 text-sm mb-8">
          TrustGate AI encountered an unexpected "Chaos" event. 
          Our self-healing protocols are active, but a manual reset may be required.
        </p>

        <div className="bg-rose-50 rounded-2xl p-4 mb-8 flex items-start gap-3 text-left">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-rose-900 uppercase tracking-wider">Error Details</p>
            <p className="text-xs text-rose-700 mt-1 font-mono break-all">
              {error instanceof Error ? error.message : "Unknown System Failure"}
            </p>
          </div>
        </div>

        <button
          onClick={handleReset}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg"
        >
          <RefreshCcw className="w-5 h-5" />
          Reset System State
        </button>
        
        <p className="mt-6 text-[10px] text-slate-400 uppercase font-bold tracking-widest">
          Safe Fallback Active ◈ Audit Log Generated
        </p>
      </motion.div>
    </div>
  );
}

/**
 * Global Error Boundary Wrapper.
 */
export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset logic handled in FallbackComponent
      }}
      onError={(error, info) => {
        console.error("Uncaught error:", error, info);
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
