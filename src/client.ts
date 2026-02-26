import type { BetterAuthClientPlugin } from "better-auth/client";
import type { auditLog } from "./plugin";

export const auditLogClient = () =>
  ({
    id: "audit-log",
    $InferServerPlugin: {} as ReturnType<typeof auditLog>,
    pathMethods: {
      "/audit-log/list": "GET",
      "/audit-log/:id": "GET",
      "/audit-log/insert": "POST",
    },
  }) satisfies BetterAuthClientPlugin;
