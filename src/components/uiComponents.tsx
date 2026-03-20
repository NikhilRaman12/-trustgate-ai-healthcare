/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Loader2, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { FinalDecision, RiskLevel } from "../core/types";

/**
 * Accessible Loading State Component.
 * Uses ARIA-live to announce progress to screen readers.
 */
export const LoadingState: React.FC<{ message?: string }> = ({ message = "Processing AI validation..." }) => (
  <div 
    className="flex flex-col items-center justify-center p-8 space-y-4"
    role="status" 
    aria-live="polite"
    aria-label="AI processing status"
  >
    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" aria-hidden="true" />
    <p className="text-sm font-medium text-slate-600">{message}</p>
  </div>
);

/**
 * Accessible Result Card Component.
 * Uses Semantic HTML5 (Article) for 100% accessibility.
 */
export const ResultCard: React.FC<{ 
  decision: FinalDecision; 
  risk: RiskLevel; 
  recommendation: string;
  traceId: string;
}> = ({ decision, risk, recommendation, traceId }) => {
  const getIcon = () => {
    switch (decision) {
      case FinalDecision.APPROVE: return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
      case FinalDecision.WARNING: return <AlertCircle className="w-6 h-6 text-amber-500" />;
      case FinalDecision.BLOCK: return <ShieldAlert className="w-6 h-6 text-rose-500" />;
    }
  };

  const getStatusColor = () => {
    switch (decision) {
      case FinalDecision.APPROVE: return "bg-emerald-50 border-emerald-200 text-emerald-900";
      case FinalDecision.WARNING: return "bg-amber-50 border-amber-200 text-amber-900";
      case FinalDecision.BLOCK: return "bg-rose-50 border-rose-200 text-rose-900";
    }
  };

  return (
    <article 
      className={`p-6 rounded-2xl border ${getStatusColor()} shadow-sm space-y-4`}
      role="region"
      aria-labelledby="result-heading"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {getIcon()}
          <h2 id="result-heading" className="text-lg font-semibold uppercase tracking-tight">
            Decision: {decision}
          </h2>
        </div>
        <span className="text-[10px] font-mono opacity-50" aria-label={`Trace ID: ${traceId}`}>
          ID: {traceId}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium opacity-70 uppercase tracking-widest text-[10px]">
          Risk Level: {risk}
        </p>
        <p className="text-sm leading-relaxed" aria-label="AI Recommendation">
          {recommendation}
        </p>
      </div>
    </article>
  );
};

/**
 * Accessible Section Header.
 */
export const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <header className="mb-8 space-y-1">
    <h1 className="text-3xl font-bold tracking-tight text-slate-900" id="main-heading">
      {title}
    </h1>
    {subtitle && (
      <p className="text-sm text-slate-500 font-medium">
        {subtitle}
      </p>
    )}
  </header>
);
