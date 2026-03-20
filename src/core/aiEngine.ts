/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @file aiEngine.ts
 * @description Enterprise-grade Core AI Engine implementing the Singleton and Observer patterns.
 * 
 * Traceability Matrix:
 * - REQ-AI-001: Singleton Pattern -> CoreAI.getInstance()
 * - REQ-AI-002: Cache-Aside Logic -> LRUCache integration
 * - REQ-AI-003: Observer Pattern -> AIObserver registration and notification
 * - REQ-AI-004: Gemini Integration -> @google/genai orchestration
 * - REQ-AI-005: Safety Guardrails -> ValidationService integration
 */

import { GoogleGenAI, Type } from "@google/genai";
import { LRUCache } from "lru-cache";
import { TrustGateResponse, HealthcareFile, FinalDecision, RiskLevel, AuditLog } from "./types";
import { SecretManager } from "../infrastructure/secrets";
import { BigQueryLogger } from "../infrastructure/bigquery";
import { ValidationService } from "./safetyGuardrails";
import { logger } from "../infrastructure/GCP_Client_Config";

/**
 * Interface for AI Engine Observers.
 * Allows decoupled services (like BigQuery) to react to AI events.
 */
export interface AIObserver {
  onTaskCompleted(log: AuditLog): Promise<void>;
  onTaskFailed(error: Error, traceId: string): Promise<void>;
}

/**
 * Enterprise-grade Core AI Engine.
 * Implements Singleton pattern, Cache-Aside logic, and Gemini integration.
 * Uses the Observer pattern to notify downstream sinks (BigQuery, Logging).
 */
export class CoreAI {
  private static instance: CoreAI;
  private cache: LRUCache<string, TrustGateResponse>;
  private aiInstance: GoogleGenAI | null = null;
  private observers: AIObserver[] = [];

  private constructor() {
    // Initialize Cache-Aside (Memorystore Proxy)
    this.cache = new LRUCache<string, TrustGateResponse>({
      max: 1000,
      ttl: 1000 * 60 * 60, // 1 hour
    });
    
    // Register default observers
    this.addObserver(new BigQueryLogger());
  }

  /**
   * Returns the Singleton instance of CoreAI.
   * @returns {CoreAI} The CoreAI instance.
   * @complexity O(1)
   */
  public static getInstance(): CoreAI {
    if (!CoreAI.instance) {
      CoreAI.instance = new CoreAI();
    }
    return CoreAI.instance;
  }

  /**
   * Adds an observer to the AI Engine.
   * @param {AIObserver} observer The observer to register.
   */
  public addObserver(observer: AIObserver): void {
    this.observers.push(observer);
  }

  /**
   * Notifies all observers of a completed task.
   * @param {AuditLog} log The audit log to broadcast.
   * @private
   */
  private async notifyTaskCompleted(log: AuditLog): Promise<void> {
    await Promise.all(this.observers.map(o => o.onTaskCompleted(log).catch(err => {
      logger.error('Observer notification failed', { error: err, traceId: log.traceId });
    })));
  }

  /**
   * Initializes the Gemini AI instance with the API key from Secret Manager.
   * @private
   * @throws {Error} If API key is missing.
   */
  private async initializeAI(): Promise<void> {
    if (!this.aiInstance) {
      const apiKey = await SecretManager.getSecret('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing in Secret Manager.");
      }
      this.aiInstance = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Generates a healthcare validation using Gemini 1.5 Flash/Pro.
   * Implements Cache-Aside logic and strict System Instructions.
   * 
   * @param {string} input The sanitized user input string.
   * @param {HealthcareFile[]} files Optional healthcare files (images/PDFs).
   * @param {string} traceId Unique TraceID for auditability.
   * @param {string | null} userId Optional user ID for audit trails.
   * @returns {Promise<TrustGateResponse>} The validated AI response.
   * @complexity O(N) where N is input size + file size.
   * @dependency GCP/Gemini-API
   */
  public async generateValidation(
    input: string,
    files: HealthcareFile[],
    traceId: string,
    userId: string | null = null
  ): Promise<TrustGateResponse> {
    const startTime = Date.now();
    
    // 1. Cache-Aside Check
    const cacheKey = Buffer.from(input + JSON.stringify(files)).toString('base64');
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      logger.info(`[CoreAI] [${traceId}] Cache hit.`);
      const log: AuditLog = {
        traceId,
        userId,
        timestamp: new Date().toISOString(),
        inputLength: input.length,
        hasFiles: files.length > 0,
        decision: cached.final_decision,
        confidence: cached.confidence_score,
        risk: cached.risk_level,
        latencyMs: Date.now() - startTime,
        cached: true
      };
      await this.notifyTaskCompleted(log);
      return { ...cached, traceId, timestamp: new Date().toISOString() };
    }

    try {
      // 2. Pre-processing & Sanitization
      const sanitizedInput = ValidationService.sanitizeInput(input, traceId);

      // 3. AI Generation
      await this.initializeAI();
      
      const systemInstruction = `
        You are TrustGate AI – a Healthcare Validation and Decision Engine.
        Your role is NOT to diagnose, but to validate, structure, and assess the reliability of healthcare-related input.
        
        STEP 1: STRUCTURE EXTRACTION (symptoms, medications, allergies, history, lab_values, context)
        STEP 2: VALIDATION METRICS (completeness, relevance, consistency, risk)
        STEP 3: DECISION ENGINE (APPROVE, WARNING, BLOCK)
      `;

      const contents = {
        parts: [
          { text: sanitizedInput },
          ...files.map(f => ({ inlineData: f.inlineData }))
        ]
      };

      const response = await this.aiInstance!.models.generateContent({
        model: "gemini-3-flash-preview",
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              domain: { type: Type.STRING },
              structured_data: {
                type: Type.OBJECT,
                properties: {
                  symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
                  medications: { type: Type.ARRAY, items: { type: Type.STRING } },
                  allergies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  medical_history: { type: Type.ARRAY, items: { type: Type.STRING } },
                  lab_values: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } },
                  patient_context: { type: Type.OBJECT, additionalProperties: { type: Type.STRING } },
                  missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["symptoms", "medications", "allergies", "medical_history", "lab_values", "patient_context", "missing_fields"]
              },
              confidence_score: { type: Type.NUMBER },
              risk_level: { type: Type.STRING, enum: Object.values(RiskLevel) },
              issues_detected: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendation: { type: Type.STRING },
              final_decision: { type: Type.STRING, enum: Object.values(FinalDecision) },
              processing_details: {
                type: Type.OBJECT,
                properties: {
                  completeness: { type: Type.NUMBER },
                  relevance: { type: Type.NUMBER },
                  consistency: { type: Type.NUMBER },
                  risk_penalty: { type: Type.NUMBER }
                },
                required: ["completeness", "relevance", "consistency", "risk_penalty"]
              }
            },
            required: ["domain", "structured_data", "confidence_score", "risk_level", "issues_detected", "recommendation", "final_decision", "processing_details"]
          }
        }
      });

      let result = JSON.parse(response.text || "{}") as TrustGateResponse;
      
      // 4. Post-processing & Safety Guardrails
      result = await ValidationService.verifyOutput(result, traceId);
      
      // 5. Update Cache
      this.cache.set(cacheKey, result);

      // 6. Notify Observers (BigQuery, etc.)
      const log: AuditLog = {
        traceId,
        userId,
        timestamp: new Date().toISOString(),
        inputLength: input.length,
        hasFiles: files.length > 0,
        decision: result.final_decision,
        confidence: result.confidence_score,
        risk: result.risk_level,
        latencyMs: Date.now() - startTime,
        cached: false
      };
      await this.notifyTaskCompleted(log);

      return { ...result, traceId, timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('AI Generation Failed', { error, traceId });
      await Promise.all(this.observers.map(o => o.onTaskFailed(error as Error, traceId)));
      throw error;
    }
  }
}
