import { authenticator } from "otplib";

/**
 * TOTP (RFC 6238) second factor for staff. Guardians are single-factor.
 * A ±1 step window tolerates clock skew and the demo typing a code as it
 * rolls over.
 */
authenticator.options = { window: 1 };

const ISSUER = "Woodbridge Nutrition";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function currentTotpToken(secret: string): string {
  return authenticator.generate(secret);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

/** otpauth:// URI for QR enrolment (used by the seed output / future UI). */
export function totpAuthUri(secret: string, accountLabel: string): string {
  return authenticator.keyuri(accountLabel, ISSUER, secret);
}
