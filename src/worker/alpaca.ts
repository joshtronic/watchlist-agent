export interface AlpacaConfig {
	keyId: string;
	secretKey: string;
	dataBaseUrl: string;
	tradingBaseUrl: string;
}

export interface AssetCheck {
	symbol: string;
	status: "valid" | "invalid" | "not_tradable";
}

export interface MarketSnapshot {
	symbol: string;
	price: number | null;
	tradeTime: string | null;
	prevClose: number | null;
	change: number | null;
	changePct: number | null;
	dayOpen: number | null;
	dayHigh: number | null;
	dayLow: number | null;
	dayVolume: number | null;
	bid: number | null;
	ask: number | null;
}

export interface MarketClock {
	isOpen: boolean;
	timestamp: string;
	nextOpen: string;
	nextClose: string;
}

export interface DailyBar {
	date: string;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface NewsArticle {
	id: number;
	headline: string;
	summary: string;
	source: string;
	url: string;
	symbols: string[];
	createdAt: string;
}

export class MarketDataError extends Error {
	readonly code: "market_data_error" | "market_data_rate_limited";

	constructor(code: MarketDataError["code"], message: string) {
		super(message);
		this.code = code;
	}
}

export function alpacaConfig(env: Env): AlpacaConfig {
	return {
		keyId: env.ALPACA_API_KEY,
		secretKey: env.ALPACA_SECRET_KEY,
		dataBaseUrl: env.ALPACA_DATA_BASE_URL,
		tradingBaseUrl: env.ALPACA_TRADING_BASE_URL,
	};
}

export async function checkAsset(
	config: AlpacaConfig,
	symbol: string,
): Promise<AssetCheck> {
	const url = `${config.tradingBaseUrl}/v2/assets/${encodeURIComponent(symbol)}`;
	const response = await request(config, url, { allowNotFound: true });
	if (response.status === 404) return { symbol, status: "invalid" };

	const asset = await readJson<AlpacaAsset>(response);
	const tradable =
		asset.class === "us_equity" &&
		asset.status === "active" &&
		asset.tradable === true;
	return { symbol, status: tradable ? "valid" : "not_tradable" };
}

export async function getClock(config: AlpacaConfig): Promise<MarketClock> {
	const response = await request(config, `${config.tradingBaseUrl}/v2/clock`);
	const clock = await readJson<{
		is_open?: boolean;
		timestamp?: string;
		next_open?: string;
		next_close?: string;
	}>(response);
	return {
		isOpen: clock.is_open === true,
		timestamp: clock.timestamp ?? "",
		nextOpen: clock.next_open ?? "",
		nextClose: clock.next_close ?? "",
	};
}

/**
 * Split-adjusted daily bars from all US exchanges (SIP). The free plan allows
 * SIP history as long as `end` is at least fifteen minutes in the past.
 */
export async function getDailyBars(
	config: AlpacaConfig,
	symbols: string[],
	start: string,
	end: string,
): Promise<Record<string, DailyBar[]>> {
	const result: Record<string, DailyBar[]> = {};
	if (symbols.length === 0) return result;

	let pageToken: string | null = null;
	do {
		const url = new URL(`${config.dataBaseUrl}/v2/stocks/bars`);
		url.searchParams.set("symbols", symbols.join(","));
		url.searchParams.set("timeframe", "1Day");
		url.searchParams.set("start", start);
		url.searchParams.set("end", end);
		url.searchParams.set("feed", "sip");
		url.searchParams.set("adjustment", "split");
		url.searchParams.set("limit", "10000");
		if (pageToken) url.searchParams.set("page_token", pageToken);

		const page = await readJson<{
			bars?: Record<string, AlpacaBar[]>;
			next_page_token?: string | null;
		}>(await request(config, url.href));

		for (const [symbol, bars] of Object.entries(page.bars ?? {})) {
			result[symbol] = [...(result[symbol] ?? []), ...bars.map(toDailyBar)];
		}
		pageToken = page.next_page_token ?? null;
	} while (pageToken);

	return result;
}

interface AlpacaBar {
	t: string;
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
}

function toDailyBar(bar: AlpacaBar): DailyBar {
	return {
		date: bar.t.slice(0, 10),
		open: bar.o,
		high: bar.h,
		low: bar.l,
		close: bar.c,
		volume: bar.v,
	};
}

export async function getNews(
	_config: AlpacaConfig,
	_symbols: string[],
	_limit: number,
): Promise<NewsArticle[]> {
	throw new Error("Not implemented");
}

export async function getSnapshots(
	config: AlpacaConfig,
	symbols: string[],
): Promise<MarketSnapshot[]> {
	if (symbols.length === 0) return [];

	const url = new URL(`${config.dataBaseUrl}/v2/stocks/snapshots`);
	url.searchParams.set("symbols", symbols.join(","));
	url.searchParams.set("feed", "iex");

	const response = await request(config, url.href);
	const snapshots =
		await readJson<Record<string, AlpacaSnapshot | null>>(response);
	return symbols.map((symbol) => toMarketSnapshot(symbol, snapshots[symbol]));
}

interface AlpacaAsset {
	class?: string;
	status?: string;
	tradable?: boolean;
}

interface AlpacaSnapshot {
	latestTrade?: { p?: number; t?: string };
	latestQuote?: { bp?: number; ap?: number };
	dailyBar?: { o?: number; h?: number; l?: number; v?: number };
	prevDailyBar?: { c?: number };
}

function toMarketSnapshot(
	symbol: string,
	snapshot: AlpacaSnapshot | null | undefined,
): MarketSnapshot {
	const price = snapshot?.latestTrade?.p ?? null;
	const prevClose = snapshot?.prevDailyBar?.c ?? null;
	const change =
		price !== null && prevClose !== null ? price - prevClose : null;

	return {
		symbol,
		price,
		tradeTime: snapshot?.latestTrade?.t ?? null,
		prevClose,
		change,
		changePct: change !== null && prevClose ? (change / prevClose) * 100 : null,
		dayOpen: snapshot?.dailyBar?.o ?? null,
		dayHigh: snapshot?.dailyBar?.h ?? null,
		dayLow: snapshot?.dailyBar?.l ?? null,
		dayVolume: snapshot?.dailyBar?.v ?? null,
		// IEX reports an empty side of the book as 0.
		bid: positiveOrNull(snapshot?.latestQuote?.bp),
		ask: positiveOrNull(snapshot?.latestQuote?.ap),
	};
}

function positiveOrNull(value: number | undefined): number | null {
	return value !== undefined && value > 0 ? value : null;
}

async function request(
	config: AlpacaConfig,
	url: string,
	{ allowNotFound = false } = {},
): Promise<Response> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				"APCA-API-KEY-ID": config.keyId,
				"APCA-API-SECRET-KEY": config.secretKey,
			},
		});
	} catch (error) {
		throw new MarketDataError(
			"market_data_error",
			`Alpaca unreachable: ${error}`,
		);
	}

	if (response.status === 429) {
		throw new MarketDataError("market_data_rate_limited", "Alpaca rate limit");
	}
	if (response.ok || (allowNotFound && response.status === 404)) {
		return response;
	}
	throw new MarketDataError(
		"market_data_error",
		`Alpaca responded ${response.status}`,
	);
}

async function readJson<T>(response: Response): Promise<T> {
	try {
		return (await response.json()) as T;
	} catch {
		throw new MarketDataError("market_data_error", "Alpaca sent invalid JSON");
	}
}
