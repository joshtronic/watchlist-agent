// Manual contract check against the real Alpaca API, using our client code
// and the keys in .dev.vars. Not part of the test suite; never prints keys.
//
// Usage: npm run check:alpaca [-- SYMBOL ...]   (defaults to the starter list)

import {
	checkAsset,
	getClock,
	getDailyBars,
	getNews,
	getSnapshots,
} from "../src/worker/alpaca.ts";
import { STARTER_WATCHLIST } from "../src/worker/watchlist.ts";

process.loadEnvFile(".dev.vars");

const config = {
	keyId: process.env.ALPACA_API_KEY ?? "",
	secretKey: process.env.ALPACA_SECRET_KEY ?? "",
	// Same hosts as wrangler.jsonc.
	dataBaseUrl: "https://data.alpaca.markets",
	tradingBaseUrl: "https://paper-api.alpaca.markets",
};

if (!config.keyId || !config.secretKey) {
	console.error(
		"ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in .dev.vars",
	);
	process.exit(1);
}

const args = process.argv.slice(2).map((symbol) => symbol.toUpperCase());
const symbols = args.length > 0 ? args : [...STARTER_WATCHLIST];

console.log("Assets (trading API):");
const assets = [];
for (const symbol of symbols) {
	assets.push(await checkAsset(config, symbol));
}
console.table(assets);

console.log("Snapshots (data API, IEX feed):");
const rows = await getSnapshots(config, symbols);
console.table(
	rows.map((row) => ({
		symbol: row.symbol,
		price: row.price,
		change: row.change?.toFixed(2) ?? null,
		changePct: row.changePct?.toFixed(2) ?? null,
		prevClose: row.prevClose,
		dayVolume: row.dayVolume,
		bid: row.bid,
		ask: row.ask,
		tradeTime: row.tradeTime,
	})),
);

const clock = await getClock(config);
console.log(
	`Market clock: ${clock.isOpen ? "open" : "closed"} (next open ${clock.nextOpen}, next close ${clock.nextClose})`,
);

// SIP history is free once at least fifteen minutes old.
const end = new Date(Date.now() - 16 * 60 * 1000).toISOString();
const start = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
const bars = await getDailyBars(config, symbols, start, end);
console.log("Daily bars (SIP, last ten days):");
console.table(
	symbols.map((symbol) => ({
		symbol,
		bars: bars[symbol]?.length ?? 0,
		latest: bars[symbol]?.at(-1)?.date ?? null,
		close: bars[symbol]?.at(-1)?.close ?? null,
	})),
);

const news = await getNews(config, symbols.slice(0, 3), 5);
console.log(
	`News (Benzinga, ${news.length} latest for ${symbols.slice(0, 3)}):`,
);
for (const article of news) {
	console.log(`  ${article.createdAt.slice(0, 16)}  ${article.headline}`);
}

const notValid = assets.filter((asset) => asset.status !== "valid");
const noBars = symbols.filter((symbol) => !bars[symbol]?.length);
const noData = rows.filter((row) => row.price === null);
if (notValid.length > 0 || noData.length > 0 || noBars.length > 0) {
	console.error(
		`Problems: not valid [${notValid.map((a) => a.symbol).join(", ")}], ` +
			`no snapshot data [${noData.map((r) => r.symbol).join(", ")}], ` +
			`no daily bars [${noBars.join(", ")}]`,
	);
	process.exit(1);
}
console.log("All symbols valid with snapshot data.");
