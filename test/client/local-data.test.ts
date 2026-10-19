import { describe, expect, it } from "vitest";
import { clearLocalData } from "../../src/client/local-data";

describe("clearLocalData", () => {
	it("removes this app's keys and leaves others alone", () => {
		localStorage.clear();
		localStorage.setItem("watchlist:history", "[]");
		localStorage.setItem("watchlist:draft", "hi");
		localStorage.setItem("someone-else", "keep");

		clearLocalData(localStorage);

		expect(localStorage.getItem("watchlist:history")).toBeNull();
		expect(localStorage.getItem("watchlist:draft")).toBeNull();
		expect(localStorage.getItem("someone-else")).toBe("keep");
	});

	it("does not throw when storage is unavailable", () => {
		const broken = {
			get length(): number {
				throw new Error("SecurityError");
			},
		} as unknown as Storage;

		expect(() => clearLocalData(broken)).not.toThrow();
	});
});
