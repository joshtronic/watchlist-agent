// Manual contract check against the real Alpaca API, using our client code
// and the keys in .dev.vars. Not part of the test suite; never prints keys.
//
// Usage: npm run check:alpaca [-- SYMBOL ...]   (defaults to the starter list)

import { checkAsset, getSnapshots } from "../src/worker/alpaca.ts";
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

const notValid = assets.filter((asset) => asset.status !== "valid");
const noData = rows.filter((row) => row.price === null);
if (notValid.length > 0 || noData.length > 0) {
	console.error(
		`Problems: not valid [${notValid.map((a) => a.symbol).join(", ")}], ` +
			`no snapshot data [${noData.map((r) => r.symbol).join(", ")}]`,
	);
	process.exit(1);
}
console.log("All symbols valid with snapshot data.");
