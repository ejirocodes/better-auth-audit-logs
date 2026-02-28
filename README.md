# better-auth-audit-logs

[![npm version](https://img.shields.io/npm/v/better-auth-audit-logs)](https://www.npmjs.com/package/better-auth-audit-logs)
[![npm downloads](https://img.shields.io/npm/dm/better-auth-audit-logs)](https://www.npmjs.com/package/better-auth-audit-logs)
[![license](https://img.shields.io/npm/l/better-auth-audit-logs)](https://github.com/ejirocodes/better-auth-audit-logs/blob/main/LICENSE)

Audit log plugin for [Better Auth](https://better-auth.com). Captures auth lifecycle events, stores structured log entries with IP and user agent, and exposes query endpoints — with PII redaction, custom storage backends, and a manual insertion escape hatch.

## Requirements

- `better-auth >= 1.0.0`
- `typescript >= 5.0`

## Installation

```bash
# npm
npm install better-auth-audit-logs

# pnpm
pnpm add better-auth-audit-logs

# yarn
yarn add better-auth-audit-logs

# bun
bun add better-auth-audit-logs
```

## Setup

### 1. Add the plugin to your auth config

```ts
import { betterAuth } from "better-auth";
import { auditLog } from "better-auth-audit-logs";

export const auth = betterAuth({
  // ...
  plugins: [auditLog()],
});
```

### 2. Generate and run the migration

```bash
npx @better-auth/cli generate
```

This adds an `audit_log` table to your database. All columns are indexed for efficient querying.

### 3. Add the client plugin (optional)

```ts
import { createAuthClient } from "better-auth/client";
import { auditLogClient } from "better-auth-audit-logs/client";

export const authClient = createAuthClient({
  plugins: [auditLogClient()],
});
```

## What gets logged

All auth `POST` endpoints are captured by default. Destructive events (where session data would be lost after execution) use a `before` hook — all others use `after`.

| Event | Path | Notes |
|---|---|---|
| Sign in | `/sign-in/email`, `/sign-in/social` | `userId` is `null` on failed attempts |
| Sign up | `/sign-up/email` | |
| Change password | `/change-password` | |
| Reset password | `/reset-password` | |
| Change email | `/change-email` | |
| Two-factor | `/two-factor/*` | |
| OAuth callback | `/oauth/callback` | |
| Sign out | `/sign-out` | Logged **before** session is destroyed |
| Delete account | `/delete-user` | Logged **before** session is destroyed |
| Revoke session | `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions` | Logged **before** session is destroyed |

Severity is inferred automatically:

| Pattern | Severity |
|---|---|
| `ban-user`, `impersonate-user` | `critical` |
| `delete-user`, `revoke-sessions` | `high` |
| Failed sign-in | `high` |
| `sign-in`, `sign-out`, `two-factor` | `medium` |
| Everything else | `low` |

Override severity per-path via the `paths` option.

## Configuration

All options are optional — defaults are listed below.

```ts
auditLog({
  enabled: true,
  nonBlocking: false,
  paths: [],              // empty = capture all POST paths
  piiRedaction: {
    enabled: false,
    strategy: "mask",     // "mask" | "hash" | "remove"
    fields: [],           // see default field list below
  },
  capture: {
    ipAddress: true,
    userAgent: true,
    requestBody: false,
  },
  retention: undefined,   // no automatic cleanup by default
  beforeLog: undefined,
  afterLog: undefined,
  storage: undefined,     // uses Better Auth's database by default
  schema: undefined,
})
```

### Options reference

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Set to `false` to disable all logging without removing the plugin |
| `nonBlocking` | `boolean` | `false` | Fire-and-forget — log writes never block the auth response |
| `paths` | `(string \| PathConfig)[]` | `[]` | Restrict logging to specific paths. Empty captures all |
| `piiRedaction.enabled` | `boolean` | `false` | Redact sensitive fields from request body snapshots |
| `piiRedaction.strategy` | `"mask" \| "hash" \| "remove"` | `"mask"` | How to redact matched fields |
| `piiRedaction.fields` | `string[]` | see below | Fields to redact |
| `capture.ipAddress` | `boolean` | `true` | Capture client IP address |
| `capture.userAgent` | `boolean` | `true` | Capture `User-Agent` header |
| `capture.requestBody` | `boolean` | `false` | Include request body snapshot in `metadata` |
| `retention.enabled` | `boolean` | — | Enable scheduled cleanup |
| `retention.days` | `number` | — | Delete entries older than N days |
| `beforeLog` | `function` | — | Intercept entries before write. Return `null` to suppress |
| `afterLog` | `function` | — | Called after each successful write |
| `storage` | `AuditLogStorage` | — | Custom storage backend |
| `schema.auditLog.modelName` | `string` | `"audit_log"` | Override the DB table name |
| `schema.auditLog.fields` | `Record<string, string>` | — | Rename individual columns |

### Path-level config

Restrict and customise logging per endpoint:

```ts
auditLog({
  paths: [
    "/sign-in/email",
    "/sign-up/email",
    { path: "/change-password", config: { severity: "high" } },
    { path: "/delete-user", config: { capture: { requestBody: true } } },
  ],
})
```

### PII redaction

When `requestBody` capture is enabled, sensitive fields are redacted before storage. Default fields:

```
password, newPassword, token, secret, apiKey, refreshToken, accessToken, code, backupCode, otp
```

```ts
auditLog({
  capture: { requestBody: true },
  piiRedaction: {
    enabled: true,
    strategy: "hash",           // SHA-256 via Web Crypto
    fields: ["password", "ssn", "creditCard"],
  },
})
```

Strategies: `"mask"` replaces with `***`, `"hash"` replaces with a SHA-256 hex digest, `"remove"` deletes the key entirely.

### `beforeLog` / `afterLog`

```ts
auditLog({
  // Drop entries or modify them before write
  beforeLog: async (entry) => {
    if (entry.userId === "service-account-id") return null;
    return entry;
  },

  // Forward to an external system after write
  afterLog: async (entry) => {
    await analytics.track("auth.event", entry);
  },
})
```

### Custom table name

```ts
auditLog({
  schema: {
    auditLog: {
      modelName: "auth_events",   // maps to auth_events table in DB
    },
  },
})
```

## Custom storage

Route log writes to any external backend by implementing `AuditLogStorage`:

```ts
import { auditLog, type AuditLogStorage } from "better-auth-audit-logs";

const clickhouse: AuditLogStorage = {
  async write(entry) {
    await fetch("https://ch.example.com/insert", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },

  // Optional — enables the built-in query endpoints to work
  async read(options) {
    const rows = await ch.query({ ...options });
    return { entries: rows, total: rows.length };
  },
  async readById(id) {
    return await ch.queryOne({ id });
  },
};

auditLog({ storage: clickhouse })
```

When `storage` is set, the plugin does **not** write to the Better Auth database. The built-in query endpoints (`/audit-log/list`, `/audit-log/:id`) will only work if you implement the optional `read` and `readById` methods.

### MemoryStorage (testing)

An in-memory adapter included for unit tests:

```ts
import { betterAuth } from "better-auth";
import { auditLog, MemoryStorage } from "better-auth-audit-logs";

const storage = new MemoryStorage();

const auth = betterAuth({
  plugins: [auditLog({ storage })],
});

// Assert captured entries in tests
expect(storage.entries).toHaveLength(1);
expect(storage.entries[0].action).toBe("sign-in:email");
```

## API reference

Three endpoints are registered under `/audit-log/`. All require an active session.

| Endpoint | Method | Description |
|---|---|---|
| `/audit-log/list` | `GET` | Paginated entries for the authenticated user |
| `/audit-log/:id` | `GET` | Single entry by ID |
| `/audit-log/insert` | `POST` | Manually insert a custom event |

Rate limit: 60 requests / 60 seconds per user.

### Query parameters — `GET /audit-log/list`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `userId` | `string` | session user | Filter by user ID |
| `action` | `string` | — | Exact match, e.g. `sign-in:email` |
| `status` | `"success" \| "failed"` | — | Filter by outcome |
| `from` | ISO date string | — | Entries on or after this date |
| `to` | ISO date string | — | Entries on or before this date |
| `limit` | `number` | `50` | Max results (1–500) |
| `offset` | `number` | `0` | Pagination offset |

### Manual insert — `POST /audit-log/insert`

Log events that originate outside the auth flow (e.g. admin actions, sensitive data exports):

```ts
await authClient.auditLog.insertAuditLog({
  action: "admin:user-export",
  status: "success",
  severity: "high",
  metadata: { exportedCount: 500, requestedBy: "admin@example.com" },
});
```

### Querying via client

```ts
// List recent failed sign-ins
const { data } = await authClient.auditLog.listAuditLogs({
  query: { status: "failed", limit: 20 },
});

// Single entry
const { data: entry } = await authClient.auditLog.getAuditLog({
  params: { id: "log-entry-id" },
});
```

## TypeScript types

```ts
import type {
  AuditLogEntry,
  AuditLogStorage,
  AuditLogOptions,
  StorageReadOptions,
  StorageReadResult,
} from "better-auth-audit-logs";

interface AuditLogEntry {
  id: string;
  userId: string | null;       // null for failed pre-auth attempts
  action: string;              // e.g. "sign-in:email", "sign-out"
  status: "success" | "failed";
  severity: "low" | "medium" | "high" | "critical";
  ipAddress: string | null;
  userAgent: string | null;    // excluded from API responses by default
  metadata: Record<string, unknown>;
  createdAt: Date;
}
```

## Database schema

| Column | Type | Notes |
|---|---|---|
| `id` | string | Primary key |
| `userId` | string \| null | FK → `user(id)`, `ON DELETE SET NULL` |
| `action` | string | Indexed |
| `status` | string | |
| `severity` | string | |
| `ipAddress` | string \| null | |
| `userAgent` | string \| null | Not returned in API responses |
| `metadata` | string | Stored as JSON |
| `createdAt` | date | Indexed |

Audit log entries survive user deletion (`ON DELETE SET NULL` on `userId`). This is intentional — deleting a user should not erase the audit trail.

## Production

Recommended config for production deployments:

```ts
auditLog({
  nonBlocking: true,        // never add latency to auth responses
  piiRedaction: {
    enabled: true,
    strategy: "hash",       // pseudonymise rather than mask
  },
  capture: {
    requestBody: false,     // only enable if you need body snapshots
  },
  retention: {
    enabled: true,
    days: 90,               // comply with your data retention policy
  },
  afterLog: async (entry) => {
    // Forward high-severity events to your alerting system
    if (entry.severity === "critical" || entry.severity === "high") {
      await alerting.emit(entry);
    }
  },
})
```

## Acknowledgments

This plugin was inspired by and builds upon the audit log design shared by [@Re4GD](https://github.com/Re4GD) in [better-auth/better-auth#1184](https://github.com/better-auth/better-auth/issues/1184). Key ideas such as the plugin configuration shape, `nonBlocking` mode, `PathConfig` types, path normalization (`/sign-in/email` to `sign-in:email`), and several other design decisions originated from their work. Thank you for the foundational contribution.

Additional inspiration and prior art from the community:

- [@issamwahbi](https://github.com/issamwahbi) — [Add Support for Audit Logs](https://github.com/better-auth/better-auth/discussions/3592), an early discussion on building an audit log plugin with before/after hook patterns for capturing session-destructive events.
- [@ItsProless](https://github.com/ItsProless) — [RFC: Audit Log plugin (SOC 2 / ISO 27001)?](https://github.com/better-auth/better-auth/discussions/7952), a detailed RFC proposing standardized audit metadata, storage-agnostic adapters, PII redaction, and compliance-oriented event schemas.

## License

[MIT](./LICENSE)
