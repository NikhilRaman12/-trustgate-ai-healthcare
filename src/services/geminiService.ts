import { TrustGateResponse, HealthcareFile } from "../types";

export const validateHealthcareInput = async (input: string, files?: HealthcareFile[], userId?: string): Promise<TrustGateResponse> => {
  try {
    // 1. Submit Job to "Cloud Function" (Server-side API)
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, files, userId }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    const { jobId, from_cache, ...cachedResult } = await response.json();

    // 2. If it was a cache hit, return immediately
    if (from_cache) {
      return cachedResult as TrustGateResponse;
    }

    // 3. Poll for Job Status (Asynchronous Task Queue Pattern)
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds
    
    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`/api/jobs/${jobId}`);
      const job = await statusResponse.json();

      if (job.status === "completed") {
        return job.result as TrustGateResponse;
      }

      if (job.status === "failed") {
        throw new Error(`Job failed: ${job.error}`);
      }

      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    throw new Error("Validation timed out. Please try again.");
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    throw error;
  }
};
