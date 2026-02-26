import { describe, test, expect } from "bun:test";
import { normalizePath } from "../../src/utils/normalize-path";

describe("normalizePath", () => {
  test("strips leading slash", () => {
    expect(normalizePath("/sign-out")).toBe("sign-out");
  });

  test("converts nested path to colon-separated action", () => {
    expect(normalizePath("/sign-in/email")).toBe("sign-in:email");
  });

  test("handles three-level paths", () => {
    expect(normalizePath("/two-factor/totp/verify")).toBe(
      "two-factor:totp:verify",
    );
  });

  test("leaves already-normalised strings unchanged", () => {
    expect(normalizePath("sign-out")).toBe("sign-out");
  });
});
