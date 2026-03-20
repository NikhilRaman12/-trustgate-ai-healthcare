/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreAI } from "./aiEngine";
import { BigQueryLogger } from "../infrastructure/bigquery";
import { TaskQueue } from "./taskQueue";
import { TrustGateResponse, HealthcareFile } from "./types";

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
   * @param input The raw user input.
   * @param files Optional healthcare files.
   * @param userId The ID of the user making the request.
   * @param traceId Optional TraceID from request headers.
   * @returns The validated AI response.
   */
  public static async processRequest(
    input: string,
    files: HealthcareFile[],
    userId: string | null = null,
    traceId: string = BigQueryLogger.generateTraceId()
  ): Promise<TrustGateResponse> {
    const startTime = Date.now();
    
    try {
      console.log(`[Orchestrator] [${traceId}] Starting request processing for user: ${userId}`);

      // Use the TaskQueue for non-blocking, fault-tolerant execution
      const result = await this.taskQueue.enqueue(
        () => this.aiEngine.generateValidation(input, files, traceId, userId),
        traceId
      );

      const latencyMs = Date.now() - startTime;
      console.log(`[Orchestrator] [${traceId}] Request completed in ${latencyMs}ms.`);

      return result;
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      console.error(`[Orchestrator] [${traceId}] Request failed after ${latencyMs}ms: ${error.message}`);

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
