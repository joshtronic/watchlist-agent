import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../../src/worker/turnstile";

const SITEVERIFY_URL =
	"https://challenges.cloudflare.com/turnstile/v0/siteverify";

function mockSiteverify(response: Response | Error) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () =>
			response instanceof Error ? Promise.reject(response) : response,
		);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
	it("posts the token, secret and client IP to siteverify", async () => {
		const fetchSpy = mockSiteverify(Response.json({ success: true }));

		await verifyTurnstile({
			token: "client-token",
			secret: "server-secret",
			remoteIp: "203.0.113.7",
		});

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(String(url)).toBe(SITEVERIFY_URL);
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			secret: "server-secret",
			response: "client-token",
			remoteip: "203.0.113.7",
		});
	});

	it("omits the client IP when it is unknown", async () => {
		const fetchSpy = mockSiteverify(Response.json({ success: true }));

		await verifyTurnstile({ token: "t", secret: "s", remoteIp: null });

		const [, init] = fetchSpy.mock.calls[0] ?? [];
		expect(JSON.parse(String(init?.body))).toEqual({
			secret: "s",
			response: "t",
		});
	});

	it("passes when siteverify reports success", async () => {
		mockSiteverify(Response.json({ success: true }));

		const result = await verifyTurnstile({
			token: "t",
			secret: "s",
			remoteIp: null,
		});

		expect(result).toBe("passed");
	});

	it("fails when siteverify rejects the token", async () => {
		mockSiteverify(
			Response.json({
				success: false,
				"error-codes": ["invalid-input-response"],
			}),
		);

		const result = await verifyTurnstile({
			token: "t",
			secret: "s",
			remoteIp: null,
		});

		expect(result).toBe("failed");
	});

	it("fails an empty token without calling siteverify", async () => {
		const fetchSpy = mockSiteverify(Response.json({ success: true }));

		const result = await verifyTurnstile({
			token: "",
			secret: "s",
			remoteIp: null,
		});

		expect(result).toBe("failed");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it.each([
		["a network error", new TypeError("fetch failed")],
		["a server error", new Response("oops", { status: 500 })],
		["a non-JSON body", new Response("<html>", { status: 200 })],
	])("is unavailable on %s", async (_label, response) => {
		mockSiteverify(response);

		const result = await verifyTurnstile({
			token: "t",
			secret: "s",
			remoteIp: null,
		});

		expect(result).toBe("unavailable");
	});
});
