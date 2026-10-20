import { downmix, encodeWav, resample } from "./wav";

const MAX_RECORDING_MS = 30_000;
const WHISPER_RATE = 16_000;

export interface Recording {
	/** Stops recording and returns 16 kHz mono WAV audio. */
	stop(): Promise<ArrayBuffer>;
	cancel(): void;
}

export function micSupported(): boolean {
	return (
		typeof navigator.mediaDevices?.getUserMedia === "function" &&
		typeof MediaRecorder !== "undefined"
	);
}

/**
 * Records from the microphone in the browser's native format (Firefox:
 * ogg/opus) and converts to WAV on stop, so the server only sees one format.
 */
export async function startRecording(onLimit: () => void): Promise<Recording> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.addEventListener("dataavailable", (event) =>
		chunks.push(event.data),
	);
	const stopped = new Promise<Blob>((resolve) => {
		recorder.addEventListener("stop", () =>
			resolve(new Blob(chunks, { type: recorder.mimeType })),
		);
	});

	const limit = setTimeout(onLimit, MAX_RECORDING_MS);
	const release = () => {
		clearTimeout(limit);
		for (const track of stream.getTracks()) track.stop();
	};
	recorder.start();

	return {
		async stop() {
			if (recorder.state !== "inactive") recorder.stop();
			const blob = await stopped;
			release();
			return toWav(blob);
		},
		cancel() {
			if (recorder.state !== "inactive") recorder.stop();
			release();
		},
	};
}

async function toWav(blob: Blob): Promise<ArrayBuffer> {
	const context = new AudioContext();
	try {
		const audio = await context.decodeAudioData(await blob.arrayBuffer());
		const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
			audio.getChannelData(i),
		);
		return encodeWav(
			resample(downmix(channels), audio.sampleRate, WHISPER_RATE),
			WHISPER_RATE,
		);
	} finally {
		void context.close();
	}
}
