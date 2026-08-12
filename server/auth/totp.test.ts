import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  currentTotpToken,
  verifyTotp,
  totpAuthUri,
} from "./totp";

describe("TOTP second factor (staff MFA)", () => {
  it("verifies the current token for a secret", () => {
    const secret = generateTotpSecret();
    const token = currentTotpToken(secret);
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it("rejects a wrong token", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("000000", secret)).toBe(false);
  });

  it("rejects a token generated from a different secret", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(verifyTotp(currentTotpToken(b), a)).toBe(false);
  });

  it("builds an otpauth enrolment URI", () => {
    const secret = generateTotpSecret();
    const uri = totpAuthUri(secret, "cashier@woodbridge.demo");
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(secret);
  });
});
