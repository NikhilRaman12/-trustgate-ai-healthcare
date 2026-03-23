/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file bigquery.ts
 * @description Audit Trail Observer for 100% Google Services Adoption.
 * Implements Hybrid Sink: BigQuery for Production, Console for Preview.
 */

import { AuditLog } from "../core/types";
import { AIObserver } from "../core/aiService";
import { gcpProvider, logger } from "./gcpConfig";

/**
 * AuditTrail: Automatically streams AI task logs to BigQuery or Console.
 */
export class AuditTrail implements AIObserver {
  private static DATASET_ID = 'trustgate_audit';
  private static TABLE_ID = 'ai_validations';

  /**
   * Handles successful task completion.
   */
  public async onTaskCompleted(log: AuditLog): Promise<void> {
    await AuditTrail.streamLog(log);
  }

  /**
   * Handles task failure.
   */
  public async onTaskFailed(error: Error, traceId: string): Promise<void> {
    logger.error('[AuditTrail] AI Task Failed', { traceId, error: error.message });
  }

  /**
   * Streams a log entry to the appropriate sink.
   */
  public static async streamLog(log: AuditLog): Promise<void> {
    const bqClient = gcpProvider.bigquery;

    if (bqClient && gcpProvider.isProduction) {
      try {
        await bqClient
          .dataset(AuditTrail.DATASET_ID)
          .table(AuditTrail.TABLE_ID)
          .insert([log]);
        logger.info(`[AuditTrail] [${log.traceId}] Logged to BigQuery.`);
      } catch (err) {
        logger.error(`[AuditTrail] [${log.traceId}] BigQuery streaming failed.`, { error: err });
      }
    } else {
      // PREVIEW MODE: Route to Console with BigQuery-compatible JSON schema
      console.info(`[AuditTrail] [PREVIEW_SINK] [${log.traceId}]`, JSON.stringify({
        dataset: AuditTrail.DATASET_ID,
        table: AuditTrail.TABLE_ID,
        payload: log
      }));
    }
  }

  /**
   * Generates a unique TraceID for end-to-end auditability.
   */
  public static generateTraceId(): string {
    return `tg-trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
