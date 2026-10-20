import { beforeEach, describe, expect, it } from "vitest";
import {
	appendEntries,
	type ChatEntry,
	loadHistory,
	memoryBoundary,
} from "../../src/client/history-store";

const user = (text: string, at = 1): ChatEntry => ({ kind: "user", text, at });
const assistant = (text: string, at = 1): ChatEntry => ({
	kind: "assistant",
	text,
	at,
});
const table: ChatEntry = { kind: "snapshots", asOf: "x", rows: [], at: 1 };

beforeEach(() => {
	localStorage.clear();
});

describe("history store", () => {
	it("starts empty", () => {
		expect(loadHistory(localStorage)).toEqual([]);
	});

	it("persists appended entries", () => {
		appendEntries(localStorage, [user("hi"), assistant("hello")]);
		appendEntries(localStorage, [table]);

		expect(loadHistory(localStorage)).toEqual([
			user("hi"),
			assistant("hello"),
			table,
		]);
	});

	it("keeps only the most recent 200 entries", () => {
		const many = Array.from({ length: 205 }, (_, i) => user(`m${i}`, i));

		appendEntries(localStorage, many);

		const history = loadHistory(localStorage);
		expect(history).toHaveLength(200);
		expect(history[0]).toEqual(user("m5", 5));
	});

	it("treats corrupt data as empty", () => {
		localStorage.setItem("watchlist:history", "{not json");

		expect(loadHistory(localStorage)).toEqual([]);
	});

	it("works without storage", () => {
		const broken = {
			getItem() {
				throw new Error("SecurityError");
			},
			setItem() {
				throw new Error("SecurityError");
			},
		} as unknown as Storage;

		expect(loadHistory(broken)).toEqual([]);
		expect(() => appendEntries(broken, [user("hi")])).not.toThrow();
	});
});

describe("memoryBoundary", () => {
	it("is null while everything is still remembered", () => {
		const entries = Array.from({ length: 10 }, (_, i) =>
			i % 2 ? assistant(`a${i}`) : user(`q${i}`),
		);

		expect(memoryBoundary(entries)).toBeNull();
	});

	it("marks where the assistant's memory of the last ten exchanges begins", () => {
		const entries: ChatEntry[] = [];
		for (let i = 0; i < 12; i++) {
			entries.push(user(`q${i}`), table, assistant(`a${i}`));
		}

		// Exchanges 2..11 are remembered; the boundary is at "q2".
		expect(memoryBoundary(entries)).toBe(6);
	});
});
