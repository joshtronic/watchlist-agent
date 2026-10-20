import { describe, expect, it, vi } from "vitest";
import { AiError } from "../../src/worker/agent/ai-client";
import {
	TICKER_PROMPT,
	transcribe,
	WHISPER_MODEL,
} from "../../src/worker/transcribe";

const audio = new Uint8Array([82, 73, 70, 70]).buffer; // "RIFF"

describe("transcribe", () => {
	it("sends base64 audio to Whisper with the ticker hint", async () => {
		const ai = { run: vi.fn(async () => ({ text: " add Nvidia " })) };

		expect(await transcribe(ai, audio)).toBe("add Nvidia");
		expect(ai.run).toHaveBeenCalledWith(WHISPER_MODEL, {
			audio: "UklGRg==",
			initial_prompt: TICKER_PROMPT,
		});
	});

	it("primes Whisper with ticker symbols", () => {
		expect(TICKER_PROMPT).toMatch(/NVDA/);
		expect(TICKER_PROMPT).toMatch(/QQQ/);
	});

	it("maps the daily allocation running out to quota exhausted", async () => {
		const ai = {
			run: vi.fn(async () => {
				throw new Error("4006: daily free allocation exceeded");
			}),
		};

		const error = await transcribe(ai, audio).catch((e) => e);

		expect(error).toBeInstanceOf(AiError);
		expect(error.code).toBe("ai_quota_exhausted");
	});
});
