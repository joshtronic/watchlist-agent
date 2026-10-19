import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
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
	test: {
		include: ["test/worker/**/*.test.ts"],
	},
});
