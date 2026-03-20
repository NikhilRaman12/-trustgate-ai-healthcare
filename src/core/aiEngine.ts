/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { LRUCache } from "lru-cache";
import { TrustGateResponse, HealthcareFile, FinalDecision, RiskLevel } from "./types";
import { SecretManager } from "../infrastructure/secrets";
import { BigQueryLogger } from "../infrastructure/bigquery";
import { ValidationService } from "./safetyGuardrails";

/**
 * Enterprise-grade Core AI Engine.
 * Implements Singleton pattern, Cache-Aside logic, and Gemini integration.
 */
export class CoreAI {
  private static instance: CoreAI;
  private cache: LRUCache<string, TrustGateResponse>;
  private aiInstance: GoogleGenAI | null = null;

  private constructor() {
    // Initialize Cache-Aside (Memorystore Proxy)
    this.cache = new LRUCache<string, TrustGateResponse>({
      max: 1000,
      ttl: 1000 * 60 * 60, // 1 hour
    });
  }

  /**
   * Returns the Singleton instance of CoreAI.
   * @returns The CoreAI instance.
   */
  public static getInstance(): CoreAI {
    if (!CoreAI.instance) {
      CoreAI.instance = new CoreAI();
    }
    return CoreAI.instance;
  }

  /**
   * Initializes the Gemini AI instance with the API key from Secret Manager.
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
   * @param input The sanitized user input string.
   * @param files Optional healthcare files (images/PDFs).
   * @param traceId Unique TraceID for auditability.
   * @param userId Optional user ID for audit trails.
   * @returns The validated AI response.
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
      console.log(`[CoreAI] [${traceId}] Cache hit.`);
      await BigQueryLogger.streamLog({
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
      });
      return { ...cached, traceId, timestamp: new Date().toISOString() };
    }

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

    // 6. Log to BigQuery
    await BigQueryLogger.streamLog({
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
    });

    return { ...result, traceId, timestamp: new Date().toISOString() };
  }
}
