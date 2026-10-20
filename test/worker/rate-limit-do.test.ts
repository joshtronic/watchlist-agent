import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

let counter = 0;
function stub() {
	counter += 1;
	return env.SESSION.get(env.SESSION.idFromName(`rate-${counter}`));
}

const START = 1_800_000_000_000;

describe("SessionDO rate limit", () => {
	it("allows ten requests a minute", async () => {
		const session = stub();

		for (let i = 0; i < 10; i++) {
			expect(await session.allowRequest(START + i * 1000)).toEqual({
				ok: true,
			});
		}
	});

	it("refuses the eleventh and says when to retry", async () => {
		const session = stub();
		for (let i = 0; i < 10; i++) await session.allowRequest(START + i * 1000);

		// The oldest request (at START) leaves the window at START + 60s.
		expect(await session.allowRequest(START + 15_500)).toEqual({
			ok: false,
			retryAfter: 45,
		});
	});

	it("does not count refused requests against the window", async () => {
		const session = stub();
		for (let i = 0; i < 10; i++) await session.allowRequest(START);
		await session.allowRequest(START + 1000);
		await session.allowRequest(START + 2000);

		expect(await session.allowRequest(START + 60_000)).toEqual({ ok: true });
	});

	it("allows requests again once the window has passed", async () => {
		const session = stub();
		for (let i = 0; i < 10; i++) await session.allowRequest(START);

		expect(await session.allowRequest(START + 60_001)).toEqual({ ok: true });
	});

	it("is wiped along with the session", async () => {
		const session = stub();
		await session.create(Date.now());
		for (let i = 0; i < 10; i++) await session.allowRequest(START);

		await session.destroy();

		expect(await session.allowRequest(START + 1)).toEqual({ ok: true });
	});
});
