import { describe, test, expect } from "bun:test";
import { auditLog } from "../src/plugin";
import type { HookEndpointContext } from "@better-auth/core";

const DEFAULT_BEFORE_PATHS = [
  "/sign-out",
  "/delete-user",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
];

function makeContext(path: string): HookEndpointContext {
  return {
    path,
    context: {} as HookEndpointContext["context"],
  };
}

describe("auditLog plugin", () => {
  test("returns a valid BetterAuthPlugin shape", () => {
    const plugin = auditLog();
    expect(plugin.id).toBe("audit-log");
    expect(Array.isArray(plugin.hooks.before)).toBe(true);
    expect(Array.isArray(plugin.hooks.after)).toBe(true);
    expect(plugin.schema).toBeDefined();
    expect(plugin.endpoints.listAuditLogs).toBeDefined();
    expect(plugin.endpoints.getAuditLog).toBeDefined();
    expect(plugin.endpoints.insertAuditLog).toBeDefined();
  });

  test("before hook matcher fires for all default before paths", () => {
    const plugin = auditLog();
    const [hook] = plugin.hooks.before;
    for (const path of DEFAULT_BEFORE_PATHS) {
      expect(hook!.matcher(makeContext(path))).toBe(true);
    }
  });

  test("before hook matcher does not fire for after-only paths", () => {
    const plugin = auditLog();
    const [hook] = plugin.hooks.before;
    expect(hook!.matcher(makeContext("/sign-in/email"))).toBe(false);
    expect(hook!.matcher(makeContext("/sign-up/email"))).toBe(false);
  });

  test("after hook matcher fires for non-before paths", () => {
    const plugin = auditLog();
    const [hook] = plugin.hooks.after;
    expect(hook!.matcher(makeContext("/sign-in/email"))).toBe(true);
    expect(hook!.matcher(makeContext("/sign-up/email"))).toBe(true);
    expect(hook!.matcher(makeContext("/change-password"))).toBe(true);
  });

  test("after hook matcher excludes default before paths", () => {
    const plugin = auditLog();
    const [hook] = plugin.hooks.after;
    for (const path of DEFAULT_BEFORE_PATHS) {
      expect(hook!.matcher(makeContext(path))).toBe(false);
    }
  });

  test("custom beforePaths override defaults", () => {
    const plugin = auditLog({ beforePaths: ["/custom-action"] });
    const [beforeHook] = plugin.hooks.before;
    const [afterHook] = plugin.hooks.after;

    expect(beforeHook!.matcher(makeContext("/custom-action"))).toBe(true);
    expect(afterHook!.matcher(makeContext("/custom-action"))).toBe(false);

    expect(beforeHook!.matcher(makeContext("/sign-out"))).toBe(false);
    expect(afterHook!.matcher(makeContext("/sign-out"))).toBe(true);
  });

  test("paths whitelist restricts which paths are captured", () => {
    const plugin = auditLog({ paths: ["/sign-in/email"] });
    const [afterHook] = plugin.hooks.after;
    expect(afterHook!.matcher(makeContext("/sign-in/email"))).toBe(true);
    expect(afterHook!.matcher(makeContext("/sign-up/email"))).toBe(false);
  });

  test("paths whitelist restricts before-hooks too", () => {
    const plugin = auditLog({ paths: ["/sign-in/email"] });
    const [beforeHook] = plugin.hooks.before;
    expect(beforeHook!.matcher(makeContext("/sign-out"))).toBe(false);
  });

  test("when enabled: false, hook arrays are empty", () => {
    const plugin = auditLog({ enabled: false });
    expect(plugin.hooks.before).toHaveLength(0);
    expect(plugin.hooks.after).toHaveLength(0);
  });

  test("schema uses default model name when not overridden", () => {
    const plugin = auditLog();
    expect(plugin.schema.auditLog).toBeDefined();
  });

  test("schema respects custom model name", () => {
    const plugin = auditLog({ schema: { auditLog: { modelName: "audit_events" } } });
    const modelName =
      (plugin.schema.auditLog as { modelName?: string }).modelName ?? "auditLog";
    expect(modelName).toBe("audit_events");
  });

  test("rate limit is applied to /audit-log/ paths", () => {
    const plugin = auditLog();
    const [limit] = plugin.rateLimit!;
    expect(limit!.pathMatcher("/audit-log/list")).toBe(true);
    expect(limit!.pathMatcher("/sign-in/email")).toBe(false);
  });

  test("throws if custom storage adapter missing write method", () => {
    expect(() => auditLog({ storage: {} as any })).toThrow(
      "must implement write",
    );
  });

  test("throws if storage.read is not a function", () => {
    expect(() =>
      auditLog({ storage: { write: async () => {}, read: "not-a-fn" } as any }),
    ).toThrow("storage.read must be a function");
  });

  test("accepts valid custom storage adapter", () => {
    expect(() =>
      auditLog({ storage: { write: async () => {} } }),
    ).not.toThrow();
  });
});
