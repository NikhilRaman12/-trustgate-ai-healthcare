/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  AlertCircle,
  LogIn,
  LogOut,
  History,
  PlusCircle,
  User as UserIcon,
  ChevronRight,
  Clock,
  Upload,
  File,
  Image as ImageIcon,
  X,
  Paperclip
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { validateHealthcareInput } from './services/geminiService';
import { TrustGateResponse, FinalDecision, RiskLevel, HealthcareFile } from './core/types';
import { LoadingState, ResultCard, SectionHeader } from './components/uiComponents';
import { ErrorBoundary } from './components/errorBoundary';
import { validateInput, generateTraceId } from './utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  handleFirestoreError,
  OperationType
} from './firebase';

// Error Boundary Placeholder / Simple Error Display
const ErrorDisplay = ({ message, onRetry }: { message: string, onRetry?: () => void }) => (
  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-start gap-3" role="alert" aria-live="assertive">
    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="font-semibold text-sm">An error occurred</p>
      <p className="text-xs opacity-80 mt-1">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="mt-2 text-xs font-bold underline hover:no-underline"
        >
          Try Again
        </button>
      )}
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrustGateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<(TrustGateResponse & { id: string, createdAt: any })[]>([]);
  const [view, setView] = useState<'validate' | 'history'>('validate');
  const [toast, setToast] = useState<string | null>(null);
  const [files, setFiles] = useState<HealthcareFile[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [backendReady, setBackendReady] = useState<boolean | null>(null);

  // Backend Health Check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setBackendReady(data.status === 'healthy');
        } else {
          setBackendReady(false);
        }
      } catch (err) {
        setBackendReady(false);
      }
    };
    
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              role: 'user'
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'validations'),
      where('uid', '==', user.uid),
      where('deleted', '!=', true),
      orderBy('deleted'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      } as any));
      setHistory(docs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'validations');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowProfile(false);
      setResult(null);
      setFiles([]);
      setView('validate');
      setToast("Logged out successfully");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const deleteHistory = async (id: string) => {
    try {
      await setDoc(doc(db, 'validations', id), { deleted: true }, { merge: true });
      setToast("Record removed from history");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `validations/${id}`);
    }
  };

  const clearAllHistory = async () => {
    if (!user || history.length === 0) return;
    if (!confirm("Are you sure you want to clear your entire validation history? This action cannot be undone.")) return;
    
    try {
      const batch = history.map(record => 
        setDoc(doc(db, 'validations', record.id), { deleted: true }, { merge: true })
      );
      await Promise.all(batch);
      setToast("History cleared successfully");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'validations/all');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login failed", err);
      setError("Login failed. Please try again.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    setFileLoading(true);
    const newFiles: HealthcareFile[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (file.size > 5 * 1024 * 1024) {
        setError(`File ${file.name} is too large. Max size is 5MB.`);
        continue;
      }

      const reader = new FileReader();
      const promise = new Promise<void>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          newFiles.push({
            inlineData: {
              data: base64,
              mimeType: file.type
            },
            name: file.name
          });
          resolve();
        };
      });
      reader.readAsDataURL(file);
      await promise;
    }

    setFiles(prev => [...prev, ...newFiles]);
    setFileLoading(false);
    // Reset input
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleValidate = async () => {
    const validationError = validateInput(input);
    if (validationError && files.length === 0) {
      setError(validationError.error);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await validateHealthcareInput(
        input, 
        files, 
        user?.uid || undefined
      );
      setResult(response);

      // Save to Firestore if logged in
      if (user) {
        const validationId = doc(collection(db, 'validations')).id;
        await setDoc(doc(db, 'validations', validationId), {
          ...response,
          uid: user.uid,
          input_text: input,
          has_files: files.length > 0,
          createdAt: Timestamp.now()
        });
      }
    } catch (err: any) {
      console.error(`[App] Validation failed:`, err);
      setError(err.message || "An unexpected error occurred. Please try again.");
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

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (backendReady === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md"
        >
          <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Secure Connection Establishing...</h2>
          <p className="text-sm text-slate-500 mb-6">
            We're initializing our secure Google Cloud infrastructure to ensure 100% data integrity and medical validation accuracy.
          </p>
          <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 py-2 px-4 rounded-full">
            <ShieldCheck className="w-3 h-3" />
            Vertex AI & BigQuery Ready
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:font-bold"
      >
        Skip to content
      </a>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20" role="banner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">
                TrustGate <span className="text-indigo-600">AI</span>
              </h1>
              <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                🛡️ Screen And Safeguard Your Medical Aid ◈
              </p>
            </div>
          </div>
          
          <nav className="flex items-center gap-4" aria-label="Main Navigation">
            {user ? (
              <div className="flex items-center gap-4 relative">
                <button 
                  onClick={() => setView('validate')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${view === 'validate' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  Validator
                </button>
                <button 
                  onClick={() => setView('history')}
                  className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${view === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <History className="w-4 h-4" /> History
                </button>
                
                <div className="h-6 w-px bg-slate-200 mx-1" />
                
                <button 
                  onClick={() => setShowProfile(!showProfile)}
                  className="flex items-center gap-2 p-1 pr-3 rounded-full hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200"
                  aria-expanded={showProfile}
                  aria-haspopup="true"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-700 hidden sm:block">{user.displayName?.split(' ')[0]}</span>
                </button>

                <AnimatePresence>
                  {showProfile && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowProfile(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden"
                      >
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                          <p className="text-xs font-bold text-slate-900 truncate">{user.displayName}</p>
                          <p className="text-[10px] font-medium text-slate-400 truncate">{user.email}</p>
                        </div>
                        <div className="p-2">
                          <button 
                            onClick={() => { setView('history'); setShowProfile(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                          >
                            <History className="w-4 h-4" /> My Validations
                          </button>
                          <button 
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <LogOut className="w-4 h-4" /> Sign Out
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all"
              >
                <LogIn className="w-4 h-4" /> Sign In with Google
              </button>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" role="main">
        <AnimatePresence mode="wait">
          {view === 'validate' ? (
            <motion.div 
              key="validate-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              {/* Input Section */}
              <div className="lg:col-span-5 space-y-6">
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6" aria-labelledby="input-heading">
                  <div className="flex items-center gap-2 mb-4">
                    <Stethoscope className="w-5 h-5 text-indigo-600" aria-hidden="true" />
                    <h2 id="input-heading" className="text-lg font-semibold">Medical Input</h2>
                  </div>
                  <p className="text-sm text-slate-500 mb-4">
                    Enter symptoms, lab results, or upload images/files for validation.
                  </p>
                  <div className="relative">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="e.g., Patient reports severe headache for 3 days. Lab results show high leukocytes count (15,000/mcL). No history of allergies."
                      className="w-full h-48 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none text-sm"
                      aria-label="Medical input text area"
                    />
                    <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400 bg-white/80 px-1.5 py-0.5 rounded border border-slate-100">
                      {input.length} chars
                    </div>
                  </div>

                  {/* File Upload Section */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Paperclip className="w-3 h-3" /> Attachments
                      </label>
                      <span className="text-[10px] text-slate-400">Max 5MB per file</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <AnimatePresence>
                        {files.map((file, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="relative group bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3"
                          >
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                              {file.inlineData.mimeType.startsWith('image/') ? (
                                <ImageIcon className="w-4 h-4 text-indigo-500" />
                              ) : (
                                <File className="w-4 h-4 text-slate-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-medium text-slate-700 truncate">{file.name}</p>
                              <p className="text-[9px] text-slate-400 uppercase">{file.inlineData.mimeType.split('/')[1]}</p>
                            </div>
                            <button
                              onClick={() => removeFile(idx)}
                              className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 rounded-full p-0.5 text-slate-400 hover:text-rose-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    <label className="relative flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {fileLoading ? (
                          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors mb-1" />
                            <p className="text-xs text-slate-500 group-hover:text-indigo-600">
                              <span className="font-semibold">Click to upload</span> or drag and drop
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">Images or Documents</p>
                          </>
                        )}
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        multiple 
                        accept="image/*,application/pdf"
                        onChange={handleFileChange}
                        disabled={fileLoading}
                      />
                    </label>
                  </div>
                  
                  <button
                    onClick={handleValidate}
                    disabled={loading || (!input.trim() && files.length === 0)}
                    className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                    aria-busy={loading}
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
                    <div className="mt-4">
                      <ErrorDisplay message={error} onRetry={handleValidate} />
                    </div>
                  )}

                  {!user && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800">
                        <strong>Note:</strong> You are not signed in. Your validation results will not be saved to your history.
                      </p>
                    </div>
                  )}
                </section>

                <section className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100" aria-labelledby="info-heading">
                  <h3 id="info-heading" className="text-indigo-900 font-semibold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" aria-hidden="true" /> How it works
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
                      key="empty-state"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl"
                    >
                      <div className="bg-slate-100 p-4 rounded-full mb-4">
                        <ClipboardList className="w-12 h-12 text-slate-400" />
                      </div>
                      <h3 className="text-slate-600 font-medium">Ready for Validation</h3>
                      <p className="text-slate-400 text-sm max-w-xs mt-2">
                        Submit medical information on the left to see the AI-powered validation results.
                      </p>
                    </motion.div>
                  )}

                  {loading && (
                    <motion.div
                      key="loading-state"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full min-h-[400px] flex flex-col items-center justify-center"
                    >
                      <LoadingState message="Analyzing medical context with TrustGate AI..." />
                    </motion.div>
                  )}

                  {result && !loading && (
                    <motion.div
                      key="result-state"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-6"
                    >
                      {/* Decision Banner */}
                      <ResultCard 
                        decision={result.final_decision}
                        risk={result.risk_level}
                        recommendation={result.recommendation}
                        traceId={result.traceId}
                      />

                      {/* Main Stats */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Confidence Score</p>
                          <div className="flex items-end gap-2">
                            <span className="text-4xl font-bold text-slate-900">{(result.confidence_score * 100).toFixed(0)}%</span>
                            <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden" role="progressbar" aria-valuenow={result.confidence_score * 100} aria-valuemin={0} aria-valuemax={100}>
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
                            {result.risk_level === RiskLevel.HIGH && <AlertTriangle className="w-6 h-6 text-rose-500" aria-hidden="true" />}
                          </div>
                        </div>
                      </div>

                      {/* Validation Details */}
                      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-600" aria-hidden="true" />
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
                                <svg className="w-16 h-16" aria-hidden="true">
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
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />
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
                            {result.structured_data.medications && result.structured_data.medications.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Medications</p>
                                <div className="flex flex-wrap gap-2">
                                  {result.structured_data.medications.map((m, i) => (
                                    <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-xs">{m}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.structured_data.allergies && result.structured_data.allergies.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Allergies</p>
                                <div className="flex flex-wrap gap-2">
                                  {result.structured_data.allergies.map((a, i) => (
                                    <span key={i} className="px-2 py-1 bg-rose-50 text-rose-700 border border-rose-100 rounded-md text-xs">{a}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.structured_data.medical_history && result.structured_data.medical_history.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Medical History</p>
                                <div className="flex flex-wrap gap-2">
                                  {result.structured_data.medical_history.map((h, i) => (
                                    <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-xs">{h}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.structured_data.lab_values && Object.keys(result.structured_data.lab_values).length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Lab Values</p>
                                <div className="space-y-2">
                                  {Object.entries(result.structured_data.lab_values).map(([key, value], i) => (
                                    <div key={i} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                      <span className="text-slate-600 capitalize">{key.replace(/_/g, ' ')}</span>
                                      <span className="font-mono font-bold">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {result.structured_data.patient_context && Object.keys(result.structured_data.patient_context).length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Patient Context</p>
                                <div className="space-y-2">
                                  {Object.entries(result.structured_data.patient_context).map(([key, value], i) => (
                                    <div key={i} className="flex justify-between text-xs border-b border-slate-50 pb-1">
                                      <span className="text-slate-600 capitalize">{key.replace(/_/g, ' ')}</span>
                                      <span className="font-mono font-bold">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                          <h4 className="font-semibold text-sm mb-4 flex items-center gap-2 text-amber-600">
                            <AlertCircle className="w-4 h-4" aria-hidden="true" />
                            Issues & Missing Data
                          </h4>
                          <div className="space-y-4">
                            {result.issues_detected.length > 0 && (
                              <div className="space-y-2">
                                {result.issues_detected.map((issue, i) => (
                                  <div key={i} className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg">
                                    <XCircle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                                    <span>{issue}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {result.structured_data.missing_fields && result.structured_data.missing_fields.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Missing Critical Fields</p>
                                <div className="flex flex-wrap gap-2">
                                  {result.structured_data.missing_fields.map((m, i) => (
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
            </motion.div>
          ) : (
            <motion.div 
              key="history-view"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-6 h-6 text-indigo-600" /> Validation History
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <input 
                      type="text"
                      placeholder="Search history..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    <History className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <button 
                    onClick={clearAllHistory}
                    className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl transition-all flex items-center gap-1.5"
                    title="Clear all history"
                  >
                    <XCircle className="w-4 h-4" /> Clear All
                  </button>
                  <button 
                    onClick={() => setView('validate')}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-100"
                  >
                    <PlusCircle className="w-4 h-4" /> New
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
                  <div className="bg-slate-50 p-4 rounded-full inline-block mb-4">
                    <History className="w-12 h-12 text-slate-300" />
                  </div>
                  <h3 className="text-slate-600 font-medium">No history found</h3>
                  <p className="text-slate-400 text-sm mt-2">Your past validations will appear here once you start using the tool while signed in.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history
                    .filter(record => 
                      record.input_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      record.final_decision.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      record.recommendation.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((record) => (
                    <motion.div 
                      key={record.id}
                      layoutId={record.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:border-indigo-200 transition-all cursor-pointer group"
                      onClick={() => {
                        setResult(record);
                        setView('validate');
                      }}
                    >
                      <div className="p-5 flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${
                          record.final_decision === FinalDecision.APPROVE ? 'bg-emerald-50 text-emerald-600' :
                          record.final_decision === FinalDecision.WARNING ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {getDecisionIcon(record.final_decision)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900">{record.final_decision}</span>
                            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> 
                              {record.createdAt?.toDate().toLocaleString() || 'Just now'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate italic">"{record.input_text}"</p>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <div>
                            <div className="text-lg font-bold text-slate-900">{(record.confidence_score * 100).toFixed(0)}%</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Confidence</div>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteHistory(record.id);
                            }}
                            className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            title="Delete from history"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-200 mt-12" role="contentinfo">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-bold tracking-tight">TrustGate AI</span>
          </div>
          <div className="flex items-center gap-8 text-xs font-medium text-slate-400">
            <a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Security Audit</a>
          </div>
          <p className="text-xs text-slate-400">© 2026 TrustGate AI. All rights reserved.</p>
        </div>
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl z-50 flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
