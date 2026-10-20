export type TranscribeResult =
	| { ok: true; text: string }
	| { ok: false; error: string };

export async function transcribeAudio(
	_wav: ArrayBuffer,
): Promise<TranscribeResult> {
	throw new Error("Not implemented");
}
