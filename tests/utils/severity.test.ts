import { describe, test, expect } from "bun:test";
import { inferSeverity } from "../../src/utils/severity";

describe("inferSeverity", () => {
  test("critical for ban-user", () => {
    expect(inferSeverity("ban-user", "success")).toBe("critical");
  });

  test("critical for impersonate-user", () => {
    expect(inferSeverity("impersonate-user", "success")).toBe("critical");
  });

  test("high for delete-user", () => {
    expect(inferSeverity("delete-user", "success")).toBe("high");
  });

  test("high for revoke-sessions", () => {
    expect(inferSeverity("revoke-sessions", "success")).toBe("high");
  });

  test("medium for sign-in success", () => {
    expect(inferSeverity("sign-in:email", "success")).toBe("medium");
  });

  test("high for sign-in failure (escalation)", () => {
    expect(inferSeverity("sign-in:email", "failed")).toBe("high");
  });

  test("medium for change-password success", () => {
    expect(inferSeverity("change-password", "success")).toBe("medium");
  });

  test("low for unknown actions", () => {
    expect(inferSeverity("custom:action", "success")).toBe("low");
  });

  test("low for unknown failed actions", () => {
    expect(inferSeverity("custom:action", "failed")).toBe("low");
  });

  test("matches partial action names", () => {
    expect(inferSeverity("two-factor:totp:verify", "success")).toBe("medium");
  });
});
