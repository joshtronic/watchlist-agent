import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createSession,
	getConfig,
	getSession,
	logout,
} from "../../src/client/session-api";

function mockFetch(response: Response | Error) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () =>
			response instanceof Error ? Promise.reject(response) : response,
		);
}

function lastRequest(spy: ReturnType<typeof mockFetch>) {
	const [url, init] = spy.mock.calls.at(-1) ?? [];
	return { url: String(url), init };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getConfig", () => {
	it("reads the Turnstile site key", async () => {
		const spy = mockFetch(Response.json({ turnstileSiteKey: "site-key" }));

		expect(await getConfig()).toEqual({ turnstileSiteKey: "site-key" });
		expect(lastRequest(spy).url).toBe("/api/config");
	});
});

describe("getSession", () => {
	it("is active with the watchlist when the session exists", async () => {
		const spy = mockFetch(Response.json({ watchlist: ["NET"] }));

		expect(await getSession()).toEqual({
			kind: "active",
			watchlist: ["NET"],
		});
		expect(lastRequest(spy).url).toBe("/api/session");
	});

	it("is anonymous on 401", async () => {
		mockFetch(Response.json({ error: "no_session" }, { status: 401 }));

		expect(await getSession()).toEqual({ kind: "anonymous" });
	});

	it("throws on any other failure", async () => {
		mockFetch(new Response("oops", { status: 500 }));

		await expect(getSession()).rejects.toThrow();
	});
});

describe("createSession", () => {
	it("posts the token and the disclaimer acceptance", async () => {
		const spy = mockFetch(Response.json({ watchlist: [] }));

		await createSession("turnstile-token");

		const { url, init } = lastRequest(spy);
		expect(url).toBe("/api/session");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("content-type")).toBe(
			"application/json",
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			turnstileToken: "turnstile-token",
			acceptedDisclaimer: true,
		});
	});

	it("returns the watchlist on success", async () => {
		mockFetch(Response.json({ watchlist: [] }));

		expect(await createSession("t")).toEqual({ ok: true, watchlist: [] });
	});

	it.each([
		["turnstile_failed", 403],
		["turnstile_unavailable", 503],
		["disclaimer_required", 403],
		["bad_request", 400],
	])("passes through the %s error", async (error, status) => {
		mockFetch(Response.json({ error }, { status }));

		expect(await createSession("t")).toEqual({ ok: false, error });
	});

	it("reports an unrecognised error body as unknown", async () => {
		mockFetch(new Response("<html>", { status: 502 }));

		expect(await createSession("t")).toEqual({ ok: false, error: "unknown" });
	});

	it("reports a network failure", async () => {
		mockFetch(new TypeError("Failed to fetch"));

		expect(await createSession("t")).toEqual({ ok: false, error: "network" });
	});
});

describe("logout", () => {
	it("deletes the session", async () => {
		const spy = mockFetch(new Response(null, { status: 204 }));

		expect(await logout()).toBe(true);
		const { url, init } = lastRequest(spy);
		expect(url).toBe("/api/session");
		expect(init?.method).toBe("DELETE");
	});

	it("reports failure when the request fails", async () => {
		mockFetch(new TypeError("Failed to fetch"));

		expect(await logout()).toBe(false);
	});
});
