import { json, sessionStub } from "./http";
import {
	expiredSessionCookie,
	newSessionId,
	readSessionId,
	sessionCookie,
} from "./session-cookie";
import { verifyTurnstile } from "./turnstile";

export async function createSession(
	request: Request,
	env: Env,
): Promise<Response> {
	const body = await readJsonObject(request);
	if (!body || typeof body.turnstileToken !== "string") {
		return json({ error: "bad_request" }, 400);
	}
	if (body.acceptedDisclaimer !== true) {
		return json({ error: "disclaimer_required" }, 403);
	}

	const turnstile = await verifyTurnstile({
		token: body.turnstileToken,
		secret: env.TURNSTILE_SECRET_KEY,
		remoteIp: request.headers.get("cf-connecting-ip"),
	});
	if (turnstile === "failed") {
		return json({ error: "turnstile_failed" }, 403);
	}
	if (turnstile === "unavailable") {
		return json({ error: "turnstile_unavailable" }, 503);
	}

	const id = newSessionId();
	await sessionStub(env, id).create(Date.now());
	return json({ watchlist: [] }, 200, sessionCookie(id));
}

export async function getSession(
	request: Request,
	env: Env,
): Promise<Response> {
	const id = readSessionId(request);
	if (!id) return json({ error: "no_session" }, 401);

	const session = sessionStub(env, id);
	const activity = await session.touch(Date.now());
	if (!activity) {
		return json({ error: "no_session" }, 401, expiredSessionCookie());
	}

	const cookie = activity.refreshCookie ? sessionCookie(id) : undefined;
	return json({ watchlist: await session.getWatchlist() }, 200, cookie);
}

export async function deleteSession(
	request: Request,
	env: Env,
): Promise<Response> {
	const id = readSessionId(request);
	if (id) await sessionStub(env, id).destroy();

	return new Response(null, {
		status: 204,
		headers: { "set-cookie": expiredSessionCookie() },
	});
}

async function readJsonObject(
	request: Request,
): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return typeof body === "object" && body !== null && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}
