import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker from "../../src/worker/index";
import { newSessionId } from "../../src/worker/session-cookie";

// A minimal WAV header followed by a little silence.
const WAV = new Uint8Array([
	...new TextEncoder().encode("RIFF"),
	0,
	0,
	0,
	0,
	...new TextEncoder().encode("WAVE"),
	...new Uint8Array(40),
]);

function sessionStub(id: string) {
	return env.SESSION.get(env.SESSION.idFromName(id));
}

async function existingSession() {
	const id = newSessionId();
	await sessionStub(id).create(Date.now());
	return id;
}

function post(
	body: BodyInit,
	{
		cookie,
		type = "audio/wav",
		ai = { run: vi.fn(async () => ({ text: "add Nvidia" })) },
	}: { cookie?: string; type?: string; ai?: { run: unknown } } = {},
) {
	const headers = new Headers({ "content-type": type });
	if (cookie) headers.set("cookie", cookie);
	return worker.fetch(
		new Request("https://watchlist.test/api/transcribe", {
			method: "POST",
			headers,
			body,
		}),
		{ ...env, AI: ai as unknown as Ai },
	);
}

describe("POST /api/transcribe", () => {
	it("returns 401 without a session", async () => {
		const res = await post(WAV);

		expect(res.status).toBe(401);
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("returns the transcript", async () => {
		const id = await existingSession();

		const res = await post(WAV, { cookie: `wl_session=${id}` });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ text: "add Nvidia" });
	});

	it.each([
		["a non-WAV content type", WAV, "audio/ogg"],
		["a body that is not a WAV file", new Uint8Array(48), "audio/wav"],
		["an empty body", new Uint8Array(0), "audio/wav"],
	])("rejects %s", async (_label, body, type) => {
		const id = await existingSession();

		const res = await post(body, { cookie: `wl_session=${id}`, type });

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "bad_request" });
	});

	it("rejects audio over the size limit", async () => {
		const id = await existingSession();
		const big = new Uint8Array(1_600_000);
		big.set(WAV);

		const res = await post(big, { cookie: `wl_session=${id}` });

		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "audio_too_large" });
	});

	it("reports an empty transcript as a failed transcription", async () => {
		const id = await existingSession();

		const res = await post(WAV, {
			cookie: `wl_session=${id}`,
			ai: { run: vi.fn(async () => ({ text: "   " })) },
		});

		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ error: "transcription_failed" });
	});

	it.each([
		[
			"the daily allocation running out",
			"4006: neurons",
			503,
			"ai_quota_exhausted",
		],
		["any other Whisper failure", "boom", 502, "transcription_failed"],
	])("reports %s", async (_label, message, status, error) => {
		const id = await existingSession();

		const res = await post(WAV, {
			cookie: `wl_session=${id}`,
			ai: {
				run: vi.fn(async () => {
					throw new Error(message);
				}),
			},
		});

		expect(res.status).toBe(status);
		expect(await res.json()).toEqual({ error });
	});

	it("shares the chat rate limit", async () => {
		const id = await existingSession();
		for (let i = 0; i < 10; i++) {
			await sessionStub(id).allowRequest(Date.now());
		}

		const res = await post(WAV, { cookie: `wl_session=${id}` });

		expect(res.status).toBe(429);
		expect(await res.json()).toMatchObject({ error: "rate_limited" });
	});
});
