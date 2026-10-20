// Manual check of transcription against the real Whisper model. Speech is
// synthesised with Workers AI's MeloTTS (which returns WAV), then run through
// the app's transcribe(). Synthetic speech is harder than a real voice, so
// treat misses as a prompt to listen, not as proof. Costs a few neurons.
//
// Usage: npm run check:voice

import { getPlatformProxy } from "wrangler";
import type { AiRunner } from "../src/worker/agent/ai-client";
import { transcribe } from "../src/worker/transcribe";

const PHRASES: { say: string; expect: RegExp[] }[] = [
	{ say: "How is my watchlist doing today?", expect: [/watchlist/i] },
	{ say: "Add Snowflake to my watchlist.", expect: [/snowflake|SNOW/i] },
	{ say: "Remove Tesla.", expect: [/tesla|TSLA/i] },
	{ say: "How did Apple do last week?", expect: [/apple|AAPL/i, /week/i] },
];

const { env, dispose } = await getPlatformProxy<Env>({ remoteBindings: true });
const ai = env.AI as unknown as AiRunner;
let misses = 0;

for (const { say, expect } of PHRASES) {
	const speech = (await ai.run("@cf/myshell-ai/melotts", {
		prompt: say,
		lang: "en",
	})) as { audio?: string };
	const audio = Uint8Array.from(atob(speech.audio ?? ""), (c) =>
		c.charCodeAt(0),
	);
	const heard = await transcribe(ai, audio.buffer);
	const missed = expect.filter((pattern) => !pattern.test(heard));
	if (missed.length > 0) misses += 1;
	console.log(`${missed.length ? "MISS" : "ok  "} said "${say}"`);
	console.log(`     heard "${heard}"`);
}

await dispose();
console.log(
	misses === 0 ? "\nAll phrases recognised." : `\n${misses} phrase(s) missed.`,
);
process.exit(misses === 0 ? 0 : 1);
