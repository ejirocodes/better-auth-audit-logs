import { describe, test, expect } from "bun:test";
import { auditLog } from "../src/plugin";
import { IDENTIFIER_BODY_FIELDS } from "../src/hooks/after";
import { MemoryStorage } from "../src/adapters/memory";
import type { AuditLogOptions } from "../src/types";

async function capture(path: string, body: unknown, options: AuditLogOptions = {}) {
  const storage = new MemoryStorage();
  const plugin = auditLog({ ...options, storage });
  await (plugin.hooks.after[0]!.handler as Function)({
    path,
    body,
    context: {
      returned: new Error("Denied"),
      options: {},
    },
  });
  expect(storage.entries).toHaveLength(1);
  return storage.entries[0]!;
}

describe("identifier capture", () => {
  test.each(Object.entries(IDENTIFIER_BODY_FIELDS))("captures allowlisted fields for %s only when enabled", async (path, fields) => {
    const identifiers = Object.fromEntries(fields.map((field) => [field, `${field}-identifier`]));
    const body = {
      ...identifiers,
      password: "private-password",
      idToken: "private-token",
      token: "private-token",
      key: "private-key",
      otp: "private-code",
      extra: "private-extra",
      callbackURL: "private-callback",
    };
    const entry = await capture(path, body, { capture: { identifiers: true } });
    expect(entry.status).toBe("failed");
    expect(entry.userId).toBeNull();
    expect(entry.metadata).toMatchObject(identifiers);
    expect(entry.metadata.requestBody).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("private-");

    const defaultEntry = await capture(path, body);
    for (const field of Object.keys(identifiers)) {
      expect(defaultEntry.metadata[field]).toBeUndefined();
    }
  });

  test("does not capture identifiers for unknown paths", async () => {
    const entry = await capture("/other", { email: "private@example.com" }, {
      capture: { identifiers: true },
    });
    expect(entry.metadata.email).toBeUndefined();
  });

  test.each([undefined, null, "not an object", { email: { token: "private-token" } }])(
    "ignores non-primitive identifiers in %j", async (body) => {
      const entry = await capture("/sign-in/email", body, { capture: { identifiers: true } });
      expect(entry.metadata.email).toBeUndefined();
    },
  );

  test("per-path settings override global identifier capture", async () => {
    for (const enabled of [true, false]) {
      const entry = await capture("/sign-in/email", { email: "alice@example.com" }, {
        capture: { identifiers: !enabled },
        paths: [{ path: "/sign-in/email", config: { capture: { identifiers: enabled } } }],
      });
      expect(entry.metadata.email).toBe(enabled ? "alice@example.com" : undefined);
    }
  });

  test("identifier fields use configured PII redaction", async () => {
    const entry = await capture("/sign-in/email", { email: "alice@example.com" }, {
      capture: { identifiers: true },
      piiRedaction: { enabled: true, fields: ["email"] },
    });
    expect(entry.metadata.email).toBe("[REDACTED]");
  });
});
