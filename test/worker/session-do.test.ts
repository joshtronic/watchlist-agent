import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SessionDO } from "../../src/worker/session-do";

function stub(name = "test-session") {
	return env.SESSION.get(env.SESSION.idFromName(name));
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
