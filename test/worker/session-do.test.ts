import {
	env,
	runDurableObjectAlarm,
	runInDurableObject,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SessionDO } from "../../src/worker/session-do";

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

let counter = 0;
function stub() {
	counter += 1;
	return env.SESSION.get(env.SESSION.idFromName(`test-session-${counter}`));
}

function alarmOf(session: ReturnType<typeof stub>) {
	return runInDurableObject(session, (_instance, state) =>
		state.storage.getAlarm(),
	);
}

describe("SessionDO", () => {
	it("answers a ping over RPC", async () => {
		expect(await stub().ping()).toBe("pong");
	});

	it("is backed by SQLite storage", async () => {
		await runInDurableObject(stub(), async (instance, state) => {
			expect(instance).toBeInstanceOf(SessionDO);
			const row = state.storage.sql.exec("SELECT 1 AS one").one();
			expect(row).toEqual({ one: 1 });
		});
	});
});

describe("SessionDO session record", () => {
	it("has no session until one is created", async () => {
		expect(await stub().get()).toBeNull();
	});

	it("records when the disclaimer was accepted", async () => {
		const session = stub();
		const now = Date.now();

		await session.create(now);

		expect(await session.get()).toEqual({
			disclaimerAcceptedAt: now,
			lastActive: now,
			cookieIssuedAt: now,
		});
	});

	it("schedules the inactivity wipe a year out on create", async () => {
		const session = stub();
		const now = Date.now();

		await session.create(now);

		expect(await alarmOf(session)).toBe(now + YEAR_MS);
	});

	it("leaves an existing session untouched on create", async () => {
		const session = stub();
		const first = Date.now();

		await session.create(first);
		await session.create(first + 5_000);

		expect(await session.get()).toMatchObject({
			disclaimerAcceptedAt: first,
		});
	});

	it("wipes the session and its alarm on destroy", async () => {
		const session = stub();
		await session.create(Date.now());

		await session.destroy();

		expect(await session.get()).toBeNull();
		expect(await alarmOf(session)).toBeNull();
	});
});

describe("SessionDO touch", () => {
	it("does nothing without a session", async () => {
		const session = stub();

		expect(await session.touch(Date.now())).toBeNull();
		expect(await session.get()).toBeNull();
		expect(await alarmOf(session)).toBeNull();
	});

	it("records activity and pushes the wipe out a year", async () => {
		const session = stub();
		const created = Date.now();
		await session.create(created);

		const later = created + 3 * DAY_MS;
		await session.touch(later);

		expect(await session.get()).toMatchObject({ lastActive: later });
		expect(await alarmOf(session)).toBe(later + YEAR_MS);
	});

	it("does not refresh the cookie within a day of issuing it", async () => {
		const session = stub();
		const created = Date.now();
		await session.create(created);

		const result = await session.touch(created + DAY_MS - 1);

		expect(result).toEqual({ refreshCookie: false });
		expect(await session.get()).toMatchObject({ cookieIssuedAt: created });
	});

	it("refreshes the cookie once a day has passed", async () => {
		const session = stub();
		const created = Date.now();
		await session.create(created);

		const later = created + DAY_MS;
		const result = await session.touch(later);

		expect(result).toEqual({ refreshCookie: true });
		expect(await session.get()).toMatchObject({ cookieIssuedAt: later });
	});
});

describe("SessionDO inactivity alarm", () => {
	it("wipes the session when it fires", async () => {
		const session = stub();
		await session.create(Date.now());

		expect(await runDurableObjectAlarm(session)).toBe(true);
		expect(await session.get()).toBeNull();
	});
});
