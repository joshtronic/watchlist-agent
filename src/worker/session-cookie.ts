const COOKIE_NAME = "wl_session";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// 16 random bytes in unpadded base64url.
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function newSessionId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

export function readSessionId(request: Request): string | null {
	const header = request.headers.get("cookie");
	if (!header) return null;

	for (const pair of header.split(";")) {
		const [name, value] = pair.trim().split("=", 2);
		if (name === COOKIE_NAME) {
			return value && ID_PATTERN.test(value) ? value : null;
		}
	}
	return null;
}

export function sessionCookie(id: string): string {
	return cookie(id, ONE_YEAR_SECONDS);
}

export function expiredSessionCookie(): string {
	return cookie("", 0);
}

function cookie(value: string, maxAge: number): string {
	return [
		`${COOKIE_NAME}=${value}`,
		"Path=/",
		`Max-Age=${maxAge}`,
		"HttpOnly",
		"Secure",
		"SameSite=Lax",
	].join("; ");
}
