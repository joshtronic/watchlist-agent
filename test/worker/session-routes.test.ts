import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/worker/index";
import { newSessionId } from "../../src/worker/session-cookie";

const DAY_MS = 24 * 60 * 60 * 1000;
const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

afterEach(() => {
	vi.restoreAllMocks();
});

function call(
	method: string,
	path: string,
	init: { cookie?: string; body?: unknown; ip?: string } = {},
) {
	const headers = new Headers();
	if (init.cookie) headers.set("cookie", init.cookie);
	if (init.ip) headers.set("cf-connecting-ip", init.ip);
	if (init.body !== undefined) headers.set("content-type", "application/json");

	return worker.fetch(
		new Request(`https://watchlist.test${path}`, {
			method,
			headers,
			body:
				init.body === undefined
					? null
					: typeof init.body === "string"
						? init.body
						: JSON.stringify(init.body),
		}),
		env,
	);
}

function sessionStub(id: string) {
	return env.SESSION.get(env.SESSION.idFromName(id));
}

async function existingSession(createdAt = Date.now()) {
	const id = newSessionId();
	await sessionStub(id).create(createdAt);
	return id;
}

function mockSiteverify(body: unknown, status = 200) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () => Response.json(body, { status }));
}

function cookieValue(res: Response): string | undefined {
	return res.headers.get("set-cookie")?.match(/^wl_session=([^;]*)/)?.[1];
}

const validBody = { turnstileToken: "token", acceptedDisclaimer: true };

describe("POST /api/session", () => {
	it("creates a session and sets the cookie once both checks pass", async () => {
		mockSiteverify({ success: true });
		const before = Date.now();

		const res = await call("POST", "/api/session", { body: validBody });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ watchlist: [] });

		const id = cookieValue(res);
		expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=31536000");

		const session = await sessionStub(id ?? "").get();
		expect(session?.disclaimerAcceptedAt).toBeGreaterThanOrEqual(before);
	});

	it("verifies the Turnstile token with the secret and client IP", async () => {
		const fetchSpy = mockSiteverify({ success: true });

		await call("POST", "/api/session", {
			body: validBody,
			ip: "203.0.113.7",
		});

		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(String(url)).toBe(SITEVERIFY_URL);
		expect(JSON.parse(String(init?.body))).toEqual({
			secret: "test-turnstile-secret",
			response: "token",
			remoteip: "203.0.113.7",
		});
	});

	it.each([
		["missing", { turnstileToken: "token" }],
		["false", { turnstileToken: "token", acceptedDisclaimer: false }],
		["truthy but not true", { turnstileToken: "token", acceptedDisclaimer: 1 }],
	])(
		"rejects a disclaimer that is %s, without a cookie",
		async (_label, body) => {
			const fetchSpy = mockSiteverify({ success: true });

			const res = await call("POST", "/api/session", { body });

			expect(res.status).toBe(403);
			expect(await res.json()).toEqual({ error: "disclaimer_required" });
			expect(res.headers.has("set-cookie")).toBe(false);
			expect(fetchSpy).not.toHaveBeenCalled();
		},
	);

	it.each([
		["not JSON", "{nope"],
		["not an object", ["token", true]],
		["a non-string token", { turnstileToken: 42, acceptedDisclaimer: true }],
	])("rejects a body that is %s, without a cookie", async (_label, body) => {
		mockSiteverify({ success: true });

		const res = await call("POST", "/api/session", { body });

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "bad_request" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("rejects a failed Turnstile check, without a cookie", async () => {
		mockSiteverify({ success: false });

		const res = await call("POST", "/api/session", { body: validBody });

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "turnstile_failed" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("reports Turnstile being unavailable, without a cookie", async () => {
		mockSiteverify({}, 500);

		const res = await call("POST", "/api/session", { body: validBody });

		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "turnstile_unavailable" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});
});

describe("GET /api/session", () => {
	it("returns 401 without a cookie, and does not set one", async () => {
		const res = await call("GET", "/api/session");

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "no_session" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("returns 401 for a malformed cookie, and does not set one", async () => {
		const res = await call("GET", "/api/session", {
			cookie: "wl_session=garbage",
		});

		expect(res.status).toBe(401);
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("returns 401 for an unknown session and clears its cookie", async () => {
		const res = await call("GET", "/api/session", {
			cookie: `wl_session=${newSessionId()}`,
		});

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "no_session" });
		expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
	});

	it("returns the session state and records activity", async () => {
		const id = await existingSession();
		const before = Date.now();

		const res = await call("GET", "/api/session", {
			cookie: `wl_session=${id}`,
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ watchlist: [] });
		const session = await sessionStub(id).get();
		expect(session?.lastActive).toBeGreaterThanOrEqual(before);
	});

	it("returns the stored watchlist", async () => {
		const id = await existingSession();
		await sessionStub(id).addSymbols(["NET", "QQQ"]);

		const res = await call("GET", "/api/session", {
			cookie: `wl_session=${id}`,
		});

		expect(await res.json()).toEqual({ watchlist: ["NET", "QQQ"] });
	});

	it("does not re-issue a cookie issued within the last day", async () => {
		const id = await existingSession();

		const res = await call("GET", "/api/session", {
			cookie: `wl_session=${id}`,
		});

		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("re-issues the cookie once it is a day old", async () => {
		const id = await existingSession(Date.now() - 2 * DAY_MS);

		const res = await call("GET", "/api/session", {
			cookie: `wl_session=${id}`,
		});

		expect(cookieValue(res)).toBe(id);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=31536000");
	});
});

describe("DELETE /api/session", () => {
	it("destroys the session and clears the cookie", async () => {
		const id = await existingSession();

		const res = await call("DELETE", "/api/session", {
			cookie: `wl_session=${id}`,
		});

		expect(res.status).toBe(204);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(await sessionStub(id).get()).toBeNull();
	});

	it("succeeds without a session, so logout is always safe", async () => {
		const res = await call("DELETE", "/api/session");

		expect(res.status).toBe(204);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
	});
});

describe("cookie hygiene", () => {
	it("never sets a cookie on the health check", async () => {
		const res = await call("GET", "/api/health");

		expect(res.headers.has("set-cookie")).toBe(false);
	});
});
