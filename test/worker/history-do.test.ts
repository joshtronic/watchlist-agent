import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

let counter = 0;
function stub() {
	counter += 1;
	return env.SESSION.get(env.SESSION.idFromName(`history-${counter}`));
}

describe("SessionDO conversation memory", () => {
	it("starts with no history and no pending offer", async () => {
		const session = stub();

		expect(await session.getHistory()).toEqual([]);
		expect(await session.getPendingOffer()).toEqual([]);
	});

	it("records a turn as a user and an assistant message", async () => {
		const session = stub();

		await session.recordTurn({
			user: "How's NET?",
			assistant: "NET is up today.",
			at: 1000,
			offer: [],
		});

		expect(await session.getHistory()).toEqual([
			{ role: "user", text: "How's NET?", at: 1000 },
			{ role: "assistant", text: "NET is up today.", at: 1000 },
		]);
	});

	it("keeps only the last ten exchanges", async () => {
		const session = stub();

		for (let i = 1; i <= 12; i++) {
			await session.recordTurn({
				user: `question ${i}`,
				assistant: `answer ${i}`,
				at: i,
				offer: [],
			});
		}

		const history = await session.getHistory();
		expect(history).toHaveLength(20);
		expect(history[0]).toEqual({ role: "user", text: "question 3", at: 3 });
		expect(history.at(-1)).toEqual({
			role: "assistant",
			text: "answer 12",
			at: 12,
		});
	});

	it("replaces the pending offer on every turn", async () => {
		const session = stub();

		await session.recordTurn({
			user: "a",
			assistant: "b",
			at: 1,
			offer: ["SNOW"],
		});
		expect(await session.getPendingOffer()).toEqual(["SNOW"]);

		await session.recordTurn({ user: "c", assistant: "d", at: 2, offer: [] });
		expect(await session.getPendingOffer()).toEqual([]);
	});

	it("can expire the pending offer on its own", async () => {
		const session = stub();
		await session.recordTurn({
			user: "a",
			assistant: "b",
			at: 1,
			offer: ["SNOW"],
		});

		await session.clearPendingOffer();

		expect(await session.getPendingOffer()).toEqual([]);
		expect(await session.getHistory()).toHaveLength(2);
	});

	it("is wiped along with the session", async () => {
		const session = stub();
		await session.create(Date.now());
		await session.recordTurn({
			user: "a",
			assistant: "b",
			at: 1,
			offer: ["SNOW"],
		});

		await session.destroy();

		expect(await session.getHistory()).toEqual([]);
		expect(await session.getPendingOffer()).toEqual([]);
	});
});
