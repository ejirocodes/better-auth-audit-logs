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

  // only needed with tamperDetection enabled
  hash         String?
  previousHash String?

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
  // only needed with tamperDetection enabled
  hash: text("hash"),
  previousHash: text("previousHash"),
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
  createdAt: Date,
  hash: String | null,         // only with tamperDetection enabled
  previousHash: String | null
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
    enabled: false,          // delete old entries as auth traffic comes in
    days: 90,                // delete entries older than N days
    intervalMs: 86_400_000,  // minimum gap between cleanups (default 24h)
  },

  tamperDetection: {
    enabled: false,          // sign each entry into a hash chain
    scope: "user",           // "user" (one chain per user) | "global" (one chain for everything)
    secret: undefined,       // defaults to a key derived from Better Auth's secret
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

## Retention

With `retention.enabled`, the plugin deletes entries older than `retention.days` while it writes new ones. The cleanup is throttled to one run per `intervalMs` per process (24 hours by default), runs in the background, and never blocks or fails an auth request — a failed cleanup is logged and retried on the next sweep.

Because the sweep rides on auth traffic, an instance that receives no auth requests never cleans up. Call `deleteExpiredAuditLogs` from your own scheduler when you need cleanup on a fixed cadence, or when you would rather keep it off the request path entirely:

```ts
import { deleteExpiredAuditLogs } from "better-auth-audit-logs";

const deleted = await deleteExpiredAuditLogs(await auth.$context, { days: 90 });
```

Pass `modelName` if you renamed the table, and `storage` if you use a custom backend:

```ts
await deleteExpiredAuditLogs(await auth.$context, {
  days: 90,
  modelName: "audit_trail",
  storage: clickhouse,
});
```

A custom storage backend must implement `deleteOlderThan(date)` before retention can be enabled — the plugin throws at startup otherwise, rather than silently keeping logs forever.

Cleanup issues a single unbounded `DELETE` over everything past the cutoff. If you are enabling retention on a table that has been accumulating for a long time, run `deleteExpiredAuditLogs` once from a script before turning on the automatic sweep, so the first large delete does not land alongside a live request.

## Tamper evidence

A compliance audit (SOC 2, HIPAA) asks you to prove an audit trail is complete and unmodified. With `tamperDetection.enabled`, every entry is signed with HMAC-SHA256 over its own fields plus the signature of the entry written before it. Editing a row invalidates its own signature; deleting one breaks the link its successor holds.

```ts
auditLog({
  tamperDetection: {
    enabled: true,
    scope: "user",
    secret: process.env.AUDIT_CHAIN_SECRET,
  },
})
```

Enabling it adds two nullable columns, `hash` and `previousHash` — re-run `npx @better-auth/cli generate`. Entries written before you turned it on keep a null `hash`, and verification counts them as `unchained` rather than failing on them.

### Verifying

```ts
import { verifyAuditLogChain } from "better-auth-audit-logs";

const report = await verifyAuditLogChain(await auth.$context);

if (!report.ok) {
  await alerting.page("audit log integrity check failed", report.findings);
}
```

```ts
{
  ok: true,            // false only for `modified` or `orphaned` findings
  chains: 412,         // chains covered — one per user under `scope: "user"`
  entriesChecked: 9_120,
  unchained: 300,      // entries written before tamper detection was enabled
  findings: [],
}
```

Each finding carries the entry it was raised on and the predecessor it expected:

| `type` | Meaning |
|---|---|
| `modified` | The entry's contents no longer match its signature. Tampering. |
| `orphaned` | An entry has been removed from the middle of a chain. Tampering. |
| `truncated` | The oldest entry in range links further back — what retention or a `from` bound leaves behind. Not a failure. |
| `forked` | Two entries claim the same predecessor. Concurrent writers, not tampering. Not a failure. |

Pass `from`/`to` to bound a run, `userId` to check one user, `storage` and `modelName` to match your `auditLog()` config, and `scope` to match the scope you write with. Verification loads the range into memory, so bound it on large tables.

### What it protects against

The signature is keyed, not a bare SHA-256 hash, and the key lives in your app's environment rather than in the database. That is the whole point: an attacker who reaches only the database — a stolen dump, SQL injection, a rogue DBA — cannot recompute a valid signature, so they cannot rewrite history undetected. A bare hash chain would let them re-hash the entries they touched and leave the chain intact.

Chain structure proves no entry was altered or removed from the middle of a chain. It cannot prove the trail was not cut short at the head — deleting the newest entries leaves a shorter chain that still verifies. Nor does it defend against anyone holding the app's secret or running code in the app process. Closing either gap requires the trail to leave the database: forward entries to append-only storage from `afterLog`, or publish the chain head on a schedule somewhere you do not control.

The key is derived from Better Auth's `secret` with a domain separator, so it cannot be used to forge anything else that secret signs. Set `tamperDetection.secret` to key the chain independently — rotating it invalidates every existing signature, so treat it as permanent.

### Concurrency

Each write reads its chain's head before signing. Writes to the same chain are serialized inside a process, so a single instance never forks. Across instances two writers can read the same head and produce a `forked` pair — real, but not evidence of tampering, and it never hides a `modified` finding. `scope: "user"` is the default because a single user's requests rarely land on two instances at once; `scope: "global"` gives one continuous chain and forks under any concurrency.

### Retention and user deletion

Both rewrite history by design, and verification sees them:

- **Retention** trims the oldest entries, so the surviving chain start reports as `truncated`. A deletion of only the very oldest entries is indistinguishable from that, and reports the same way.
- **Deleting a user** sets `userId` to null on their entries (`ON DELETE SET NULL`), which changes signed content and reports as `modified`. If you need erasure alongside tamper evidence, pseudonymize `userId` in `beforeLog` at write time so there is nothing to null out later.

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
  // Required by tamperDetection — entries newest first
  async readChain(options) { /* ... */ },
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
- **Failed sign-ins have `userId: null`** — the user isn't authenticated yet, so there's no session to pull from. Under `scope: "user"` they share one chain, so a credential-stuffing burst is still covered by tamper evidence.

## Recommended production config

```ts
auditLog({
  nonBlocking: true,
  piiRedaction: { enabled: true, strategy: "hash" },
  retention: { enabled: true, days: 90 },
  tamperDetection: { enabled: true },
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
