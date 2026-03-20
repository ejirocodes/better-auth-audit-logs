# better-auth-audit-logs

[![npm version](https://img.shields.io/npm/v/better-auth-audit-logs)](https://www.npmjs.com/package/better-auth-audit-logs)
[![npm downloads](https://img.shields.io/npm/dm/better-auth-audit-logs)](https://www.npmjs.com/package/better-auth-audit-logs)
[![license](https://img.shields.io/npm/l/better-auth-audit-logs)](https://github.com/ejirocodes/better-auth-audit-logs/blob/main/LICENSE)

Audit log plugin for [Better Auth](https://better-auth.com). Automatically captures auth events with IP, user agent, and severity — zero config required.

**Requires** `better-auth >= 1.0.0` and `typescript >= 5`.

## Quick start

```bash
npm install better-auth-audit-logs
```

```ts
import { betterAuth } from "better-auth";
import { auditLog } from "better-auth-audit-logs";

export const auth = betterAuth({
  plugins: [auditLog()],
});
```

Then generate and run the migration:

```bash
npx @better-auth/cli generate
```

That's it. All auth events are now logged automatically.

## Schema

The plugin adds an `auditLog` table. If you prefer to manage your schema manually, copy the relevant definition:

<details>
<summary>Prisma</summary>

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  action    String
  status    String
  severity  String
  ipAddress String?
  userAgent String?
  metadata  String?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("auditLog")
}
```

</details>

<details>
<summary>Drizzle</summary>

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema"; // your existing user table

export const auditLog = sqliteTable("auditLog", {
  id: text("id").primaryKey(),
  userId: text("userId").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  status: text("status").notNull(),
  severity: text("severity").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  metadata: text("metadata"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});
```

</details>

<details>
<summary>MongoDB</summary>

```ts
// Collection: auditLog
{
  _id: ObjectId,
  userId: String | null,       // references user collection
  action: String,              // e.g. "sign-in:email"
  status: String,              // "success" | "failed"
  severity: String,            // "low" | "medium" | "high" | "critical"
  ipAddress: String | null,
  userAgent: String | null,
  metadata: String | null,     // JSON string
  createdAt: Date
}

// Recommended indexes
db.auditLog.createIndex({ userId: 1 })
db.auditLog.createIndex({ action: 1 })
db.auditLog.createIndex({ createdAt: 1 })
```

</details>

## Client plugin

```ts
import { createAuthClient } from "better-auth/client";
import { auditLogClient } from "better-auth-audit-logs/client";

export const authClient = createAuthClient({
  plugins: [auditLogClient()],
});
```

```ts
// List recent failed sign-ins
const { data } = await authClient.auditLog.listAuditLogs({
  query: { status: "failed", limit: 20 },
});

// Single entry by ID
const { data: entry } = await authClient.auditLog.getAuditLog({
  params: { id: "log-entry-id" },
});

// Manually log custom events (admin actions, data exports, etc.)
await authClient.auditLog.insertAuditLog({
  action: "admin:user-export",
  status: "success",
  severity: "high",
  metadata: { exportedCount: 500 },
});
```

## What gets logged

All auth `POST` endpoints are captured by default:

| Event | Path | Hook |
|---|---|---|
| Sign in | `/sign-in/email`, `/sign-in/social` | after |
| Sign up | `/sign-up/email` | after |
| Change/reset password | `/change-password`, `/reset-password` | after |
| Change email | `/change-email` | after |
| Two-factor | `/two-factor/*` | after |
| OAuth callback | `/oauth/callback` | after |
| Sign out | `/sign-out` | **before** |
| Delete account | `/delete-user` | **before** |
| Revoke session | `/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions` | **before** |

"Before" hooks fire for destructive events where the session would be lost after execution.

Severity is inferred automatically (`critical` for ban/impersonate, `high` for delete/revoke/failed sign-in, `medium` for sign-in/out, `low` for everything else) and can be overridden per-path.

## Configuration

All options are optional:

```ts
auditLog({
  enabled: true,             // disable without removing the plugin
  nonBlocking: false,        // fire-and-forget — never blocks auth responses

  // restrict to specific paths (empty = capture all)
  paths: [
    "/sign-in/email",
    { path: "/delete-user", config: { severity: "high", capture: { requestBody: true } } },
  ],

  capture: {
    ipAddress: true,         // capture client IP
    userAgent: true,         // capture User-Agent header
    requestBody: false,      // include request body in metadata
  },

  piiRedaction: {
    enabled: false,          // redact sensitive fields when requestBody is captured
    strategy: "mask",        // "mask" (***) | "hash" (SHA-256) | "remove" (delete key)
    fields: ["password"],    // defaults: password, token, secret, apiKey, otp, etc.
  },

  retention: {
    enabled: false,          // enable scheduled cleanup
    days: 90,                // delete entries older than N days
  },

  // intercept before write — return null to suppress
  beforeLog: async (entry) => {
    if (entry.userId === "service-account") return null;
    return entry;
  },

  // called after each successful write
  afterLog: async (entry) => {
    await analytics.track("auth.event", entry);
  },

  storage: undefined,        // custom storage backend (see below)
})
```

To override the DB model name, pass `schema: { auditLog: { modelName: "your_table_name" } }`.

## Custom storage

Route writes to any external backend instead of Better Auth's database:

```ts
import { auditLog, type AuditLogStorage } from "better-auth-audit-logs";

const clickhouse: AuditLogStorage = {
  async write(entry) {
    await fetch("https://ch.example.com/insert", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },
  // Optional — enables the query endpoints to work with your backend
  async read(options) { /* ... */ },
  async readById(id) { /* ... */ },
};

auditLog({ storage: clickhouse })
```

A `MemoryStorage` adapter is included for testing:

```ts
import { auditLog, MemoryStorage } from "better-auth-audit-logs";

const storage = new MemoryStorage();
const auth = betterAuth({ plugins: [auditLog({ storage })] });

// assert in tests
expect(storage.entries).toHaveLength(1);
expect(storage.entries[0].action).toBe("sign-in:email");
```

## API endpoints

Three endpoints are registered under `/audit-log/`, all requiring an active session. Rate limited to 60 req/min.

| Endpoint | Method | Description |
|---|---|---|
| `/audit-log/list` | `GET` | Paginated entries |
| `/audit-log/:id` | `GET` | Single entry by ID |
| `/audit-log/insert` | `POST` | Manually insert a custom event |

**Query parameters** for `GET /audit-log/list`:

| Parameter | Type | Default |
|---|---|---|
| `userId` | `string` | session user |
| `action` | `string` | — |
| `status` | `"success" \| "failed"` | — |
| `from` | ISO date string | — |
| `to` | ISO date string | — |
| `limit` | `number` | `50` (max 500) |
| `offset` | `number` | `0` |

## Design decisions

- **Entries survive user deletion** — `userId` uses `ON DELETE SET NULL`. Deleting a user does not erase their audit trail.
- **`userAgent` is not returned in API responses** — stored for forensics but excluded from client queries by default.
- **Failed sign-ins have `userId: null`** — the user isn't authenticated yet, so there's no session to pull from.

## Recommended production config

```ts
auditLog({
  nonBlocking: true,
  piiRedaction: { enabled: true, strategy: "hash" },
  retention: { enabled: true, days: 90 },
  afterLog: async (entry) => {
    if (entry.severity === "critical" || entry.severity === "high") {
      await alerting.emit(entry);
    }
  },
})
```

## Acknowledgments

This plugin was inspired by the audit log design shared by [@Re4GD](https://github.com/Re4GD) in [better-auth/better-auth#1184](https://github.com/better-auth/better-auth/issues/1184). Additional inspiration from [@issamwahbi](https://github.com/issamwahbi) ([#3592](https://github.com/better-auth/better-auth/discussions/3592)) and [@ItsProless](https://github.com/ItsProless) ([#7952](https://github.com/better-auth/better-auth/discussions/7952)).

## License

[MIT](./LICENSE)
