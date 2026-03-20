import { GoogleGenAI, Type } from "@google/genai";
import { TrustGateResponse, RiskLevel, FinalDecision } from "../types";

const API_KEY = process.env.GEMINI_API_KEY || "";

export const validateHealthcareInput = async (input: string): Promise<TrustGateResponse> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const systemInstruction = `
    You are TrustGate AI, a specialized healthcare decision validator.
    Your task is to transform unstructured healthcare inputs into structured, validated JSON.
    
    CRITICAL RULES:
    1. NEVER provide a direct medical diagnosis.
    2. Focus on data extraction, validation, and safety.
    3. Calculate scores based on the following logic:
       - completeness (0.0 to 1.0): Are symptoms, values, and ranges present?
       - relevance (0.0 to 1.0): Is the output strictly based on input?
       - consistency (0.0 to 1.0): Are there contradictions?
       - risk_penalty (0.0 to 1.0): 0.0 for low risk, 0.5 for medium, 1.0 for high.
    
    CONFIDENCE SCORE CALCULATION:
    Confidence Score = (0.3 * completeness) + (0.3 * relevance) + (0.2 * consistency) + (0.2 * (1 - risk_penalty))
    
    DECISION ENGINE:
    - APPROVE: score >= 0.8
    - WARNING: 0.5 <= score < 0.8
    - BLOCK: score < 0.5
    
    OUTPUT FORMAT:
    You must return a JSON object matching the requested schema.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: input,
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
              test_indicators: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.STRING },
                    reference_range: { type: Type.STRING },
                    unit: { type: Type.STRING }
                  }
                }
              },
              missing_values: { type: Type.ARRAY, items: { type: Type.STRING } },
              patient_context: { type: Type.STRING }
            }
          },
          risk_level: { type: Type.STRING, enum: Object.values(RiskLevel) },
          confidence_score: { type: Type.NUMBER },
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
            }
          }
        },
        required: ["domain", "structured_data", "risk_level", "confidence_score", "issues_detected", "recommendation", "final_decision", "processing_details"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as TrustGateResponse;
};
