import { describe, expect, it } from "vitest";
import {
	formatAsOf,
	formatChange,
	formatPercent,
	formatPrice,
	formatVolume,
} from "../../src/client/format";

describe("formatPrice", () => {
	it.each([
		[182.41, "182.41"],
		[182.4, "182.40"],
		[1234.5, "1,234.50"],
		[null, "—"],
	])("%s → %s", (value, expected) => {
		expect(formatPrice(value)).toBe(expected);
	});
});

describe("formatChange", () => {
	it.each([
		[2.17, "+2.17"],
		[-11.82, "−11.82"],
		[0, "0.00"],
		[null, "—"],
	])("%s → %s", (value, expected) => {
		expect(formatChange(value)).toBe(expected);
	});
});

describe("formatPercent", () => {
	it.each([
		[1.204, "+1.20%"],
		[-2.781, "−2.78%"],
		[0, "0.00%"],
		[null, "—"],
	])("%s → %s", (value, expected) => {
		expect(formatPercent(value)).toBe(expected);
	});
});

describe("formatVolume", () => {
	it.each([
		[950, "950"],
		[12_300, "12.3K"],
		[4_100_000, "4.1M"],
		[2_500_000_000, "2.5B"],
		[null, "—"],
	])("%s → %s", (value, expected) => {
		expect(formatVolume(value)).toBe(expected);
	});
});

describe("formatAsOf", () => {
	it("shows the time in US Eastern time", () => {
		expect(formatAsOf("2026-10-19T19:42:10Z")).toBe("3:42 PM ET");
	});
});
