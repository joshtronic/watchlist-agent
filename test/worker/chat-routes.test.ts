import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "../../src/worker/agent/ai-client";
import worker from "../../src/worker/index";
import { newSessionId } from "../../src/worker/session-cookie";

function postChat(body: unknown, cookie?: string) {
	const headers = new Headers({ "content-type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	return worker.fetch(
		new Request("https://watchlist.test/api/chat", {
			method: "POST",
			headers,
			body: typeof body === "string" ? body : JSON.stringify(body),
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

describe("POST /api/chat", () => {
	it("returns 401 without a session, and does not set a cookie", async () => {
		const res = await postChat({ message: "hi" });

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "no_session" });
		expect(res.headers.has("set-cookie")).toBe(false);
	});

	it("returns 401 for an unknown session and clears its cookie", async () => {
		const res = await postChat(
			{ message: "hi" },
			`wl_session=${newSessionId()}`,
		);

		expect(res.status).toBe(401);
		expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
	});

	it.each([
		["not JSON", "{nope"],
		["no message", {}],
		["a non-string message", { message: 42 }],
		["a blank message", { message: "   " }],
		["a message over 500 characters", { message: "a".repeat(501) }],
	])("rejects %s", async (_label, body) => {
		const id = await existingSession();

		const res = await postChat(body, `wl_session=${id}`);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "bad_request" });
	});

	it("streams the turn and remembers it", async () => {
		const id = await existingSession();
		const fakeAi: AiClient = vi.fn(async () => ({
			text: null,
			toolCalls: [
				{ name: "respond", arguments: { prose: "Hello!", symbols: [] } },
			],
		}));
		await runInDurableObject(sessionStub(id), (instance) => {
			instance.aiClient = () => fakeAi;
		});

		const res = await postChat({ message: "  hi  " }, `wl_session=${id}`);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const body = await res.text();
		expect(body).toContain('event: message\ndata: {"prose":"Hello!"');
		expect(body).toContain("event: done");
		expect(await sessionStub(id).getHistory()).toMatchObject([
			{ role: "user", text: "hi" },
			{ role: "assistant", text: "Hello!" },
		]);
	});
});
