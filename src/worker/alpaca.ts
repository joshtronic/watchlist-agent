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

export class MarketDataError extends Error {
	readonly code: "market_data_error" | "market_data_rate_limited";

	constructor(code: MarketDataError["code"], message: string) {
		super(message);
		this.code = code;
	}
}

export function alpacaConfig(_env: Env): AlpacaConfig {
	throw new Error("Not implemented");
}

export async function checkAsset(
	_config: AlpacaConfig,
	_symbol: string,
): Promise<AssetCheck> {
	throw new Error("Not implemented");
}

export async function getSnapshots(
	_config: AlpacaConfig,
	_symbols: string[],
): Promise<MarketSnapshot[]> {
	throw new Error("Not implemented");
}
