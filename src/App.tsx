/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  XCircle, 
  Activity, 
  ClipboardList, 
  Stethoscope, 
  ArrowRight,
  Loader2,
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { validateHealthcareInput } from './services/geminiService';
import { TrustGateResponse, FinalDecision, RiskLevel } from './types';

export default function App() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrustGateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await validateHealthcareInput(input);
      setResult(response);
    } catch (err) {
      console.error(err);
      setError('Failed to process the request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getDecisionIcon = (decision: FinalDecision) => {
    switch (decision) {
      case FinalDecision.APPROVE: return <ShieldCheck className="w-6 h-6 text-emerald-500" />;
      case FinalDecision.WARNING: return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case FinalDecision.BLOCK: return <XCircle className="w-6 h-6 text-rose-500" />;
    }
  };

  const getDecisionColor = (decision: FinalDecision) => {
    switch (decision) {
      case FinalDecision.APPROVE: return 'bg-emerald-50 border-emerald-200 text-emerald-900';
      case FinalDecision.WARNING: return 'bg-amber-50 border-amber-200 text-amber-900';
      case FinalDecision.BLOCK: return 'bg-rose-50 border-rose-200 text-rose-900';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              TrustGate <span className="text-indigo-600">AI</span>
            </h1>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-sm font-medium text-slate-500">
            <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> Real-time Validation</span>
            <span className="flex items-center gap-1"><ClipboardList className="w-4 h-4" /> Decision Support</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Stethoscope className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-semibold">Medical Input</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Enter symptoms, lab results, or clinical observations for validation.
              </p>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g., Patient reports severe headache for 3 days. Lab results show high leukocytes count (15,000/mcL). No history of allergies."
                className="w-full h-64 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none text-sm"
              />
              <button
                onClick={handleValidate}
                disabled={loading || !input.trim()}
                className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    Validate Decision
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              {error && (
                <p className="mt-3 text-sm text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> {error}
                </p>
              )}
            </section>

            <section className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
              <h3 className="text-indigo-900 font-semibold mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" /> How it works
              </h3>
              <ul className="text-sm text-indigo-800 space-y-2 opacity-80">
                <li>• Extracts symptoms and test indicators</li>
                <li>• Checks for data completeness and consistency</li>
                <li>• Evaluates risk levels and potential hallucinations</li>
                <li>• Generates a weighted confidence score</li>
              </ul>
            </section>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {!result && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl"
                >
                  <div className="bg-slate-100 p-4 rounded-full mb-4">
                    <ClipboardList className="w-12 h-12 text-slate-400" />
                  </div>
                  <h3 className="text-slate-600 font-medium">No validation data yet</h3>
                  <p className="text-slate-400 text-sm max-w-xs mt-2">
                    Submit medical information on the left to see the AI-powered validation results.
                  </p>
                </motion.div>
              )}

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center space-y-4"
                >
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                  <p className="text-slate-500 animate-pulse">Analyzing medical context...</p>
                </motion.div>
              )}

              {result && !loading && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  {/* Decision Banner */}
                  <div className={`p-6 rounded-2xl border ${getDecisionColor(result.final_decision)} flex items-start gap-4`}>
                    <div className="mt-1">{getDecisionIcon(result.final_decision)}</div>
                    <div>
                      <h3 className="text-xl font-bold">Decision: {result.final_decision}</h3>
                      <p className="text-sm opacity-90 mt-1">{result.recommendation}</p>
                    </div>
                  </div>

                  {/* Main Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Confidence Score</p>
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-slate-900">{(result.confidence_score * 100).toFixed(0)}%</span>
                        <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${result.confidence_score * 100}%` }}
                            className={`h-full ${result.confidence_score >= 0.8 ? 'bg-emerald-500' : result.confidence_score >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Risk Level</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold capitalize ${
                          result.risk_level === RiskLevel.HIGH ? 'text-rose-600' : 
                          result.risk_level === RiskLevel.MEDIUM ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {result.risk_level}
                        </span>
                        {result.risk_level === RiskLevel.HIGH && <AlertTriangle className="w-6 h-6 text-rose-500" />}
                      </div>
                    </div>
                  </div>

                  {/* Validation Details */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-600" />
                        Processing Details
                      </h4>
                    </div>
                    <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-6">
                      {[
                        { label: 'Completeness', val: result.processing_details.completeness },
                        { label: 'Relevance', val: result.processing_details.relevance },
                        { label: 'Consistency', val: result.processing_details.consistency },
                        { label: 'Risk Penalty', val: result.processing_details.risk_penalty, inverse: true },
                      ].map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
                          <div className="relative inline-flex items-center justify-center">
                            <svg className="w-16 h-16">
                              <circle className="text-slate-100" strokeWidth="4" stroke="currentColor" fill="transparent" r="28" cx="32" cy="32" />
                              <circle 
                                className={item.inverse ? 'text-rose-400' : 'text-indigo-500'} 
                                strokeWidth="4" 
                                strokeDasharray={2 * Math.PI * 28}
                                strokeDashoffset={2 * Math.PI * 28 * (1 - item.val)}
                                strokeLinecap="round" 
                                stroke="currentColor" 
                                fill="transparent" 
                                r="28" cx="32" cy="32" 
                              />
                            </svg>
                            <span className="absolute text-xs font-bold">{(item.val * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Structured Data */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Extracted Data
                      </h4>
                      <div className="space-y-4">
                        {result.structured_data.symptoms && result.structured_data.symptoms.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Symptoms</p>
                            <div className="flex flex-wrap gap-2">
                              {result.structured_data.symptoms.map((s, i) => (
                                <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {result.structured_data.test_indicators && result.structured_data.test_indicators.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Test Indicators</p>
                            <div className="space-y-2">
                              {result.structured_data.test_indicators.map((t, i) => (
                                <div key={i} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                  <span className="text-slate-600">{t.name}</span>
                                  <span className="font-mono font-bold">{t.value} {t.unit}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                      <h4 className="font-semibold text-sm mb-4 flex items-center gap-2 text-amber-600">
                        <AlertCircle className="w-4 h-4" />
                        Issues & Missing Data
                      </h4>
                      <div className="space-y-4">
                        {result.issues_detected.length > 0 && (
                          <div className="space-y-2">
                            {result.issues_detected.map((issue, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg">
                                <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {result.structured_data.missing_values && result.structured_data.missing_values.length > 0 && (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Missing Information</p>
                            <div className="flex flex-wrap gap-2">
                              {result.structured_data.missing_values.map((m, i) => (
                                <span key={i} className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-md text-xs">{m}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center italic">
                    Disclaimer: This tool is for decision support only and does not provide medical diagnoses. Always consult a qualified healthcare professional.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
