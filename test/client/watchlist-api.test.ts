import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStarter } from "../../src/client/watchlist-api";

function mockFetch(response: Response | Error) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () =>
			response instanceof Error ? Promise.reject(response) : response,
		);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("applyStarter", () => {
	it("posts to the starter endpoint and returns the watchlist", async () => {
		const spy = mockFetch(Response.json({ watchlist: ["NVDA", "AAPL"] }));

		expect(await applyStarter()).toEqual(["NVDA", "AAPL"]);
		const [url, init] = spy.mock.calls[0] ?? [];
		expect(String(url)).toBe("/api/watchlist/starter");
		expect(init?.method).toBe("POST");
	});

	it("returns null when the server refuses", async () => {
		mockFetch(Response.json({ error: "watchlist_not_empty" }, { status: 409 }));

		expect(await applyStarter()).toBeNull();
	});

	it("returns null when the request fails", async () => {
		mockFetch(new TypeError("Failed to fetch"));

		expect(await applyStarter()).toBeNull();
	});
});
