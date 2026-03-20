/**
 * @file GCP_Client_Config.ts
 * @description Centralized Google Cloud Platform client initialization for 100% Trusted Deployment.
 * This file implements Application Default Credentials (ADC) logic.
 * 
 * Traceability Matrix:
 * - REQ-GCP-001: BigQuery Initialization -> BigQueryClient
 * - REQ-GCP-002: Cloud Logging Integration -> CloudLogger
 * - REQ-GCP-003: ADC Security -> Client Options
 */

import { BigQuery } from '@google-cloud/bigquery';
import { LoggingWinston } from '@google-cloud/logging-winston';
import winston from 'winston';

/**
 * BigQuery Client Configuration
 * Uses ADC for authentication in production environments.
 */
export const bigqueryClient = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  // Key filename is optional if ADC is configured via environment
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

/**
 * Cloud Logging (Winston) Configuration
 * Captures system health and streams to Google Cloud Logging.
 */
const loggingWinston = new LoggingWinston({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  logName: 'trustgate-system-logs',
});

export const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
    loggingWinston,
  ],
});

/**
 * GCP Client Health Check
 * Verifies connectivity to Google Services on startup.
 * @returns {Promise<boolean>}
 */
export async function verifyGCPConnectivity(): Promise<boolean> {
  try {
    // Attempt to list datasets as a connectivity test
    await bigqueryClient.getDatasets();
    logger.info('GCP Connectivity Verified: BigQuery is reachable.');
    return true;
  } catch (error) {
    logger.warn('GCP Connectivity Warning: BigQuery unreachable. Falling back to Mock/Local logging.', { error });
    return false;
  }
}
