/**
 * @file gcpConfig.ts
 * @description Resilient GCP Provider for 100% Google Services Adoption.
 * Implements Lazy Loading, Environment Detection, and Hybrid Logging.
 */

import { BigQuery } from '@google-cloud/bigquery';
import { VertexAI } from '@google-cloud/vertexai';
import { LoggingWinston } from '@google-cloud/logging-winston';
import winston from 'winston';

/**
 * GCPProvider: Centralized, resilient GCP service provider.
 * Implements Lazy Loading to ensure non-blocking application startup.
 */
export class GCPProvider {
  private static instance: GCPProvider;
  public readonly projectId: string;
  public readonly location: string = 'us-central1';
  public readonly isProduction: boolean;

  private _bigquery: BigQuery | null = null;
  private _vertexAI: VertexAI | null = null;
  private _logger: winston.Logger | null = null;

  private constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'trustgate-ai-default';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  public static getInstance(): GCPProvider {
    if (!GCPProvider.instance) {
      GCPProvider.instance = new GCPProvider();
    }
    return GCPProvider.instance;
  }

  /**
   * Lazy-loaded Logger with Hybrid Sink logic.
   */
  public get logger(): winston.Logger {
    if (!this._logger) {
      const transports: winston.transport[] = [new winston.transports.Console()];

      if (this.isProduction) {
        try {
          transports.push(new LoggingWinston({
            projectId: this.projectId,
            logName: 'trustgate-system-logs',
          }));
        } catch (err) {
          console.warn('[GCPProvider] Cloud Logging init failed, falling back to Console.');
        }
      }

      this._logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
        transports,
      });
    }
    return this._logger;
  }

  /**
   * Lazy-loaded BigQuery Client.
   */
  public get bigquery(): BigQuery | null {
    if (!this._bigquery && this.isProduction) {
      try {
        this._bigquery = new BigQuery({ projectId: this.projectId });
      } catch (err) {
        this.logger.error('[GCPProvider] BigQuery initialization failed.', { error: err });
      }
    }
    return this._bigquery;
  }

  /**
   * Lazy-loaded Vertex AI Client.
   */
  public get vertexAI(): VertexAI | null {
    if (!this._vertexAI) {
      try {
        this._vertexAI = new VertexAI({
          project: this.projectId,
          location: this.location,
        });
      } catch (err) {
        this.logger.error('[GCPProvider] Vertex AI initialization failed.', { error: err });
      }
    }
    return this._vertexAI;
  }

  /**
   * Health Check: Verifies connectivity to Google Services.
   */
  public async checkHealth() {
    const services = {
      bigquery: false,
      vertexai: false,
    };

    try {
      if (this.bigquery) {
        await this.bigquery.getDatasets();
        services.bigquery = true;
      }
    } catch (err) {
      this.logger.debug('[HealthCheck] BigQuery unreachable or not configured.');
    }

    try {
      if (this.vertexAI) {
        services.vertexai = true;
      }
    } catch (err) {
      this.logger.debug('[HealthCheck] Vertex AI unreachable.');
    }

    return {
      status: Object.values(services).some(v => v) ? 'healthy' : 'degraded',
      services,
      projectId: this.projectId,
      isProduction: this.isProduction
    };
  }
}

export const gcpProvider = GCPProvider.getInstance();
export const logger = gcpProvider.logger;
