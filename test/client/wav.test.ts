import { describe, expect, it } from "vitest";
import { downmix, encodeWav, resample } from "../../src/client/wav";

function text(view: DataView, offset: number, length: number) {
	return String.fromCharCode(
		...Array.from({ length }, (_, i) => view.getUint8(offset + i)),
	);
}

describe("encodeWav", () => {
	it("writes a 16-bit mono PCM WAV header", () => {
		const view = new DataView(encodeWav(new Float32Array(4), 16000));

		expect(text(view, 0, 4)).toBe("RIFF");
		expect(view.getUint32(4, true)).toBe(36 + 8);
		expect(text(view, 8, 4)).toBe("WAVE");
		expect(text(view, 12, 4)).toBe("fmt ");
		expect(view.getUint32(16, true)).toBe(16);
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(1); // mono
		expect(view.getUint32(24, true)).toBe(16000);
		expect(view.getUint32(28, true)).toBe(32000); // byte rate
		expect(view.getUint16(32, true)).toBe(2); // block align
		expect(view.getUint16(34, true)).toBe(16); // bits per sample
		expect(text(view, 36, 4)).toBe("data");
		expect(view.getUint32(40, true)).toBe(8);
		expect(view.byteLength).toBe(44 + 8);
	});

	it("converts samples to 16-bit integers, clamping out-of-range values", () => {
		const view = new DataView(
			encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -2]), 16000),
		);
		const samples = Array.from({ length: 6 }, (_, i) =>
			view.getInt16(44 + i * 2, true),
		);

		expect(samples).toEqual([0, 32767, -32768, 16384, 32767, -32768]);
	});
});

describe("downmix", () => {
	it("averages channels into one", () => {
		const mono = downmix([
			new Float32Array([1, 0, 0.5]),
			new Float32Array([0, 0, -0.5]),
		]);

		expect(Array.from(mono)).toEqual([0.5, 0, 0]);
	});

	it("returns a single channel unchanged", () => {
		const channel = new Float32Array([0.1, 0.2]);

		expect(downmix([channel])).toBe(channel);
	});
});

describe("resample", () => {
	it("returns the input when the rates match", () => {
		const samples = new Float32Array([0.1, 0.2, 0.3]);

		expect(resample(samples, 16000, 16000)).toBe(samples);
	});

	it("shrinks to the target rate's length", () => {
		const samples = new Float32Array(48000);

		expect(resample(samples, 48000, 16000)).toHaveLength(16000);
	});

	it("interpolates between neighbouring samples", () => {
		const samples = new Float32Array([0, 1, 0, -1]);

		const out = resample(samples, 4, 2);

		expect(Array.from(out)).toEqual([0, 0]);
		expect(Array.from(resample(new Float32Array([0, 1]), 2, 4))).toEqual([
			0, 0.5, 1, 1,
		]);
	});
});
