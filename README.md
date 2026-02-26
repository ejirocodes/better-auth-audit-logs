# better-auth-audit-log

An audit log plugin for [Better Auth](https://better-auth.com). Captures auth lifecycle events (sign-in, sign-up, sign-out, password changes, and more), stores structured log entries, and exposes query endpoints — with support for PII redaction, custom storage backends, and a manual insertion escape hatch for non-auth events.

## Installation

```bash
bun add better-auth-audit-log
```

## Quick start

```ts
import { betterAuth } from "better-auth";
import { auditLog } from "better-auth-audit-log";

export const auth = betterAuth({
  plugins: [
    auditLog(),
  ],
});
```

That's it. The plugin automatically logs every auth event to your existing Better Auth database.

## Options

```ts
auditLog({
  // Set to false to disable all logging without removing the plugin
  enabled: true,

  // Fire-and-forget mode — log writes never block the auth response
  nonBlocking: false,

  // Restrict logging to specific paths only.
  // When empty (default), all POST paths are captured.
  paths: [
    "/sign-in/email",
    "/sign-up/email",
    { path: "/change-password", config: { severity: "high" } },
  ],

  // PII redaction applied to request body snapshots in metadata
  piiRedaction: {
    enabled: true,
    strategy: "mask",   // "mask" | "hash" | "remove"
    fields: ["password", "token", "secret"], // defaults to a safe list
  },

  // Control what is captured per log entry
  capture: {
    ipAddress: true,    // default true
    userAgent: true,    // default true
    requestBody: false, // default false — body snapshot in metadata
  },

  // Retention config — use deleteOlderThan() or the storage adapter's own cleanup
  retention: {
    enabled: true,
    days: 90,
  },

  // Intercept every entry before it is written.
  // Return null to suppress the entry, or return a modified entry.
  beforeLog: async (entry) => {
    if (entry.action === "sign-in:email" && entry.userId === "bot-user-id") {
      return null; // drop it
    }
    return entry;
  },

  // Called after each entry is successfully written.
  afterLog: async (entry) => {
    await myAlertingService.emit(entry);
  },

  // Override the DB table name or column names (useful for existing schemas)
  schema: {
    auditLog: {
      modelName: "audit_events",
      fields: {
        userId: "user_id",
        createdAt: "created_at",
      },
    },
  },
})
```

## Custom storage

Pass any object that satisfies `AuditLogStorage` to route log writes to an alternative backend (webhook, ClickHouse, external SIEM, etc.).

```ts
import { auditLog, type AuditLogStorage, type AuditLogEntry } from "better-auth-audit-log";

const myStorage: AuditLogStorage = {
  async write(entry: AuditLogEntry) {
    await fetch("https://logs.example.com/ingest", {
      method: "POST",
      body: JSON.stringify(entry),
    });
  },
};

auditLog({ storage: myStorage })
```

When `storage` is set, the plugin does **not** write to the Better Auth database and the `auditLog` table is not queried by the built-in endpoints either. Implement the optional `read` and `readById` methods on your storage object to make the query endpoints work.

### MemoryStorage (testing)

A built-in in-memory storage class — useful for unit tests where no real database is available.

```ts
import { auditLog, MemoryStorage } from "better-auth-audit-log";

const storage = new MemoryStorage();

const auth = betterAuth({
  plugins: [auditLog({ storage })],
});

// Inspect captured entries directly
console.log(storage.entries);
```

## API endpoints

The plugin registers three endpoints under `/audit-log/`:

| Endpoint | Method | Description |
|---|---|---|
| `/audit-log/list` | GET | Paginated list of entries for the authenticated user |
| `/audit-log/:id` | GET | Single entry by ID |
| `/audit-log/insert` | POST | Manually insert a custom event (escape hatch) |

All endpoints require an active session.

### Query parameters — `/audit-log/list`

| Parameter | Type | Description |
|---|---|---|
| `userId` | string | Filter by user (must match session user in v1) |
| `action` | string | Exact action match, e.g. `sign-in:email` |
| `status` | `success` \| `failed` | Filter by outcome |
| `from` | ISO date string | Entries on or after this date |
| `to` | ISO date string | Entries on or before this date |
| `limit` | number | Max results (1–500, default 50) |
| `offset` | number | Pagination offset (default 0) |

### Manual insert — `/audit-log/insert`

Log a custom event from outside the auth flow (e.g. an admin updating a sensitive table):

```ts
await authClient.auditLog.insertAuditLog({
  action: "admin:user-export",
  status: "success",
  severity: "high",
  metadata: { exportedCount: 500 },
});
```

## Client plugin

Add `auditLogClient` to your Better Auth client to get typed access to the query endpoints.

```ts
import { createAuthClient } from "better-auth/client";
import { auditLogClient } from "better-auth-audit-log/client";

const authClient = createAuthClient({
  plugins: [auditLogClient()],
});

// Fully typed
const { data } = await authClient.auditLog.listAuditLogs({
  query: { limit: 20, status: "failed" },
});
```

## Logged events

The plugin captures all POST requests by default. Key events and their before/after timing:

| Event | Path | Hook timing | Notes |
|---|---|---|---|
| Sign in (email) | `/sign-in/email` | after | `userId` null on failed attempt |
| Sign in (social) | `/sign-in/social` | after | |
| Sign up | `/sign-up/email` | after | |
| Password change | `/change-password` | after | |
| Password reset | `/reset-password` | after | |
| Email change | `/change-email` | after | |
| Two-factor events | `/two-factor/*` | after | |
| OAuth callback | `/oauth/callback` | after | |
| **Sign out** | `/sign-out` | **before** | Session read before destruction |
| **Delete user** | `/delete-user` | **before** | Session read before destruction |
| **Revoke session** | `/revoke-session` | **before** | Session read before destruction |
| **Revoke all sessions** | `/revoke-sessions` | **before** | Session read before destruction |

## Log entry shape

```ts
interface AuditLogEntry {
  id: string;
  userId: string | null;      // null for failed pre-auth attempts
  action: string;             // e.g. "sign-in:email", "sign-out"
  status: "success" | "failed";
  severity: "low" | "medium" | "high" | "critical";
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}
```

Severity is auto-inferred from the action and outcome:

| Pattern | Default severity |
|---|---|
| `ban-user`, `impersonate-user` | critical |
| `delete-user`, `revoke-sessions` | high |
| Failed sign-in | high |
| `sign-in`, `sign-out`, `two-factor` | medium |
| Everything else | low |

Override per-path via `paths: [{ path: "/...", config: { severity: "critical" } }]`.

## Database schema

The plugin registers an `auditLog` table through Better Auth's schema system. Run the Better Auth CLI to apply it:

```bash
bunx @better-auth/cli generate
```

| Column | Type | Notes |
|---|---|---|
| `id` | string | Auto-generated primary key |
| `userId` | string \| null | FK → user(id), ON DELETE SET NULL |
| `action` | string | Indexed |
| `status` | string | |
| `severity` | string | |
| `ipAddress` | string \| null | |
| `userAgent` | string \| null | Excluded from API responses |
| `metadata` | string | Stored as JSON string |
| `createdAt` | date | Indexed |

## Development

```bash
bun install
bun run check      # typecheck + tests
bun run typecheck  # tsc --noEmit only
bun test           # tests only
```
