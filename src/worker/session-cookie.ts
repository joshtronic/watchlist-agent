export function newSessionId(): string {
	throw new Error("Not implemented");
}

export function readSessionId(_request: Request): string | null {
	throw new Error("Not implemented");
}

export function sessionCookie(_id: string): string {
	throw new Error("Not implemented");
}

export function expiredSessionCookie(): string {
	throw new Error("Not implemented");
}
