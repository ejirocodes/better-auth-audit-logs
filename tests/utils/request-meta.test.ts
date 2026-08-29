import { describe, test, expect } from "bun:test";
import type { BetterAuthOptions } from "better-auth";
import { extractRequestMeta } from "../../src/utils/request-meta";
import { buildLogEntry } from "../../src/internal";
import type { ResolvedOptions } from "../../src/types";

const defaultOptions: BetterAuthOptions = {};

const requestWith = (headers: Record<string, string>) =>
  new Request("https://example.com/sign-in", { headers });

describe("extractRequestMeta", () => {
  test("resolves the client IP from a Request", () => {
    const meta = extractRequestMeta(
      requestWith({ "x-forwarded-for": "203.0.113.9" }),
      new Headers(),
      defaultOptions,
    );

    expect(meta.ipAddress).toBe("203.0.113.9");
  });

  test("resolves the client IP from bare headers", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });

    const meta = extractRequestMeta(headers, headers, defaultOptions);

    expect(meta.ipAddress).toBe("203.0.113.9");
  });

  test("returns a null IP when no source is supplied", () => {
    const meta = extractRequestMeta(
      undefined,
      new Headers({ "x-forwarded-for": "203.0.113.9" }),
      defaultOptions,
    );

    expect(meta.ipAddress).toBeNull();
  });

  test("honors disableIpTracking", () => {
    const meta = extractRequestMeta(
      requestWith({ "x-forwarded-for": "203.0.113.9" }),
      new Headers(),
      { advanced: { ipAddress: { disableIpTracking: true } } },
    );

    expect(meta.ipAddress).toBeNull();
  });

  test("honors custom ipAddressHeaders", () => {
    const meta = extractRequestMeta(
      requestWith({
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.9",
      }),
      new Headers(),
      { advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } } },
    );

    expect(meta.ipAddress).toBe("198.51.100.7");
  });

  test("reads the user agent from headers", () => {
    const meta = extractRequestMeta(
      undefined,
      new Headers({ "user-agent": "Mozilla/5.0" }),
      defaultOptions,
    );

    expect(meta.userAgent).toBe("Mozilla/5.0");
  });

  test("returns a null user agent when headers are absent", () => {
    const meta = extractRequestMeta(undefined, undefined, defaultOptions);

    expect(meta.userAgent).toBeNull();
  });
});

describe("buildLogEntry IP capture", () => {
  const headersWithIp = () =>
    new Headers({
      "x-forwarded-for": "203.0.113.9",
      "user-agent": "Mozilla/5.0",
    });

  const optionsWithCapture = (ipAddress: boolean) =>
    ({
      capture: { ipAddress, userAgent: true, requestBody: false },
      piiRedaction: { enabled: false, strategy: "redact" },
    }) as unknown as ResolvedOptions;

  test("resolves the IP from headers when no request is present", async () => {
    const entry = await buildLogEntry("/sign-in/email", "success", {
      userId: null,
      request: undefined,
      headers: headersWithIp(),
      options: optionsWithCapture(true),
      authOptions: {},
    });

    expect(entry.ipAddress).toBe("203.0.113.9");
  });

  test("captures no IP when capture.ipAddress is disabled", async () => {
    const entry = await buildLogEntry("/sign-in/email", "success", {
      userId: null,
      request: undefined,
      headers: headersWithIp(),
      options: optionsWithCapture(false),
      authOptions: {},
    });

    expect(entry.ipAddress).toBeNull();
    expect(entry.userAgent).toBe("Mozilla/5.0");
  });
});
