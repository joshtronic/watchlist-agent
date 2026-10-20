export function json(body: unknown, status: number, cookie?: string): Response {
	const headers = new Headers();
	if (cookie) headers.set("set-cookie", cookie);
	return Response.json(body, { status, headers });
}

export function sessionStub(env: Env, id: string) {
	return env.SESSION.get(env.SESSION.idFromName(id));
}
