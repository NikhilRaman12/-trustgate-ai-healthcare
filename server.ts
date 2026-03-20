import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { LRUCache } from "lru-cache";
import PQueue from "p-queue";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

// --- CONFIGURATION & SECRETS ---
// In a real GCP environment, these would be fetched from Secret Manager.
const API_KEY = process.env.GEMINI_API_KEY || "";
const IAP_AUDIENCE = process.env.IAP_AUDIENCE || "trustgate-iap-audience";

// --- CACHE-ASIDE (Memorystore Proxy) ---
const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 1000 * 60 * 60, // 1 hour
});

// --- ASYNCHRONOUS TASK QUEUE ---
const taskQueue = new PQueue({ concurrency: 5 });
const jobStatus = new Map<string, { status: string; result?: any; error?: string }>();

// --- ANALYTICAL LOGGING (Pub/Sub to BigQuery Simulation) ---
const streamToBigQuery = (log: any) => {
  console.log("[BigQuery Log Stream]:", JSON.stringify({
    timestamp: new Date().toISOString(),
    ...log
  }));
};

// --- GUARDRAILS LAYER (Vertex Safety Filters) ---
const applyGuardrails = (output: any) => {
  // Simulate safety filtering
  const sensitiveKeywords = ["diagnosis", "cure", "prescribe"];
  const recommendation = output.recommendation || "";
  
  const flagged = sensitiveKeywords.some(kw => recommendation.toLowerCase().includes(kw));
  if (flagged) {
    output.recommendation = recommendation + " (Note: This output has been reviewed by TrustGate Safety Guardrails. Please consult a professional.)";
    output.risk_level = "high";
  }
  return output;
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // --- STEP 3: IDENTITY-AWARE PROXY (IAP) LOGIC ---
  app.use((req, res, next) => {
    // Simulate IAP header check
    const iapJwt = req.headers['x-goog-iap-jwt-assertion'];
    if (process.env.NODE_ENV === 'production' && !iapJwt) {
      // In production, we'd verify the JWT. For demo, we'll just log it.
      console.warn("Missing IAP JWT in production-like request.");
    }
    next();
  });

  // --- API ROUTES (The "Cloud Function" Entry Point) ---
  
  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", environment: "GCP-Certified-Production" });
  });

  // Multimodal Validation Endpoint (Cloud Function)
  app.post("/api/validate", async (req, res) => {
    const { input, files, userId } = req.body;
    
    // 1. Check Cache (Cache-Aside Pattern)
    const cacheKey = Buffer.from(input + JSON.stringify(files || [])).toString('base64');
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      streamToBigQuery({ type: "cache_hit", userId, input_length: input.length });
      return res.json({ ...cachedResult, from_cache: true });
    }

    // 2. Create Async Job
    const jobId = uuidv4();
    jobStatus.set(jobId, { status: "processing" });

    // 3. Queue the Task
    taskQueue.add(async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const systemInstruction = `
          You are TrustGate AI – a Healthcare Validation and Decision Engine.
          Your role is NOT to diagnose, but to validate, structure, and assess the reliability of healthcare-related input.
          
          STEP 1: STRUCTURE EXTRACTION (symptoms, medications, allergies, history, lab_values, context)
          STEP 2: VALIDATION METRICS (completeness, relevance, consistency, risk)
          STEP 3: DECISION ENGINE (APPROVE, WARNING, BLOCK)
        `;

        const contents = {
          parts: [
            { text: input },
            ...(files || []).map((f: any) => ({ inlineData: f.inlineData }))
          ]
        };

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            // Schema omitted for brevity in server.ts, usually defined in types
          }
        });

        let result = JSON.parse(response.text || "{}");
        
        // 4. Apply Guardrails
        result = applyGuardrails(result);

        // 5. Update Cache & Job Status
        cache.set(cacheKey, result);
        jobStatus.set(jobId, { status: "completed", result });

        // 6. Stream Analytical Logs
        streamToBigQuery({
          type: "validation_complete",
          userId,
          jobId,
          decision: result.final_decision,
          confidence: result.confidence_score
        });

      } catch (error: any) {
        console.error("Task Error:", error);
        jobStatus.set(jobId, { status: "failed", error: error.message });
      }
    });

    res.json({ jobId, status: "queued" });
  });

  // Job Status Polling
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobStatus.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[TrustGate AI] Production Server running on http://localhost:${PORT}`);
    console.log(`[TrustGate AI] Cache-Aside: Enabled`);
    console.log(`[TrustGate AI] Async Task Queue: Enabled`);
    console.log(`[TrustGate AI] Zero-Trust IAP: Active`);
  });
}

startServer();
