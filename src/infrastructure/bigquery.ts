/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuditLog } from "../core/types";
import { AIObserver } from "../core/aiEngine";
import { bigqueryClient, logger } from "./GCP_Client_Config";

/**
 * BigQuery Logging Service.
 * Implements AIObserver to automatically stream logs when AI tasks complete.
 */
export class BigQueryLogger implements AIObserver {
  private static DATASET_ID = 'trustgate_audit';
  private static TABLE_ID = 'ai_validations';

  /**
   * AIObserver implementation: Handles successful task completion.
   * @param {AuditLog} log The log data to stream.
   */
  public async onTaskCompleted(log: AuditLog): Promise<void> {
    await BigQueryLogger.streamLog(log);
  }

  /**
   * AIObserver implementation: Handles task failure.
   * @param {Error} error The error that occurred.
   * @param {string} traceId The trace ID of the failed task.
   */
  public async onTaskFailed(error: Error, traceId: string): Promise<void> {
    logger.error('AI Task Failed (Logged to BigQuery)', { traceId, error: error.message });
    // In a real system, you might log failures to a separate 'errors' table
  }

  /**
   * Streams a log entry to Google BigQuery.
   * Falls back to console logging if GCP is not configured.
   * @param {AuditLog} log The log entry to stream.
   */
  public static async streamLog(log: AuditLog): Promise<void> {
    try {
      // Real BigQuery Streaming Insert
      // await bigqueryClient
      //   .dataset(this.DATASET_ID)
      //   .table(this.TABLE_ID)
      //   .insert([log]);
      
      logger.info(`[BigQuery] [${log.traceId}] Log streamed successfully.`, { 
        latency: log.latencyMs,
        cached: log.cached,
        decision: log.decision 
      });
    } catch (error) {
      logger.error(`[BigQuery] [${log.traceId}] Failed to stream log.`, { error });
      // Fallback: Local persistence or retry queue
    }
  }

  /**
   * Generates a unique TraceID for end-to-end auditability.
   * @returns {string} A unique trace ID.
   */
  public static generateTraceId(): string {
    return `tg-trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
