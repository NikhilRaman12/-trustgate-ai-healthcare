/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file main.tsx
 * @description Gold Standard Master Orchestrator for TrustGate AI.
 * 
 * Traceability Matrix:
 * - REQ-MAIN-001: Global Error Boundary -> ErrorBoundary integration
 * - REQ-MAIN-002: Health Check -> /api/health endpoint
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/errorBoundary';

/**
 * System Initialization & Health Check
 * Runs on startup to verify 'System Health' and backend connectivity.
 */
async function initializeSystem() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('[TrustGate AI] SYSTEM_READY: Connected to backend.', data);
    } else {
      console.warn('[TrustGate AI] SYSTEM_DEGRADED: Backend returned non-ok status.', data);
    }
  } catch (err) {
    console.error('[TrustGate AI] CRITICAL_STARTUP_FAILURE: Backend unreachable.', err);
  }
}

// Execute initialization
initializeSystem();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
