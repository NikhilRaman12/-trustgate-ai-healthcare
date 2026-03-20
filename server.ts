import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { v4 as uuidv4 } from "uuid";
import { TrustGateOrchestrator } from "./src/core/app";
import { TaskQueue } from "./src/core/taskQueue";
import { BigQueryLogger } from "./src/infrastructure/bigquery";
import { CoreAI } from "./src/core/aiEngine";
import { logger, verifyGCPConnectivity } from "./src/infrastructure/GCP_Client_Config";

// --- CONFIGURATION & SECRETS ---
const PORT = 3000;

// --- ASYNCHRONOUS TASK QUEUE STATE ---
const jobStatus = new Map<string, { status: string; result?: any; error?: string }>();

async function startServer() {
  const app = express();

  // Verify GCP Connectivity on startup
  await verifyGCPConnectivity();

  app.use(express.json({ limit: '10mb' }));

  // --- IDENTITY-AWARE PROXY (IAP) LOGIC ---
  app.use((req, res, next) => {
    const iapJwt = req.headers['x-goog-iap-jwt-assertion'];
    if (process.env.NODE_ENV === 'production' && !iapJwt) {
      logger.warn("Missing IAP JWT in production-like request.");
    }
    next();
  });

  // --- API ROUTES ---
  
  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", environment: "GCP-Certified-Production" });
  });

  // Multimodal Validation Endpoint (Cloud Function)
  app.post("/api/validate", async (req, res) => {
    const { input, files, userId } = req.body;
    const traceId = BigQueryLogger.generateTraceId();
    
    // 1. Create Async Job
    const jobId = uuidv4();
    jobStatus.set(jobId, { status: "processing" });

    // 2. Queue the Task using the modular Orchestrator
    // We don't await it here to return the jobId immediately
    TaskQueue.getInstance().enqueue(async () => {
      try {
        const result = await TrustGateOrchestrator.processRequest(input, files, userId, traceId);
        jobStatus.set(jobId, { status: "completed", result });
      } catch (error: any) {
        logger.error(`[Server] [${traceId}] Task failed:`, { error: error.message });
        jobStatus.set(jobId, { status: "failed", error: error.message });
      }
    }, traceId).catch(err => {
      logger.error(`[Server] [${traceId}] Critical Queue Failure:`, { error: err.message });
    });

    res.json({ jobId, status: "queued", traceId });
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
    logger.info(`[TrustGate AI] Production Server running on http://localhost:${PORT}`);
    logger.info(`[TrustGate AI] Modular Core Engine: Active`);
    logger.info(`[TrustGate AI] Async Task Queue: Active`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
