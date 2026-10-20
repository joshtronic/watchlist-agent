import { beforeEach, describe, expect, it } from "vitest";
import {
	chatErrorMessage,
	describeToolCall,
	renderTranscript,
	snapshotCaption,
} from "../../src/client/chat-view";
import type { ChatEntry, SnapshotRow } from "../../src/client/history-store";

let container: HTMLElement;

beforeEach(() => {
	document.body.innerHTML = "";
	container = document.createElement("div");
	document.body.append(container);
});

const row = (overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
	symbol: "NET",
	price: 182.41,
	tradeTime: "2026-10-19T19:42:10Z",
	prevClose: 180.24,
	change: 2.17,
	changePct: 1.204,
	dayOpen: 180.5,
	dayHigh: 183.05,
	dayLow: 179.8,
	dayVolume: 4_100_000,
	bid: 182.4,
	ask: 182.43,
	onWatchlist: true,
	...overrides,
});

const entries = (selector: string) => [
	...container.querySelectorAll<HTMLElement>(selector),
];

describe("renderTranscript", () => {
	it("renders user and assistant messages as text, never as markup", () => {
		renderTranscript(
			container,
			[
				{ kind: "user", text: "<img src=x onerror=alert(1)>", at: 1 },
				{ kind: "assistant", text: "Hello <b>there</b>", at: 2 },
			],
			null,
		);

		const [user] = entries('[data-entry="user"]');
		const [assistant] = entries('[data-entry="assistant"]');
		expect(user?.textContent).toContain("<img src=x onerror=alert(1)>");
		expect(assistant?.textContent).toContain("Hello <b>there</b>");
		expect(container.querySelector("img, b")).toBeNull();
	});

	it("renders a snapshot table from the data", () => {
		renderTranscript(
			container,
			[
				{
					kind: "snapshots",
					asOf: "2026-10-19T19:42:10Z",
					rows: [
						row(),
						row({ symbol: "TSLA", change: -11.82, changePct: -2.78 }),
					],
					at: 1,
				},
			],
			null,
		);

		const table = container.querySelector('[data-entry="snapshots"] table');
		const bodyRows = [...(table?.querySelectorAll("tbody tr") ?? [])].map(
			(tr) =>
				[...tr.querySelectorAll("th, td")].map((c) => c.textContent?.trim()),
		);
		expect(bodyRows[0]).toEqual(
			expect.arrayContaining(["NET", "182.41", "+2.17", "+1.20%", "4.1M"]),
		);
		expect(bodyRows[1]).toEqual(
			expect.arrayContaining(["TSLA", "−11.82", "−2.78%"]),
		);
		expect(
			container.querySelector('[data-entry="snapshots"]')?.textContent,
		).toMatch(/3:42 PM ET/);
		expect(
			container.querySelector('[data-entry="snapshots"]')?.textContent,
		).toMatch(/IEX/);
	});

	it("marks rows for symbols that are not on the watchlist", () => {
		renderTranscript(
			container,
			[
				{
					kind: "snapshots",
					asOf: "2026-10-19T19:42:10Z",
					rows: [row(), row({ symbol: "SNOW", onWatchlist: false })],
					at: 1,
				},
			],
			null,
		);

		const marked = entries("tr[data-off-watchlist]").map((tr) =>
			tr.querySelector("th")?.textContent?.trim(),
		);
		expect(marked).toEqual([expect.stringContaining("SNOW")]);
	});

	it("renders errors with a readable message", () => {
		renderTranscript(
			container,
			[{ kind: "error", code: "ai_quota_exhausted", at: 1 }],
			null,
		);

		expect(entries('[data-entry="error"]')[0]?.textContent).toBe(
			chatErrorMessage("ai_quota_exhausted"),
		);
	});

	it("draws the memory divider before the boundary entry", () => {
		const list: ChatEntry[] = [
			{ kind: "user", text: "old", at: 1 },
			{ kind: "assistant", text: "old answer", at: 1 },
			{ kind: "user", text: "new", at: 2 },
		];

		renderTranscript(container, list, 2);

		const children = [...container.children] as HTMLElement[];
		expect(children.map((child) => child.dataset.entry)).toEqual([
			"user",
			"assistant",
			"memory-divider",
			"user",
		]);
	});
});

describe("snapshotCaption", () => {
	const asOf = "2026-10-19T19:42:10Z";
	const clock = (isOpen: boolean) => ({
		isOpen,
		timestamp: asOf,
		nextOpen: "2026-10-20T13:30:00Z",
		nextClose: "2026-10-20T20:00:00Z",
	});

	it("explains live IEX data and points to a brokerage for real-time prices", () => {
		const caption = snapshotCaption(asOf, clock(true));

		expect(caption).toMatch(/IEX/);
		expect(caption).toMatch(/3:42 PM ET/);
		expect(caption).toMatch(/brokerage/i);
		expect(caption).not.toMatch(/market closed/i);
	});

	it("says when the figures are from the last session", () => {
		const caption = snapshotCaption(asOf, clock(false));

		expect(caption).toMatch(/market closed/i);
		expect(caption).toMatch(/last trading session/i);
		expect(caption).toMatch(/brokerage/i);
	});

	it("still explains the source when the market status is unknown", () => {
		const caption = snapshotCaption(asOf, null);

		expect(caption).toMatch(/IEX/);
		expect(caption).toMatch(/brokerage/i);
	});
});

describe("chatErrorMessage", () => {
	const codes = [
		"ai_quota_exhausted",
		"ai_error",
		"loop_limit",
		"rate_limited",
		"network",
		"no_session",
	];

	it("has a distinct message for each known code", () => {
		const messages = codes.map(chatErrorMessage);

		expect(new Set(messages).size).toBe(codes.length);
		for (const message of messages) expect(message).not.toBe("");
	});

	it("falls back to a generic message", () => {
		expect(chatErrorMessage("internal_error")).toBe(
			chatErrorMessage("something_new"),
		);
	});
});

describe("describeToolCall", () => {
	it.each([
		[
			"get_snapshots",
			{ symbols: ["NET", "MU"] },
			"Fetching snapshots for NET, MU…",
		],
		["get_snapshots", {}, "Fetching snapshots for your watchlist…"],
		["add_symbols", { symbols: ["SNOW"] }, "Adding SNOW…"],
		["remove_symbols", { symbols: ["TSLA"] }, "Removing TSLA…"],
		["list_watchlist", {}, "Checking your watchlist…"],
		["mystery", {}, "Working…"],
	])("%s %j → %s", (name, args, expected) => {
		expect(describeToolCall(name, args)).toBe(expected);
	});
});
