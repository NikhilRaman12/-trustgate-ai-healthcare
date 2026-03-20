export function validateInput(input: string) {
  if (!input || input.trim().length < 5) {
    return {
      error: "Insufficient input. Please provide more medical details (at least 5 characters)."
    };
  }
  return null;
}

export function getCompleteness(input: string) {
  if (input.length > 100) return 0.9;
  if (input.length > 50) return 0.7;
  if (input.length > 20) return 0.5;
  return 0.3;
}

/**
 * Generates a unique TraceID for end-to-end auditability.
 * @returns {string} A unique trace ID.
 */
export function generateTraceId(): string {
  return `tg-trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
