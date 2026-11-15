import { betterAuth } from "better-auth";

interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  STAGING_ORIGIN: string;
}

function authFor(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.STAGING_ORIGIN],
    emailAndPassword: {
      enabled: true,
      // Do not deploy publicly until a real email sender and verification flow exist.
      requireEmailVerification: true,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL || !env.STAGING_ORIGIN) {
      return new Response("Staging authentication is not configured", { status: 503 });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/auth/")) {
      return new Response("Not found", { status: 404 });
    }
    // This API is intentionally not wired into the existing Supabase-backed site.
    return authFor(env).handler(request);
  },
};
