export class HttpError extends Error {
  status: number;
  /** Optional machine-readable reason the client can branch on (e.g. 'session_expired'). */
  code?: string;
  /** Extra machine-readable fields merged into the JSON body (e.g. retryAfterSeconds). */
  details?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code);
export const unauthorized = (msg = 'Unauthorized') => new HttpError(401, msg);
/** 401 meaning "your session is not valid" (as opposed to e.g. a wrong current password). */
export const sessionExpired = (msg = 'Session expired, please sign in again') => new HttpError(401, msg, 'session_expired');
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
/** 403 meaning "sign-in is fine, but the email address has not been confirmed yet". */
export const emailNotVerified = () => new HttpError(403, 'Please confirm your email address to continue.', 'email_not_verified');
/** 429 with a machine-readable wait, used by the email resend cooldown. */
export const tooSoon = (retryAfterSeconds: number) =>
  new HttpError(429, 'Please wait a moment before requesting another email.', 'resend_cooldown', { retryAfterSeconds });
/** 503 when the email provider could not accept the message. */
export const emailDeliveryFailed = () =>
  new HttpError(503, 'We could not send the email right now. Please try again in a minute.', 'email_delivery_failed');
