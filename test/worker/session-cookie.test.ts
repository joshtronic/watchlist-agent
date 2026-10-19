import { describe, expect, it } from "vitest";
import {
	expiredSessionCookie,
	newSessionId,
	readSessionId,
	sessionCookie,
} from "../../src/worker/session-cookie";

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function withCookie(cookie: string) {
	return new Request("https://watchlist.test/", { headers: { cookie } });
}

describe("newSessionId", () => {
	it("is 128 bits encoded as base64url", () => {
		expect(newSessionId()).toMatch(ID_PATTERN);
	});

	it("is unique per call", () => {
		const ids = new Set(Array.from({ length: 100 }, newSessionId));
		expect(ids.size).toBe(100);
	});
});

describe("readSessionId", () => {
	const id = "AbCdEfGhIjKlMnOpQrStUv";

	it("returns the session id from the cookie header", () => {
		expect(readSessionId(withCookie(`wl_session=${id}`))).toBe(id);
	});

	it("finds the session cookie among others", () => {
		const header = `theme=dark; wl_session=${id}; other=1`;
		expect(readSessionId(withCookie(header))).toBe(id);
	});

	it("returns null without a cookie header", () => {
		expect(readSessionId(new Request("https://watchlist.test/"))).toBeNull();
	});

	it("returns null when the session cookie is absent", () => {
		expect(readSessionId(withCookie("theme=dark"))).toBeNull();
	});

	it("ignores cookies whose name merely ends with the session name", () => {
		expect(readSessionId(withCookie(`not_wl_session=${id}`))).toBeNull();
	});

	it.each([
		["too short", "abc"],
		["too long", `${id}x`],
		["bad characters", "AbCdEfGhIjKlMnOpQrSt+/"],
		["empty", ""],
	])("rejects a malformed id (%s)", (_label, value) => {
		expect(readSessionId(withCookie(`wl_session=${value}`))).toBeNull();
	});
});

describe("sessionCookie", () => {
	it("sets a secure, http-only, year-long cookie", () => {
		const header = sessionCookie("AbCdEfGhIjKlMnOpQrStUv");

		expect(header.split("; ")).toEqual([
			"wl_session=AbCdEfGhIjKlMnOpQrStUv",
			"Path=/",
			"Max-Age=31536000",
			"HttpOnly",
			"Secure",
			"SameSite=Lax",
		]);
	});
});

describe("expiredSessionCookie", () => {
	it("clears the cookie immediately", () => {
		expect(expiredSessionCookie().split("; ")).toEqual([
			"wl_session=",
			"Path=/",
			"Max-Age=0",
			"HttpOnly",
			"Secure",
			"SameSite=Lax",
		]);
	});
});
