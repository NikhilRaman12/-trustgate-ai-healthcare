export enum GeminiErrorType {
  NETWORK = "NETWORK",
  API_KEY = "API_KEY",
  RESPONSE_FORMAT = "RESPONSE_FORMAT",
  RATE_LIMIT = "RATE_LIMIT",
  UNKNOWN = "UNKNOWN",
}

export class GeminiServiceError extends Error {
  constructor(
    public type: GeminiErrorType,
    message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = "GeminiServiceError";
  }
}
