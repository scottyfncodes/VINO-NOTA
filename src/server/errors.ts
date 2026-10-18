/** Errors whose messages are safe to show to the user. */
export class UserFacingError extends Error {
  readonly status: number;
  readonly details?: string[];
  constructor(message: string, status = 400, details?: string[]) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
    this.details = details;
  }
}

export class NotFoundError extends UserFacingError {
  constructor(what = "Record") {
    // Deliberately identical for "missing" and "belongs to someone else".
    super(`${what} not found.`, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends UserFacingError {
  constructor(details: string[]) {
    super(details[0] ?? "Please check the highlighted fields.", 422, details);
    this.name = "ValidationError";
  }
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; details?: string[] };

/** Converts thrown errors to a safe result; unexpected errors are logged without user data. */
export function toActionError(error: unknown, context: string): { ok: false; error: string; details?: string[] } {
  if (error instanceof UserFacingError) {
    return { ok: false, error: error.message, details: error.details };
  }
  // Re-throw Next.js control-flow errors (redirect / notFound).
  if (error && typeof error === "object" && "digest" in error && typeof (error as { digest: unknown }).digest === "string") {
    const digest = (error as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw error;
  }
  console.error(`[${context}] unexpected error:`, error instanceof Error ? `${error.name}: ${error.message}` : "unknown");
  return { ok: false, error: "Something went wrong while saving. Your entries are still here — please try again." };
}
