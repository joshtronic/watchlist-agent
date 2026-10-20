export type TranscribeResult =
	| { ok: true; text: string }
	| { ok: false; error: string };

export async function transcribeAudio(
	wav: ArrayBuffer,
): Promise<TranscribeResult> {
	try {
		const res = await fetch("/api/transcribe", {
			method: "POST",
			headers: { "content-type": "audio/wav" },
			body: wav,
		});
		const body: { text?: unknown; error?: unknown } = await res
			.json()
			.catch(() => ({}));
		if (res.ok && typeof body.text === "string") {
			return { ok: true, text: body.text };
		}
		return {
			ok: false,
			error: typeof body.error === "string" ? body.error : "unknown",
		};
	} catch {
		return { ok: false, error: "network" };
	}
}
