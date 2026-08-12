/**
 * Authorization failures raised by the RBAC guards. Route handlers translate
 * these into 401/403 responses; server actions surface them as denials. The
 * message is intentionally generic — never leak scope or existence details.
 */
export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN_ROLE"
  | "FORBIDDEN_SCOPE"
  | "NOT_GUARDIAN_OF";

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AuthError";
    this.code = code;
  }
}
