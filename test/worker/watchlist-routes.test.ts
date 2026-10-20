import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index";
import { newSessionId } from "../../src/worker/session-cookie";

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

function postStarter(cookie?: string) {
	const headers = new Headers();
	if (cookie) headers.set("cookie", cookie);
	return worker.fetch(
		new Request("https://watchlist.test/api/watchlist/starter", {
			method: "POST",
			headers,
		}),
		env,
	);
}

function sessionStub(id: string) {
	return env.SESSION.get(env.SESSION.idFromName(id));
}

async function existingSession() {
	const id = newSessionId();
	await sessionStub(id).create(Date.now());
	return id;
}

describe("POST /api/watchlist/starter", () => {
	it("fills an empty watchlist with the starter symbols", async () => {
		const id = await existingSession();

		const res = await postStarter(`wl_session=${id}`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ watchlist: STARTER });
		expect(await sessionStub(id).getWatchlist()).toEqual(STARTER);
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("refuses when the watchlist already has symbols", async () => {
		const id = await existingSession();
		await sessionStub(id).addSymbols(["NET"]);

		const res = await postStarter(`wl_session=${id}`);

		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "watchlist_not_empty" });
		expect(await sessionStub(id).getWatchlist()).toEqual(["NET"]);
	});

	it("returns 401 without a session, and does not set a cookie", async () => {
		const res = await postStarter();

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "no_session" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("returns 401 for an unknown session and clears its cookie", async () => {
		const res = await postStarter(`wl_session=${newSessionId()}`);

		expect(res.status).toBe(401);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
	});
});
