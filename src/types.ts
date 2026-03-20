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

export interface StructuredData {
  symptoms?: string[];
  test_indicators?: Array<{
    name: string;
    value: string | number;
    reference_range?: string;
    unit?: string;
  }>;
  missing_values?: string[];
  patient_context?: string;
}

export interface ProcessingDetails {
  completeness: number;
  relevance: number;
  consistency: number;
  risk_penalty: number;
}

export interface TrustGateResponse {
  domain: string;
  structured_data: StructuredData;
  risk_level: RiskLevel;
  confidence_score: number;
  issues_detected: string[];
  recommendation: string;
  final_decision: FinalDecision;
  processing_details: ProcessingDetails;
}
