/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum FinalDecision {
  APPROVE = 'APPROVE',
  WARNING = 'WARNING',
  BLOCK = 'BLOCK'
}

export interface HealthcareFile {
  inlineData: {
    data: string;
    mimeType: string;
  };
  name?: string;
}

export interface StructuredData {
  symptoms: string[];
  medications: string[];
  allergies: string[];
  medical_history: string[];
  lab_values: Record<string, string | number>;
  patient_context: Record<string, string | number>;
  missing_fields: string[];
}

export interface ProcessingDetails {
  completeness: number;
  relevance: number;
  consistency: number;
  risk_penalty: number;
}

/**
 * Enterprise-grade AI response with Auditability fields.
 */
export interface TrustGateResponse {
  traceId: string; // Unique TraceID for "Right to Explanation" compliance
  timestamp: string;
  domain: string;
  structured_data: StructuredData;
  risk_level: RiskLevel;
  confidence_score: number;
  issues_detected: string[];
  recommendation: string;
  final_decision: FinalDecision;
  processing_details: ProcessingDetails;
  metadata?: Record<string, any>;
}

/**
 * Audit Log structure for BigQuery streaming.
 */
export interface AuditLog {
  traceId: string;
  userId: string | null;
  timestamp: string;
  inputLength: number;
  hasFiles: boolean;
  decision: FinalDecision;
  confidence: number;
  risk: RiskLevel;
  latencyMs: number;
  cached: boolean;
}
