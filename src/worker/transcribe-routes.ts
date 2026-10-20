import { AiError, type AiRunner } from "./agent/ai-client";
import { rateLimited } from "./chat-routes";
import { json, sessionStub } from "./http";
import { expiredSessionCookie, readSessionId } from "./session-cookie";
import { transcribe } from "./transcribe";

// About thirty seconds of 16 kHz, 16-bit mono audio, with headroom.
const MAX_AUDIO_BYTES = 1_500_000;

export async function postTranscribe(
	request: Request,
	env: Env,
): Promise<Response> {
	const id = readSessionId(request);
	if (!id) return json({ error: "no_session" }, 401);

	const session = sessionStub(env, id);
	if (!(await session.touch(Date.now()))) {
		return json({ error: "no_session" }, 401, expiredSessionCookie());
	}

	const allowed = await session.allowRequest(Date.now());
	if (!allowed.ok) return rateLimited(allowed.retryAfter);

	if (!request.headers.get("content-type")?.startsWith("audio/wav")) {
		return json({ error: "bad_request" }, 400);
	}
	const audio = await request.arrayBuffer();
	if (audio.byteLength > MAX_AUDIO_BYTES) {
		return json({ error: "audio_too_large" }, 413);
	}
	if (!isWav(new Uint8Array(audio))) return json({ error: "bad_request" }, 400);

	try {
		const text = await transcribe(env.AI as unknown as AiRunner, audio);
		if (!text) return json({ error: "transcription_failed" }, 422);
		return json({ text }, 200);
	} catch (error) {
		if (error instanceof AiError && error.code === "ai_quota_exhausted") {
			return json({ error: "ai_quota_exhausted" }, 503);
		}
		console.error("transcription failed", error);
		return json({ error: "transcription_failed" }, 502);
	}
}

function isWav(bytes: Uint8Array): boolean {
	const tag = (offset: number) =>
		String.fromCharCode(...bytes.subarray(offset, offset + 4));
	return bytes.length > 12 && tag(0) === "RIFF" && tag(8) === "WAVE";
}
