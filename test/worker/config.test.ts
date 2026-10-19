import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";

describe("GET /api/config", () => {
	it("exposes the public Turnstile site key, without a cookie", async () => {
		const res = await worker.fetch(
			new Request("https://watchlist.test/api/config"),
			env,
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			turnstileSiteKey: env.TURNSTILE_SITE_KEY,
		});
		expect(res.headers.has("set-cookie")).toBe(false);
	});
});
