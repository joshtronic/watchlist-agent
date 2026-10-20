import type { AiRunner } from "./agent/ai-client";

export const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

export const TICKER_PROMPT = "";

export async function transcribe(
	_ai: AiRunner,
	_audio: ArrayBuffer,
): Promise<string> {
	throw new Error("Not implemented");
}
