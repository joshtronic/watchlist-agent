import { json, sessionStub } from "./http";
import {
	expiredSessionCookie,
	readSessionId,
	sessionCookie,
} from "./session-cookie";

const MAX_MESSAGE_LENGTH = 500;

export async function postChat(request: Request, env: Env): Promise<Response> {
	const id = readSessionId(request);
	if (!id) return json({ error: "no_session" }, 401);

	const session = sessionStub(env, id);
	const activity = await session.touch(Date.now());
	if (!activity) {
		return json({ error: "no_session" }, 401, expiredSessionCookie());
	}

	const allowed = await session.allowRequest(Date.now());
	if (!allowed.ok) return rateLimited(allowed.retryAfter);

	const message = await readMessage(request);
	if (!message) return json({ error: "bad_request" }, 400);

	const headers = new Headers({
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-cache",
	});
	if (activity.refreshCookie) headers.set("set-cookie", sessionCookie(id));
	return new Response(await session.chat(message), { headers });
}

export function rateLimited(retryAfter: number): Response {
	return Response.json(
		{ error: "rate_limited", retryAfter },
		{ status: 429, headers: { "retry-after": String(retryAfter) } },
	);
}

async function readMessage(request: Request): Promise<string | null> {
	try {
		const body: unknown = await request.json();
		const message =
			typeof body === "object" && body !== null
				? (body as { message?: unknown }).message
				: undefined;
		if (typeof message !== "string") return null;
		const trimmed = message.trim();
		return trimmed && trimmed.length <= MAX_MESSAGE_LENGTH ? trimmed : null;
	} catch {
		return null;
	}
}
