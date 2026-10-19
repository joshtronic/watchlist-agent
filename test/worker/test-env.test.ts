import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("test environment", () => {
	it("uses fake secrets instead of .dev.vars", () => {
		expect(env.ALPACA_API_KEY).toBe("test-alpaca-key");
		expect(env.ALPACA_SECRET_KEY).toBe("test-alpaca-secret");
		expect(env.TURNSTILE_SECRET_KEY).toBe("test-turnstile-secret");
	});
});
