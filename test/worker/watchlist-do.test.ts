import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const STARTER = [
	"NVDA",
	"AAPL",
	"MSFT",
	"MU",
	"AMZN",
	"AMD",
	"META",
	"GOOGL",
	"TSLA",
	"SPCX",
];

let counter = 0;
function stub() {
	counter += 1;
	return env.SESSION.get(env.SESSION.idFromName(`watchlist-${counter}`));
}

describe("SessionDO watchlist", () => {
	it("is empty by default", async () => {
		expect(await stub().getWatchlist()).toEqual([]);
	});

	it("normalises symbols to trimmed uppercase", async () => {
		const session = stub();

		const results = await session.addSymbols(["  net ", "qqq"]);

		expect(results).toEqual([
			{ symbol: "NET", status: "added" },
			{ symbol: "QQQ", status: "added" },
		]);
		expect(await session.getWatchlist()).toEqual(["NET", "QQQ"]);
	});

	it("keeps symbols in the order they were added", async () => {
		const session = stub();

		await session.addSymbols(["NET"]);
		await session.addSymbols(["AAPL", "MU"]);

		expect(await session.getWatchlist()).toEqual(["NET", "AAPL", "MU"]);
	});

	it("accepts share-class symbols", async () => {
		const session = stub();

		const results = await session.addSymbols(["brk.b"]);

		expect(results).toEqual([{ symbol: "BRK.B", status: "added" }]);
	});

	it("reports symbols already on the list, even within one call", async () => {
		const session = stub();
		await session.addSymbols(["NET"]);

		const results = await session.addSymbols(["net", "MU", "mu"]);

		expect(results).toEqual([
			{ symbol: "NET", status: "already_present" },
			{ symbol: "MU", status: "added" },
			{ symbol: "MU", status: "already_present" },
		]);
		expect(await session.getWatchlist()).toEqual(["NET", "MU"]);
	});

	it.each([
		["empty", ""],
		["whitespace inside", "NV DA"],
		["too long", "TOOLONG"],
		["punctuation", "$NET"],
		["digits", "NET1"],
	])("rejects a malformed symbol (%s)", async (_label, raw) => {
		const session = stub();

		const [result] = await session.addSymbols([raw]);

		expect(result?.status).toBe("invalid");
		expect(await session.getWatchlist()).toEqual([]);
	});

	it("stops at ten symbols and reports the rest as over the cap", async () => {
		const session = stub();
		await session.addSymbols(STARTER.slice(0, 9));

		const results = await session.addSymbols(["NET", "QQQ"]);

		expect(results).toEqual([
			{ symbol: "NET", status: "added" },
			{ symbol: "QQQ", status: "cap_reached" },
		]);
		expect(await session.getWatchlist()).toHaveLength(10);
	});

	it("removes symbols and reports ones that were not on the list", async () => {
		const session = stub();
		await session.addSymbols(["NET", "AAPL", "MU"]);

		const results = await session.removeSymbols([" aapl", "TSLA"]);

		expect(results).toEqual([
			{ symbol: "AAPL", status: "removed" },
			{ symbol: "TSLA", status: "not_present" },
		]);
		expect(await session.getWatchlist()).toEqual(["NET", "MU"]);
	});

	it("is wiped along with the session", async () => {
		const session = stub();
		await session.create(Date.now());
		await session.addSymbols(["NET"]);

		await session.destroy();

		expect(await session.getWatchlist()).toEqual([]);
	});
});

describe("SessionDO starter watchlist", () => {
	it("fills an empty watchlist with QQQ's top ten, in order", async () => {
		const session = stub();

		expect(await session.applyStarter()).toEqual(STARTER);
		expect(await session.getWatchlist()).toEqual(STARTER);
	});

	it("leaves a non-empty watchlist untouched", async () => {
		const session = stub();
		await session.addSymbols(["NET"]);

		expect(await session.applyStarter()).toBeNull();
		expect(await session.getWatchlist()).toEqual(["NET"]);
	});
});
