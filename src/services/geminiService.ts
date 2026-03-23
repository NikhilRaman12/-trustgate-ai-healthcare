import { GoogleGenAI, Type } from "@google/genai";
import { TrustGateResponse, HealthcareFile, FinalDecision, RiskLevel } from "../core/types";
import { generateTraceId } from "../utils";

// Initialize Gemini on the frontend (Safe in AI Studio environment)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const validateHealthcareInput = async (input: string, files: HealthcareFile[] = [], userId?: string): Promise<TrustGateResponse> => {
  const traceId = generateTraceId();
  const startTime = Date.now();

  try {
    const model = ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: input },
            ...files.map(f => ({ inlineData: f.inlineData }))
          ]
        }
      ],
      config: {
        systemInstruction: `
          You are TrustGate AI – a Healthcare Validation and Decision Engine.
          Your role is NOT to diagnose, but to validate, structure, and assess the reliability of healthcare-related input.
          
          STEP 1: STRUCTURE EXTRACTION (symptoms, medications, allergies, history, lab_values, context)
          STEP 2: VALIDATION METRICS (completeness, relevance, consistency, risk)
          STEP 3: DECISION ENGINE (APPROVE, WARNING, BLOCK)
          
          Return ONLY valid JSON matching the requested schema. No markdown formatting.
        `,
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
                lab_values: { type: Type.OBJECT, properties: { notes: { type: Type.STRING } } },
                patient_context: { type: Type.OBJECT, properties: { notes: { type: Type.STRING } } },
                missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["symptoms", "medications", "allergies", "medical_history", "lab_values", "patient_context", "missing_fields"]
            },
            risk_level: { type: Type.STRING },
            confidence_score: { type: Type.NUMBER },
            issues_detected: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendation: { type: Type.STRING },
            final_decision: { type: Type.STRING },
            processing_details: {
              type: Type.OBJECT,
              properties: {
                completeness: { type: Type.NUMBER },
                relevance: { type: Type.NUMBER },
                consistency: { type: Type.NUMBER },
                risk_penalty: { type: Type.NUMBER },
              },
              required: ["completeness", "relevance", "consistency", "risk_penalty"]
            }
          },
          required: ["domain", "structured_data", "risk_level", "confidence_score", "issues_detected", "recommendation", "final_decision", "processing_details"]
        }
      }
    });

    const result = await model;
    const responseText = result.text;
    
    if (!responseText) {
      throw new Error("Empty response from Gemini.");
    }

    const trustGateResult = JSON.parse(responseText) as TrustGateResponse;
    trustGateResult.traceId = traceId;
    trustGateResult.timestamp = new Date().toISOString();

    // 4. Send Audit Log to Backend (Asynchronous)
    fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        log: {
          traceId,
          userId,
          timestamp: trustGateResult.timestamp,
          inputLength: input.length,
          hasFiles: files.length > 0,
          decision: trustGateResult.final_decision,
          confidence: trustGateResult.confidence_score,
          risk: trustGateResult.risk_level,
          latencyMs: Date.now() - startTime,
          cached: false
        }
      })
    }).catch(err => console.error("Audit logging failed:", err));

    return trustGateResult;
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    
    // Log failure to backend
    fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        log: {
          traceId,
          userId,
          timestamp: new Date().toISOString(),
          inputLength: input.length,
          hasFiles: files.length > 0,
          decision: FinalDecision.BLOCK,
          confidence: 0,
          risk: RiskLevel.HIGH,
          latencyMs: Date.now() - startTime,
          cached: false
        }
      })
    }).catch(err => console.error("Audit logging failed:", err));

    throw new Error(`Failed to process the request (ID: ${traceId}). ${error.message}`);
  }
};
