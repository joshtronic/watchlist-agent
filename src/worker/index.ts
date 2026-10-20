import { postChat } from "./chat-routes";
import { createSession, deleteSession, getSession } from "./session-routes";
import { postTranscribe } from "./transcribe-routes";
import { applyStarter } from "./watchlist-routes";

export { SessionDO } from "./session-do";

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const route = `${request.method} ${url.pathname}`;

		switch (route) {
			case "GET /api/health":
				return Response.json({
					ok: true,
					commit: env.GIT_COMMIT || "unknown",
				});
			case "GET /api/config":
				return Response.json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
			case "POST /api/session":
				return createSession(request, env);
			case "GET /api/session":
				return getSession(request, env);
			case "DELETE /api/session":
				return deleteSession(request, env);
			case "POST /api/chat":
				return postChat(request, env);
			case "POST /api/transcribe":
				return postTranscribe(request, env);
			case "POST /api/watchlist/starter":
				return applyStarter(request, env);
			default:
				return Response.json({ error: "not_found" }, { status: 404 });
		}
	},
} satisfies ExportedHandler<Env>;
