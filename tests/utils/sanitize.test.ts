import { describe, test, expect } from "bun:test";
import { redactPII } from "../../src/utils/sanitize";

describe("redactPII", () => {
  test("masks password by default", async () => {
    const result = await redactPII(
      { email: "user@example.com", password: "secret123" },
      { enabled: true, strategy: "mask" },
    );
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });

  test("removes fields with remove strategy", async () => {
    const result = await redactPII(
      { password: "secret", token: "abc" },
      { enabled: true, strategy: "remove" },
    );
    expect("password" in result).toBe(false);
    expect("token" in result).toBe(false);
  });

  test("hashes fields with hash strategy", async () => {
    const result = await redactPII(
      { password: "secret" },
      { enabled: true, strategy: "hash" },
    );
    expect(typeof result.password).toBe("string");
    expect((result.password as string).length).toBe(64);
  });

  test("same input produces same hash", async () => {
    const a = await redactPII(
      { password: "deterministic" },
      { enabled: true, strategy: "hash" },
    );
    const b = await redactPII(
      { password: "deterministic" },
      { enabled: true, strategy: "hash" },
    );
    expect(a.password).toBe(b.password);
  });

  test("skips redaction when disabled", async () => {
    const result = await redactPII(
      { password: "secret" },
      { enabled: false },
    );
    expect(result.password).toBe("secret");
  });

  test("skips null/undefined fields", async () => {
    const result = await redactPII(
      { password: null },
      { enabled: true, strategy: "mask" },
    );
    expect(result.password).toBeNull();
  });

  test("respects custom field list", async () => {
    const result = await redactPII(
      { email: "user@example.com", customField: "sensitive" },
      { enabled: true, strategy: "mask", fields: ["customField"] },
    );
    expect(result.customField).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });

  test("includeFields drops keys not in the allowlist", async () => {
    const result = await redactPII(
      { email: "user@example.com", token: "abc123", customField: "sensitive" },
      { enabled: true, strategy: "mask", includeFields: ["email"] },
    );
    expect(result.email).toBe("user@example.com");
    expect("token" in result).toBe(false);
    expect("customField" in result).toBe(false);
  });

  test("includeFields still redacts a kept key matching a default PII field", async () => {
    const result = await redactPII(
      { email: "user@example.com", token: "abc123", password: "secret123" },
      { enabled: true, strategy: "mask", includeFields: ["email", "token"] },
    );
    expect(result.email).toBe("user@example.com");
    expect(result.token).toBe("[REDACTED]"); // token is a default PII field
    expect("password" in result).toBe(false);
  });

  test("includeFields composes with an explicit fields list", async () => {
    const result = await redactPII(
      {
        email: "user@example.com",
        password: "secret123",
        token: "abc123",
        customField: "sensitive",
      },
      {
        enabled: true,
        strategy: "mask",
        includeFields: ["email", "password"],
        fields: ["password"],
      },
    );
    expect(result.email).toBe("user@example.com");
    expect(result.password).toBe("[REDACTED]");
    expect("token" in result).toBe(false);
    expect("customField" in result).toBe(false);
  });

  test("includeFields with remove strategy", async () => {
    const result = await redactPII(
      { email: "user@example.com", password: "secret", token: "abc123" },
      {
        enabled: true,
        strategy: "remove",
        includeFields: ["email", "password"],
        fields: ["password"],
      },
    );
    expect(result.email).toBe("user@example.com");
    expect("password" in result).toBe(false);
    expect("token" in result).toBe(false);
  });

  test("includeFields with hash strategy", async () => {
    const result = await redactPII(
      { email: "user@example.com", password: "secret", token: "abc123" },
      {
        enabled: true,
        strategy: "hash",
        includeFields: ["email", "password"],
        fields: ["password"],
      },
    );
    expect(result.email).toBe("user@example.com");
    expect(typeof result.password).toBe("string");
    expect((result.password as string).length).toBe(64);
    expect("token" in result).toBe(false);
  });
});
