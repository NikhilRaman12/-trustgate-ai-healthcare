import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { v4 as uuidv4 } from "uuid";
import { AuditTrail } from "./src/infrastructure/bigquery";
import { gcpProvider, logger } from "./src/infrastructure/gcpConfig";

// --- CONFIGURATION & SECRETS ---
const PORT = 3000;

async function startServer() {
  const app = express();

  // Non-blocking GCP Health Check
  gcpProvider.checkHealth().then(health => {
    if (health.status !== 'healthy') {
      logger.debug("[TrustGate AI] Initial GCP Health Check: Degraded", health.services);
    } else {
      logger.debug("[TrustGate AI] Initial GCP Health Check: 100% Healthy");
    }
  });

  app.use(express.json({ limit: '10mb' }));

  // --- IDENTITY-AWARE PROXY (IAP) LOGIC ---
  app.use((req, res, next) => {
    const iapJwt = req.headers['x-goog-iap-jwt-assertion'];
    // Only log if explicitly in a strict production environment and not a health check or static asset
    if (process.env.NODE_ENV === 'production' && !iapJwt && !req.path.startsWith('/api/health') && !req.path.includes('.')) {
      // Reduced severity to avoid false failure indicators in deployment logs
      logger.debug("[IAP] JWT assertion header not present.");
    }
    next();
  });

  // --- API ROUTES ---
  
  // Health Check
  app.get("/api/health", async (req, res) => {
    const health = await gcpProvider.checkHealth();
    res.json({ 
      status: health.status, 
      environment: gcpProvider.isProduction ? "Production" : "Preview",
      services: health.services 
    });
  });

  // Audit Logging Endpoint (Streams to BigQuery in Production)
  app.post("/api/audit", async (req, res) => {
    const { log } = req.body;
    try {
      await AuditTrail.streamLog(log);
      res.json({ status: "ok" });
    } catch (error: any) {
      logger.error("[Server] Audit logging failed:", { error: error.message });
      res.status(500).json({ error: "Failed to log audit data" });
    }
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
    logger.info(`[TrustGate AI] Server listening on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
