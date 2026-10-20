import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				plugins: [
					cloudflareTest({
						wrangler: { configPath: "./wrangler.jsonc" },
						// Tests inject a fake AI client; never reach Cloudflare.
						remoteBindings: false,
						// Never let tests see real secrets from .dev.vars.
						miniflare: {
							bindings: {
								ALPACA_API_KEY: "test-alpaca-key",
								ALPACA_SECRET_KEY: "test-alpaca-secret",
								TURNSTILE_SECRET_KEY: "test-turnstile-secret",
							},
						},
					}),
				],
				test: { name: "worker", include: ["test/worker/**/*.test.ts"] },
			},
			{
				test: {
					name: "client",
					environment: "happy-dom",
					include: ["test/client/**/*.test.ts"],
				},
			},
		],
	},
});
