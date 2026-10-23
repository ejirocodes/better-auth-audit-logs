import { describe, test, expect, mock, beforeEach } from "bun:test";
import { APIError } from "better-auth/api";
import { MemoryStorage } from "../src/adapters/memory";
import { auditLog } from "../src/plugin";
import type { HookEndpointContext } from "better-auth";

describe("hook execution", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  function makeHandlerArg(
    path: string,
    overrides: Record<string, unknown> = {},
    body?: Record<string, unknown>,
  ) {
    const backgroundTasks: Promise<unknown>[] = [];
    return {
      path,
      request: new Request("http://localhost" + path),
      headers: new Headers({ "user-agent": "test-agent" }),
      body,
      context: {
        session: { user: { id: "user-1" } },
        newSession: undefined,
        returned: undefined,
        logger: {
          error: mock(() => {}),
          warn: mock(() => {}),
          info: mock(() => {}),
          debug: mock(() => {}),
        },
        runInBackground: (p: Promise<unknown>) => backgroundTasks.push(p),
        options: {},
        ...overrides,
      },
      _backgroundTasks: backgroundTasks,
    };
  }

  test("after hook creates a log entry for sign-in", async () => {
    const plugin = auditLog({ storage });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email");
    expect(afterHook!.matcher(arg as unknown as HookEndpointContext)).toBe(true);

    await (afterHook!.handler as Function)(arg);

    expect(storage.entries).toHaveLength(1);
    expect(storage.entries[0]?.action).toBe("sign-in:email");
    expect(storage.entries[0]?.userId).toBe("user-1");
    expect(storage.entries[0]?.status).toBe("success");
  });

  test("after hook records failed status when returned is an Error", async () => {
    const plugin = auditLog({ storage });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email", {
      returned: new Error("Invalid credentials"),
    });

    await (afterHook!.handler as Function)(arg);

    expect(storage.entries).toHaveLength(1);
    expect(storage.entries[0]?.status).toBe("failed");
    expect(storage.entries[0]?.metadata).toHaveProperty("error");
  });

  test("before hook does not crash for sign-out", async () => {
    const plugin = auditLog({ storage });
    const [beforeHook] = plugin.hooks.before;

    const arg = makeHandlerArg("/sign-out");
    expect(beforeHook!.matcher(arg as unknown as HookEndpointContext)).toBe(true);

    await (beforeHook!.handler as Function)(arg);
  });

  test("after hook with null userId for unauthenticated context", async () => {
    const plugin = auditLog({ storage });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email", {
      session: undefined,
      newSession: undefined,
    });

    await (afterHook!.handler as Function)(arg);

    expect(storage.entries).toHaveLength(1);
    expect(storage.entries[0]?.userId).toBeNull();
  });

  test("hook does not crash when storage write fails", async () => {
    const failStorage = {
      write: async () => { throw new Error("DB down"); },
    };

    const plugin = auditLog({ storage: failStorage });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email");
    await (afterHook!.handler as Function)(arg);
  });

  test("after hook captures request body when configured", async () => {
    const plugin = auditLog({ storage, capture: { requestBody: true } });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email");
    arg.body = { email: "test@example.com" } as any;

    await (afterHook!.handler as Function)(arg);

    expect(storage.entries).toHaveLength(1);
    const meta = storage.entries[0]?.metadata as Record<string, unknown>;
    expect(meta.requestBody).toBeDefined();
  });

  test("nonBlocking hooks run via runInBackground", async () => {
    const backgroundTasks: Promise<unknown>[] = [];
    const delayedStorage = {
      write: async (entry: any) => {
        await new Promise((r) => setTimeout(r, 50));
        storage.entries.push(entry);
      },
    };

    const plugin = auditLog({ storage: delayedStorage, nonBlocking: true });
    const [afterHook] = plugin.hooks.after;

    const arg = makeHandlerArg("/sign-in/email", {
      runInBackground: (p: Promise<unknown>) => backgroundTasks.push(p),
    });

    await (afterHook!.handler as Function)(arg);

    // Entry not written yet — delayed write is in the background
    expect(storage.entries).toHaveLength(0);

    await Promise.all(backgroundTasks);
    expect(storage.entries).toHaveLength(1);
  });

  test.each([true, false])("API key verification valid=%s records its outcome and owner", async (valid) => {
    const plugin = auditLog({ storage, piiRedaction: { enabled: true } });
    const key = valid ? { id: "key-1", userId: "owner", name: "automation", prefix: "app_" } : null;
    const arg = makeHandlerArg("/api-key/verify", {
      session: undefined,
      returned: { valid, key, error: valid ? null : { code: "KEY_EXPIRED", message: "Expired" } },
    });
    await (plugin.hooks.after[0]!.handler as Function)(arg);
    const entry = storage.entries[0]!;
    expect(storage.entries).toHaveLength(1);
    expect(entry.status).toBe(valid ? "success" : "failed");
    expect(entry.severity).toBe(valid ? "low" : "high");
    expect(entry.userId).toBe(valid ? "owner" : null);
    expect(entry.metadata).toEqual(valid
      ? { keyId: "key-1", keyName: "automation", keyPrefix: "app_" }
      : { error: { code: "KEY_EXPIRED", message: "Expired" } });
  });

  test.each(["/api-key/create", "/api-key/update", "/api-key/verify"])(
    "suppresses plaintext request bodies on %s even with a path override", async (path) => {
      const plugin = auditLog({
        storage,
        capture: { requestBody: true },
        paths: [{ path, config: { capture: { requestBody: true } } }],
      });
      await (plugin.hooks.after[0]!.handler as Function)(makeHandlerArg(path, {}, {
        key: "plaintext-private-key",
      }));
      expect(storage.entries).toHaveLength(1);
      expect(storage.entries[0]!.metadata.requestBody).toBeUndefined();
      expect(JSON.stringify(storage.entries)).not.toContain("plaintext-private-key");
    },
  );

  test("APIError failures preserve string status and diagnostic codes", async () => {
    const plugin = auditLog({ storage, piiRedaction: { enabled: true } });
    const returned = Object.assign(new APIError("UNAUTHORIZED", { message: "Invalid key" }), { code: "INVALID_KEY" });
    await (plugin.hooks.after[0]!.handler as Function)(makeHandlerArg("/api-key/verify", { returned }));
    expect(storage.entries[0]!.status).toBe("failed");
    expect(storage.entries[0]!.metadata.error).toEqual({
      status: "UNAUTHORIZED", message: "Invalid key", code: "INVALID_KEY",
    });
  });

  test.each([
    ["/callback/google", "/app", "FOUND", null],
    ["/callback/google", "/app?error=invalid_code", "FOUND", "invalid_code"],
    ["/verify-email", "https://app.example/?error=expired", "SEE_OTHER", "expired"],
    ["/verify-email", "/app?error=", "TEMPORARY_REDIRECT", ""],
    ["/callback/google", "/app?ok=1", 308, null],
  ] as const)("redirect %s -> %s records its outcome", async (path, location, code, error) => {
    const plugin = auditLog({ storage, piiRedaction: { enabled: true } });
    const returned = new APIError(code, undefined, new Headers({ location }));
    await (plugin.hooks.after[0]!.handler as Function)(makeHandlerArg(path, {
      returned, newSession: { user: { id: "oauth-user" } },
    }));
    expect(storage.entries).toHaveLength(1);
    expect(storage.entries[0]!.status).toBe(error === null ? "success" : "failed");
    expect(storage.entries[0]!.userId).toBe("oauth-user");
    expect(storage.entries[0]!.metadata.error).toEqual(error === null ? undefined : { code: error });
  });

  test("recognizes failed redirect Response values", async () => {
    const plugin = auditLog({ storage });
    const returned = new Response(null, { status: 302, headers: { location: "/app?error=invalid_code" } });
    await (plugin.hooks.after[0]!.handler as Function)(makeHandlerArg("/callback/google", { returned }));
    expect(storage.entries[0]!.status).toBe("failed");
    expect(storage.entries[0]!.metadata.error).toEqual({ code: "invalid_code" });
  });

  test.each([true, false])("path requestBody=%s overrides the global setting", async (enabled) => {
    const plugin = auditLog({
      storage,
      capture: { requestBody: !enabled },
      paths: [{ path: "/sign-in/email", config: { capture: { requestBody: enabled } } }],
    });
    await (plugin.hooks.after[0]!.handler as Function)(makeHandlerArg("/sign-in/email", {}, { email: "a@example.com" }));
    expect(storage.entries[0]!.metadata.requestBody).toEqual(enabled ? { email: "a@example.com" } : undefined);
  });
});
