/** Averages channels into a single mono channel. */
export function downmix(channels: Float32Array[]): Float32Array {
	const [first] = channels;
	if (!first || channels.length === 1) return first ?? new Float32Array(0);

	const mono = new Float32Array(first.length);
	for (let i = 0; i < mono.length; i++) {
		let sum = 0;
		for (const channel of channels) sum += channel[i] ?? 0;
		mono[i] = sum / channels.length;
	}
	return mono;
}

/** Linear-interpolation resampling; good enough for speech recognition. */
export function resample(
	samples: Float32Array,
	fromRate: number,
	toRate: number,
): Float32Array {
	if (fromRate === toRate) return samples;

	const ratio = fromRate / toRate;
	const out = new Float32Array(Math.round(samples.length / ratio));
	const last = samples.length - 1;
	for (let i = 0; i < out.length; i++) {
		const position = i * ratio;
		const index = Math.floor(position);
		const fraction = position - index;
		const a = samples[Math.min(index, last)] ?? 0;
		const b = samples[Math.min(index + 1, last)] ?? 0;
		out[i] = a + (b - a) * fraction;
	}
	return out;
}

/** Encodes mono samples as a 16-bit PCM WAV file. */
export function encodeWav(
	samples: Float32Array,
	sampleRate: number,
): ArrayBuffer {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const write = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};

	write(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	write(8, "WAVE");
	write(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	write(36, "data");
	view.setUint32(40, samples.length * 2, true);

	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
		view.setInt16(
			44 + i * 2,
			Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff),
			true,
		);
	}
	return buffer;
}
