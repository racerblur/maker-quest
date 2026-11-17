
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  STAGING_ORIGIN: string;
}

function authFor(env: Env) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.STAGING_ORIGIN],
    emailAndPassword: {
      enabled: true,
      // Email delivery must be configured before public registration.
      requireEmailVerification: true,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DB || !env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL || !env.STAGING_ORIGIN) {
      return new Response("Staging authentication is not configured", {
        status: 503,
      });
    }

    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/auth/")) {
      return new Response("Not found", { status: 404 });
    }

    return authFor(env).handler(request);
  },
};
