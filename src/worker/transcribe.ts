import { type AiRunner, toAiError } from "./agent/ai-client";

export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

// Primes Whisper to spell tickers rather than words ("NVDA", not "and video").
export const TICKER_PROMPT =
	"A question about stocks on a watchlist, naming companies and ticker symbols such as Nvidia (NVDA), Apple (AAPL), Microsoft (MSFT), Micron (MU), Amazon (AMZN), AMD, Meta (META), Alphabet (GOOGL), Tesla (TSLA), Cloudflare (NET), Snowflake (SNOW) and the QQQ fund.";

/** Transcribes WAV audio with Whisper; throws AiError on failure. */
export async function transcribe(
	ai: AiRunner,
	audio: ArrayBuffer,
): Promise<string> {
	let output: unknown;
	try {
		output = await ai.run(WHISPER_MODEL, {
			audio: toBase64(new Uint8Array(audio)),
			initial_prompt: TICKER_PROMPT,
		});
	} catch (error) {
		throw toAiError(error);
	}
	const text = (output as { text?: unknown } | null)?.text;
	return typeof text === "string" ? text.trim() : "";
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}
