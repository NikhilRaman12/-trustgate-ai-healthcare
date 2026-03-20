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
