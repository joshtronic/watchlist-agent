export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/api/health") {
			return Response.json({ ok: true, commit: env.GIT_COMMIT || "unknown" });
		}

		return Response.json({ error: "not_found" }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
