import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../../src/client/transcribe-api";

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

describe("transcribeAudio", () => {
	it("posts the WAV and returns the transcript", async () => {
		const spy = mockFetch(Response.json({ text: "add Nvidia" }));
		const wav = new ArrayBuffer(8);

		expect(await transcribeAudio(wav)).toEqual({
			ok: true,
			text: "add Nvidia",
		});
		const [url, init] = spy.mock.calls[0] ?? [];
		expect(String(url)).toBe("/api/transcribe");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("content-type")).toBe("audio/wav");
		expect(init?.body).toBe(wav);
	});

	it.each([
		["transcription_failed", 422],
		["rate_limited", 429],
		["ai_quota_exhausted", 503],
	])("passes through the %s error", async (error, status) => {
		mockFetch(Response.json({ error }, { status }));

		expect(await transcribeAudio(new ArrayBuffer(8))).toEqual({
			ok: false,
			error,
		});
	});

	it("reports a failed request as a network error", async () => {
		mockFetch(new TypeError("Failed to fetch"));

		expect(await transcribeAudio(new ArrayBuffer(8))).toEqual({
			ok: false,
			error: "network",
		});
	});
});
