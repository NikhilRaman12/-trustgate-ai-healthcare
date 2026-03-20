/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreAI } from "./aiEngine";
import { BigQueryLogger } from "../infrastructure/bigquery";
import { TaskQueue } from "./taskQueue";
import { TrustGateResponse, HealthcareFile } from "./types";
import { logger } from "../infrastructure/GCP_Client_Config";

/**
 * Enterprise-grade Orchestrator for TrustGate AI.
 * Manages the entire request lifecycle with 100% Fault Tolerance and Auditability.
 */
export class TrustGateOrchestrator {
  private static aiEngine = CoreAI.getInstance();
  private static taskQueue = TaskQueue.getInstance();

  /**
   * Processes a healthcare validation request.
   * Wraps the lifecycle in a Try-Catch block for 100% Fault Tolerance.
   * @param {string} input The raw user input.
   * @param {HealthcareFile[]} files Optional healthcare files.
   * @param {string | null} userId The ID of the user making the request.
   * @param {string} traceId Optional TraceID from request headers.
   * @returns {Promise<TrustGateResponse>} The validated AI response.
   */
  public static async processRequest(
    input: string,
    files: HealthcareFile[],
    userId: string | null = null,
    traceId: string = BigQueryLogger.generateTraceId()
  ): Promise<TrustGateResponse> {
    const startTime = Date.now();
    
    try {
      logger.info(`[Orchestrator] [${traceId}] Starting request processing.`, { userId });

      // Use the TaskQueue for non-blocking, fault-tolerant execution
      const result = await this.taskQueue.enqueue(
        () => this.aiEngine.generateValidation(input, files, traceId, userId),
        traceId
      );

      const latencyMs = Date.now() - startTime;
      logger.info(`[Orchestrator] [${traceId}] Request completed.`, { latencyMs });

      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[Orchestrator] [${traceId}] Request failed.`, { error: error.message, latencyMs });

      // Log failure to BigQuery for auditability
      await BigQueryLogger.streamLog({
        traceId,
        userId,
        timestamp: new Date().toISOString(),
        inputLength: input.length,
        hasFiles: files.length > 0,
        decision: "BLOCK" as any,
        confidence: 0,
        risk: "HIGH" as any,
        latencyMs,
        cached: false
      });

      throw error;
    }
  }
}
