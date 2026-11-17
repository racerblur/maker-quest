
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

interface Env {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  STAGING_ORIGIN: string;
  RESEND_API_KEY: string;
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
    emailVerification: {
  sendOnSignUp: true,
  async sendVerificationEmail({ user, url }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Maker Quest <onboarding@resend.dev>",
        to: [user.email],
        subject: "Verify your Maker Quest email",
        text: `Welcome to Maker Quest!\n\nVerify your email address using this link:\n${url}\n\nIf you didn't request this, you can ignore this email.`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email failed: ${response.status}`);
    }
  },
},
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
  !env.BETTER_AUTH_SECRET ||
  !env.BETTER_AUTH_URL ||
  !env.STAGING_ORIGIN ||
  !env.RESEND_API_KEY
) {
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
