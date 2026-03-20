import { GoogleGenAI, Type } from "@google/genai";
import { TrustGateResponse, RiskLevel, FinalDecision, HealthcareFile } from "../types";
import { GeminiServiceError, GeminiErrorType } from "./errors";

const API_KEY = process.env.GEMINI_API_KEY || "";

export const validateHealthcareInput = async (input: string, files?: HealthcareFile[]): Promise<TrustGateResponse> => {
  if (!API_KEY) {
    throw new GeminiServiceError(GeminiErrorType.API_KEY, "GEMINI_API_KEY is not configured in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const systemInstruction = `
    You are TrustGate AI – a Healthcare Validation and Decision Engine.
    Your role is NOT to diagnose, but to validate, structure, and assess the reliability of healthcare-related input before any decision is made.
    
    You may receive text input, images (like prescriptions, lab reports, or photos of symptoms), or documents (like PDFs).
    Use ALL provided information to extract structured data.

    STEP 1: STRUCTURE EXTRACTION
    Extract:
    - symptoms (list)
    - medications (list)
    - allergies (list)
    - medical_history (list)
    - lab_values (object with key-value pairs, including numbers if present)
    - patient_context (object with keys like age, gender if mentioned)
    - missing_fields (list of what critical data is absent)

    STEP 2: VALIDATION METRICS
    Compute:
    1. Data Completeness (0–1)
       - 1.0 → includes numeric values, symptoms, context, or clear visual evidence from files
       - 0.5 → partial info
       - 0.2 → vague statement
    2. Context Relevance (0–1)
       - 1.0 → clearly medical
       - 0.5 → partially relevant
       - 0 → irrelevant
    3. Consistency Score (0–1)
       - 1.0 → no contradictions between text and files
       - 0.5 → unclear or slight mismatch
       - 0 → conflicting info (e.g., text says "no allergies" but image shows allergy list)
    4. Risk Penalty (0–1)
       - 0.7+ → high-risk (serious symptoms, missing critical data, or alarming visual evidence)
       - 0.4 → moderate
       - 0.1 → low

    STEP 3: CONFIDENCE SCORE
    confidence_score = (0.3 * completeness) + (0.3 * relevance) + (0.2 * consistency) + (0.2 * (1 - risk_penalty))

    STEP 4: DECISION ENGINE
    - ≥ 0.8 → APPROVE
    - 0.5–0.79 → WARNING
    - < 0.5 → BLOCK

    STEP 5: SAFETY RULES
    - NEVER give diagnosis
    - ALWAYS recommend professional consultation if risk exists
    - Highlight missing data clearly
    - If images are provided, acknowledge them in the recommendation.
  `;

  try {
    const contents = {
      parts: [
        { text: input },
        ...(files || []).map(f => ({ inlineData: f.inlineData }))
      ]
    };

    const response = await ai.models.generateContent({
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

    if (!response.text) {
      throw new GeminiServiceError(GeminiErrorType.RESPONSE_FORMAT, "Empty response from AI model.");
    }

    try {
      return JSON.parse(response.text) as TrustGateResponse;
    } catch (parseError) {
      throw new GeminiServiceError(GeminiErrorType.RESPONSE_FORMAT, "Failed to parse AI response JSON.", parseError);
    }
  } catch (error: any) {
    if (error instanceof GeminiServiceError) throw error;

    console.error("Gemini API Error:", error);
    
    const message = error.message || "";
    
    if (message.includes("API_KEY_INVALID") || message.includes("API key not valid")) {
      throw new GeminiServiceError(GeminiErrorType.API_KEY, "The Gemini API key is invalid or missing.", error);
    }
    
    if (message.includes("fetch failed") || error.name === "TypeError") {
      throw new GeminiServiceError(GeminiErrorType.NETWORK, "Network connection failed. Please check your internet.", error);
    }

    if (error.status === 429 || message.includes("429")) {
      throw new GeminiServiceError(GeminiErrorType.RATE_LIMIT, "API rate limit exceeded. Please try again later.", error);
    }

    throw new GeminiServiceError(GeminiErrorType.UNKNOWN, "An unexpected error occurred while processing your request.", error);
  }
};
