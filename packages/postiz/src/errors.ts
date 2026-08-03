export type PostizProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "VALIDATION_FAILED"
  | "NETWORK_ERROR"
  | "REMOTE_ERROR"
  | "INVALID_RESPONSE";

export interface PostizProviderErrorOptions {
  code: PostizProviderErrorCode;
  operation: string;
  retryable: boolean;
  remoteStateMayHaveChanged: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  details?: unknown;
  cause?: unknown;
}

export class PostizProviderError extends Error {
  readonly code: PostizProviderErrorCode;
  readonly operation: string;
  readonly retryable: boolean;
  readonly remoteStateMayHaveChanged: boolean;
  readonly statusCode: number | undefined;
  readonly retryAfterMs: number | undefined;
  readonly details: unknown;

  constructor(message: string, options: PostizProviderErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PostizProviderError";
    this.code = options.code;
    this.operation = options.operation;
    this.retryable = options.retryable;
    this.remoteStateMayHaveChanged = options.remoteStateMayHaveChanged;
    this.statusCode = options.statusCode;
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }
}
