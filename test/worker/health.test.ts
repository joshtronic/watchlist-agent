import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";

function get(path: string, overrides: Partial<Env> = {}) {
	return worker.fetch(new Request(`https://watchlist.test${path}`), {
		...env,
		...overrides,
	});
}

describe("GET /api/health", () => {
	it("reports ok with the deployed commit", async () => {
		const res = await get("/api/health", { GIT_COMMIT: "abc123" });

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(await res.json()).toEqual({ ok: true, commit: "abc123" });
	});

	it("reports an unknown commit when none was injected", async () => {
		const res = await get("/api/health", { GIT_COMMIT: "" });

		expect(await res.json()).toEqual({ ok: true, commit: "unknown" });
	});

	it("is served by the configured worker", async () => {
		const res = await exports.default.fetch(
			"https://watchlist.test/api/health",
		);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, commit: "unknown" });
	});
});

describe("unknown API routes", () => {
	it("return 404", async () => {
		const res = await get("/api/nope");

		expect(res.status).toBe(404);
	});
});
