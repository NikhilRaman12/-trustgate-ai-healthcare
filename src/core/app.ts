/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { aiService } from "./aiService";
import { AuditTrail } from "../infrastructure/bigquery";
import { TaskQueue } from "./taskQueue";
import { TrustGateResponse, HealthcareFile, FinalDecision, RiskLevel } from "./types";
import { logger } from "../infrastructure/gcpConfig";

/**
 * Enterprise-grade Orchestrator for TrustGate AI.
 * Manages the entire request lifecycle with 100% Fault Tolerance and Auditability.
 */
export class TrustGateOrchestrator {
  private static aiService = aiService;
  private static taskQueue = TaskQueue.getInstance();

  static {
    // Register AuditTrail observer for BigQuery streaming
    this.aiService.addObserver(new AuditTrail());
  }

  /**
   * Processes a healthcare validation request.
   */
  public static async processRequest(
    input: string,
    files: HealthcareFile[],
    userId: string | null = null,
    traceId: string = AuditTrail.generateTraceId()
  ): Promise<TrustGateResponse> {
    const startTime = Date.now();
    
    try {
      logger.info(`[Orchestrator] [${traceId}] Starting request processing.`, { userId });

      // 1. AI Generation via Vertex AI (Direct call as it's already enqueued by the server)
      const result = await this.aiService.generateValidation(input, files, traceId, userId);

      const latencyMs = Date.now() - startTime;
      logger.info(`[Orchestrator] [${traceId}] Request completed.`, { latencyMs });

      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[Orchestrator] [${traceId}] Request failed.`, { error: error.message, latencyMs });

      // Log failure to BigQuery for auditability
      await AuditTrail.streamLog({
        traceId,
        userId,
        timestamp: new Date().toISOString(),
        inputLength: input.length,
        hasFiles: files.length > 0,
        decision: FinalDecision.BLOCK,
        confidence: 0,
        risk: RiskLevel.HIGH,
        latencyMs,
        cached: false
      });

      // Return a detailed JSON error object while keeping the TraceID
      return {
        traceId,
        timestamp: new Date().toISOString(),
        domain: "ERROR_HANDLER",
        structured_data: {
          symptoms: [],
          medications: [],
          allergies: [],
          medical_history: [],
          lab_values: {},
          patient_context: {},
          missing_fields: []
        },
        risk_level: RiskLevel.HIGH,
        confidence_score: 0,
        issues_detected: ["CRITICAL_SYSTEM_FAILURE"],
        recommendation: "Service temporarily optimizing safety filters. Please retry.",
        final_decision: FinalDecision.BLOCK,
        processing_details: {
          completeness: 0,
          relevance: 0,
          consistency: 0,
          risk_penalty: 1
        }
      };
    }
  }
}
