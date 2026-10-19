import { DurableObject } from "cloudflare:workers";

export class SessionDO extends DurableObject<Env> {
	async ping(): Promise<string> {
		return "pong";
	}
}
