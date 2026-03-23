/**
 * @file aiService.ts
 * @description Resilient AI Service using Vertex AI SDK for 100% Google Services Adoption.
 * Implements Observer Pattern, Custom Errors, and Lazy Loading.
 */

import { VertexAI, GenerativeModel, Part } from "@google-cloud/vertexai";
import { LRUCache } from "lru-cache";
import { TrustGateResponse, HealthcareFile, FinalDecision, RiskLevel, AuditLog } from "./types";
import { ValidationService } from "./safetyGuardrails";
import { gcpProvider, logger } from "../infrastructure/gcpConfig";

/**
 * Custom Error class for TrustGate AI.
 */
export class TrustGateError extends Error {
  constructor(message: string, public traceId: string, public code: string = 'AI_ENGINE_ERROR') {
    super(message);
    this.name = 'TrustGateError';
  }
}

/**
 * Interface for AI Service Observers.
 */
export interface AIObserver {
  onTaskCompleted(log: AuditLog): Promise<void>;
  onTaskFailed(error: Error, traceId: string): Promise<void>;
}

/**
 * Resilient AI Service.
 * Implements Singleton pattern, Cache-Aside logic, and Vertex AI integration.
 */
export class AIService {
  private static instance: AIService;
  private cache: LRUCache<string, TrustGateResponse>;
  private model: GenerativeModel | null = null;
  private observers: AIObserver[] = [];

  private constructor() {
    // 1. Initialize Cache-Aside
    this.cache = new LRUCache<string, TrustGateResponse>({
      max: 1000,
      ttl: 1000 * 60 * 60, // 1 hour
    });
  }

  /**
   * Returns the Singleton instance of AIService.
   */
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Adds an observer to the AI Service.
   */
  public addObserver(observer: AIObserver): void {
    this.observers.push(observer);
  }

  /**
   * Notifies all observers of a completed task.
   */
  private async notifyTaskCompleted(log: AuditLog): Promise<void> {
    await Promise.all(this.observers.map(o => o.onTaskCompleted(log).catch(err => {
      logger.error('Observer notification failed', { error: err, traceId: log.traceId });
    })));
  }

  /**
   * Notifies all observers of a failed task.
   */
  private async notifyTaskFailed(error: Error, traceId: string): Promise<void> {
    await Promise.all(this.observers.map(o => o.onTaskFailed(error, traceId).catch(err => {
      logger.error('Observer failure notification failed', { error: err, traceId });
    })));
  }

  /**
   * Lazy-loads the Vertex AI model.
   */
  private async getModel(): Promise<GenerativeModel> {
    if (!this.model) {
      const vertexAI = gcpProvider.vertexAI;
      if (!vertexAI) {
        throw new Error("Vertex AI Client not available.");
      }
      this.model = vertexAI.getGenerativeModel({
        model: "gemini-3-flash-preview",
        generationConfig: {
          responseMimeType: "application/json",
        },
      });
    }
    return this.model;
  }

  /**
   * Generates a healthcare validation using Vertex AI.
   * Implements strict typing and safety fallbacks.
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
      logger.info(`[AIService] [${traceId}] Cache hit.`);
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

      // 3. AI Generation via Vertex AI (Lazy Loaded)
      const model = await this.getModel();
      
      const systemInstruction = `
        You are TrustGate AI – a Healthcare Validation and Decision Engine.
        Your role is NOT to diagnose, but to validate, structure, and assess the reliability of healthcare-related input.
        
        STEP 1: STRUCTURE EXTRACTION (symptoms, medications, allergies, history, lab_values, context)
        STEP 2: VALIDATION METRICS (completeness, relevance, consistency, risk)
        STEP 3: DECISION ENGINE (APPROVE, WARNING, BLOCK)
        
        Return ONLY valid JSON matching the requested schema. No markdown formatting.
      `;

      const parts: Part[] = [
        { text: sanitizedInput },
        ...files.map(f => ({ inlineData: f.inlineData }))
      ];

      const response = await model.generateContent({
        contents: [{ role: 'user', parts }],
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      });

      let responseText = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new TrustGateError("Empty response from Vertex AI.", traceId, "EMPTY_AI_RESPONSE");
      }

      // Robust JSON extraction
      if (responseText.includes('```json')) {
        responseText = responseText.split('```json')[1].split('```')[0].trim();
      } else if (responseText.includes('```')) {
        responseText = responseText.split('```')[1].split('```')[0].trim();
      }

      let result: TrustGateResponse;
      try {
        result = JSON.parse(responseText) as TrustGateResponse;
      } catch (e) {
        logger.error(`[AIService] [${traceId}] JSON Parse Failed. Raw text: ${responseText.substring(0, 500)}`);
        throw new TrustGateError("Failed to parse AI response as JSON.", traceId, "INVALID_JSON");
      }
      
      // 4. Post-processing & Safety Guardrails
      result = await ValidationService.verifyOutput(result, traceId);
      
      // 5. Update Cache
      this.cache.set(cacheKey, result);

      // 6. Notify Observers
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
    } catch (error: any) {
      const tgError = error instanceof TrustGateError ? error : new TrustGateError(error.message, traceId);
      logger.error('[AIService] AI Generation Failed', { error: tgError.message, traceId });
      
      // Safety Fallback Message
      const fallback: TrustGateResponse = {
        traceId,
        timestamp: new Date().toISOString(),
        domain: "SAFETY_FALLBACK",
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
        issues_detected: ["AI_SERVICE_UNAVAILABLE"],
        recommendation: "Service temporarily optimizing safety filters. Please retry.",
        final_decision: FinalDecision.BLOCK,
        processing_details: {
          completeness: 0,
          relevance: 0,
          consistency: 0,
          risk_penalty: 1
        }
      };

      await this.notifyTaskFailed(tgError, traceId);
      
      return fallback;
    }
  }
}

export const aiService = AIService.getInstance();
