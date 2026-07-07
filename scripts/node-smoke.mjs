// Node smoke test: verify the built package actually works on Node (not just Bun).
// Exercises both the ESM and CJS entry points — instantiates the plugin and
// round-trips an entry through MemoryStorage. Run against ./dist after building.
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);

async function exercise(mod, label) {
  const { auditLog, MemoryStorage } = mod;
  assert.equal(typeof auditLog, "function", `${label}: auditLog is not a function`);
  assert.equal(typeof MemoryStorage, "function", `${label}: MemoryStorage is not a constructor`);

  const plugin = auditLog();
  assert.equal(plugin.id, "audit-log", `${label}: unexpected plugin id`);
  assert.ok(plugin.schema?.auditLog, `${label}: plugin is missing the auditLog schema`);
  assert.ok(plugin.endpoints, `${label}: plugin is missing endpoints`);

  const storage = new MemoryStorage();
  const entry = {
    id: "smoke-1",
    userId: null,
    action: "sign-in:email",
    status: "success",
    severity: "info",
    ipAddress: null,
    userAgent: null,
    metadata: {},
    createdAt: new Date(),
  };
  await storage.write(entry);
  const result = await storage.read({ limit: 10, offset: 0 });
  assert.equal(result.entries.length, 1, `${label}: entry did not round-trip`);
  assert.equal(result.entries[0].id, "smoke-1", `${label}: wrong entry read back`);

  console.log(`${label}: ok`);
}

await exercise(await import("../dist/index.js"), "esm");
await exercise(require("../dist/index.cjs"), "cjs");

console.log("smoke: all checks passed");
