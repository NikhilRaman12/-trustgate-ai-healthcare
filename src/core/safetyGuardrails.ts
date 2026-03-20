/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustGateResponse } from "./types";
import { BigQueryLogger } from "../infrastructure/bigquery";

/**
 * Enterprise-grade Validation Service for AI Safety and Compliance.
 * Implements Pre-processing, Post-processing, and Sensitivity Triggers.
 */
export class ValidationService {
  private static readonly SENSITIVE_KEYWORDS = [
    "diagnose", "cure", "prescribe", "legal advice", "lawsuit", "attorney"
  ];

  /**
   * Pre-processes and sanitizes user input to prevent injection and ensure quality.
   * @param input The raw user input string.
   * @param traceId Unique TraceID for auditability.
   * @returns Sanitized input string.
   */
  public static sanitizeInput(input: string, traceId: string): string {
    // Basic sanitization: trim and remove potential script tags or malicious patterns
    const sanitized = input.trim().replace(/<script.*?>.*?<\/script>/gi, "");
    
    console.log(`[ValidationService] [${traceId}] Input sanitized.`);
    return sanitized;
  }

  /**
   * Post-processes AI output to verify alignment and safety.
   * @param output The raw AI response object.
   * @param traceId Unique TraceID for auditability.
   * @returns Verified and potentially modified AI response.
   */
  public static async verifyOutput(output: TrustGateResponse, traceId: string): Promise<TrustGateResponse> {
    const recommendation = output.recommendation.toLowerCase();
    
    // Check for sensitivity triggers
    const flagged = this.SENSITIVE_KEYWORDS.some(keyword => recommendation.includes(keyword));
    
    if (flagged) {
      await this.triggerSensitivityAlert(traceId, "Potential medical/legal advice detected in output.");
      
      // Append safety disclaimer if not present
      if (!recommendation.includes("consult a professional")) {
        output.recommendation += "\n\n[SAFETY NOTICE]: This information is for validation purposes only. Please consult a qualified professional for medical or legal advice.";
      }
    }

    console.log(`[ValidationService] [${traceId}] Output verified.`);
    return output;
  }

  /**
   * Flags non-compliant content for human-in-the-loop review via BigQuery logs.
   * @param traceId Unique TraceID for auditability.
   * @param reason The reason for the sensitivity alert.
   */
  private static async triggerSensitivityAlert(traceId: string, reason: string): Promise<void> {
    console.warn(`[ValidationService] [SENSITIVITY ALERT] [${traceId}]: ${reason}`);
    
    // Log alert to BigQuery for auditability
    await BigQueryLogger.streamLog({
      traceId,
      userId: "SYSTEM",
      timestamp: new Date().toISOString(),
      inputLength: 0,
      hasFiles: false,
      decision: "WARNING" as any,
      confidence: 0,
      risk: "HIGH" as any,
      latencyMs: 0,
      cached: false
    });
  }
}
