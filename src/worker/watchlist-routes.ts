import { json, sessionStub } from "./http";
import {
	expiredSessionCookie,
	readSessionId,
	sessionCookie,
} from "./session-cookie";

export async function applyStarter(
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
	const watchlist = await session.applyStarter();
	if (!watchlist) return json({ error: "watchlist_not_empty" }, 409, cookie);

	return json({ watchlist }, 200, cookie);
}
