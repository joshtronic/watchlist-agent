import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type AlpacaConfig,
	alpacaConfig,
	checkAsset,
	getSnapshots,
	MarketDataError,
} from "../../src/worker/alpaca";

const config: AlpacaConfig = {
	keyId: "key-id",
	secretKey: "secret",
	dataBaseUrl: "https://data.test",
	tradingBaseUrl: "https://trading.test",
};

function mockFetch(response: Response | Error) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () =>
			response instanceof Error ? Promise.reject(response) : response,
		);
}

function lastRequest(spy: ReturnType<typeof mockFetch>) {
	const [input, init] = spy.mock.calls.at(-1) ?? [];
	return { url: new URL(String(input)), headers: new Headers(init?.headers) };
}

async function expectMarketDataError(
	promise: Promise<unknown>,
	code: MarketDataError["code"],
) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(MarketDataError);
	expect((error as MarketDataError).code).toBe(code);
}

const failures: [string, Response | Error, MarketDataError["code"]][] = [
	[
		"rate limiting",
		new Response("slow down", { status: 429 }),
		"market_data_rate_limited",
	],
	[
		"a server error",
		new Response("oops", { status: 500 }),
		"market_data_error",
	],
	[
		"rejected credentials",
		new Response("forbidden", { status: 403 }),
		"market_data_error",
	],
	["a network failure", new TypeError("fetch failed"), "market_data_error"],
];

afterEach(() => {
	vi.restoreAllMocks();
});

describe("alpacaConfig", () => {
	it("reads credentials and hosts from the environment", () => {
		expect(alpacaConfig(env)).toEqual({
			keyId: "test-alpaca-key",
			secretKey: "test-alpaca-secret",
			dataBaseUrl: "https://data.alpaca.markets",
			tradingBaseUrl: "https://paper-api.alpaca.markets",
		});
	});
});

describe("checkAsset", () => {
	const asset = (overrides: Record<string, unknown> = {}) =>
		Response.json({
			symbol: "NET",
			class: "us_equity",
			status: "active",
			tradable: true,
			...overrides,
		});

	it("looks the symbol up on the trading API with credentials", async () => {
		const spy = mockFetch(asset());

		await checkAsset(config, "NET");

		const { url, headers } = lastRequest(spy);
		expect(url.href).toBe("https://trading.test/v2/assets/NET");
		expect(headers.get("APCA-API-KEY-ID")).toBe("key-id");
		expect(headers.get("APCA-API-SECRET-KEY")).toBe("secret");
	});

	it("keeps share-class symbols intact in the path", async () => {
		const spy = mockFetch(asset({ symbol: "BRK.B" }));

		await checkAsset(config, "BRK.B");

		expect(lastRequest(spy).url.pathname).toBe("/v2/assets/BRK.B");
	});

	it("accepts an active, tradable US equity", async () => {
		mockFetch(asset());

		expect(await checkAsset(config, "NET")).toEqual({
			symbol: "NET",
			status: "valid",
		});
	});

	it("reports an unknown symbol as invalid", async () => {
		mockFetch(Response.json({ message: "not found" }, { status: 404 }));

		expect(await checkAsset(config, "ZZZZ")).toEqual({
			symbol: "ZZZZ",
			status: "invalid",
		});
	});

	it.each([
		["inactive", { status: "inactive" }],
		["not tradable", { tradable: false }],
		["not a US equity", { class: "crypto" }],
	])("reports an asset that is %s as not tradable", async (_label, fields) => {
		mockFetch(asset(fields));

		expect(await checkAsset(config, "NET")).toEqual({
			symbol: "NET",
			status: "not_tradable",
		});
	});

	it.each(failures)("throws on %s", async (_label, response, code) => {
		mockFetch(response);

		await expectMarketDataError(checkAsset(config, "NET"), code);
	});
});

describe("getSnapshots", () => {
	const net = {
		latestTrade: { p: 182.41, t: "2026-10-19T19:42:10.5Z" },
		latestQuote: { bp: 182.4, ap: 182.43 },
		dailyBar: { o: 180.5, h: 183.05, l: 179.8, c: 182.41, v: 4_100_000 },
		prevDailyBar: { c: 180.24 },
	};

	it("makes no request for an empty list", async () => {
		const spy = mockFetch(Response.json({}));

		expect(await getSnapshots(config, [])).toEqual([]);
		expect(spy).not.toHaveBeenCalled();
	});

	it("fetches every symbol in one IEX request with credentials", async () => {
		const spy = mockFetch(Response.json({ NET: net, AAPL: net }));

		await getSnapshots(config, ["NET", "AAPL"]);

		expect(spy).toHaveBeenCalledOnce();
		const { url, headers } = lastRequest(spy);
		expect(url.origin + url.pathname).toBe(
			"https://data.test/v2/stocks/snapshots",
		);
		expect(url.searchParams.get("symbols")).toBe("NET,AAPL");
		expect(url.searchParams.get("feed")).toBe("iex");
		expect(headers.get("APCA-API-KEY-ID")).toBe("key-id");
		expect(headers.get("APCA-API-SECRET-KEY")).toBe("secret");
	});

	it("maps a snapshot and computes the change since the prior close", async () => {
		mockFetch(Response.json({ NET: net }));

		const [row] = await getSnapshots(config, ["NET"]);

		expect(row).toMatchObject({
			symbol: "NET",
			price: 182.41,
			tradeTime: "2026-10-19T19:42:10.5Z",
			prevClose: 180.24,
			dayOpen: 180.5,
			dayHigh: 183.05,
			dayLow: 179.8,
			dayVolume: 4_100_000,
			bid: 182.4,
			ask: 182.43,
		});
		expect(row?.change).toBeCloseTo(2.17, 6);
		expect(row?.changePct).toBeCloseTo((2.17 / 180.24) * 100, 6);
	});

	it("returns rows in the order the symbols were requested", async () => {
		mockFetch(Response.json({ AAPL: net, NET: net, MU: net }));

		const rows = await getSnapshots(config, ["MU", "NET", "AAPL"]);

		expect(rows.map((row) => row.symbol)).toEqual(["MU", "NET", "AAPL"]);
	});

	it("returns an all-empty row for a symbol with no data", async () => {
		mockFetch(Response.json({ NET: net }));

		const [, missing] = await getSnapshots(config, ["NET", "SPCX"]);

		expect(missing).toEqual({
			symbol: "SPCX",
			price: null,
			tradeTime: null,
			prevClose: null,
			change: null,
			changePct: null,
			dayOpen: null,
			dayHigh: null,
			dayLow: null,
			dayVolume: null,
			bid: null,
			ask: null,
		});
	});

	it("leaves the change empty without a prior close", async () => {
		const { prevDailyBar: _omitted, ...withoutPrev } = net;
		mockFetch(Response.json({ NET: withoutPrev }));

		const [row] = await getSnapshots(config, ["NET"]);

		expect(row).toMatchObject({
			price: 182.41,
			prevClose: null,
			change: null,
			changePct: null,
		});
	});

	it("treats an empty IEX quote side as no bid or ask", async () => {
		mockFetch(
			Response.json({ NET: { ...net, latestQuote: { bp: 0, ap: 0 } } }),
		);

		const [row] = await getSnapshots(config, ["NET"]);

		expect(row).toMatchObject({ bid: null, ask: null });
	});

	it.each(failures)("throws on %s", async (_label, response, code) => {
		mockFetch(response);

		await expectMarketDataError(getSnapshots(config, ["NET"]), code);
	});

	it("throws on a body that is not JSON", async () => {
		mockFetch(new Response("<html>", { status: 200 }));

		await expectMarketDataError(
			getSnapshots(config, ["NET"]),
			"market_data_error",
		);
	});
});
