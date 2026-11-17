
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Isolated, same-origin staging-only authentication test page.
const authTestHtml = "\n<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Maker Quest — Authentication Test</title>\n  <style>\n    body {\n      font-family: system-ui, sans-serif;\n      background: #111827;\n      color: white;\n      display: grid;\n      place-items: center;\n      min-height: 100vh;\n      margin: 0;\n    }\n    main {\n      width: min(400px, 90%);\n      background: #1f2937;\n      padding: 28px;\n      border-radius: 16px;\n    }\n    h1 { margin-top: 0; }\n    input, button {\n      box-sizing: border-box;\n      width: 100%;\n      padding: 12px;\n      margin: 8px 0;\n      border-radius: 8px;\n      font: inherit;\n    }\n    input { border: 1px solid #9ca3af; }\n    button {\n      border: 0;\n      background: #60a5fa;\n      color: #111827;\n      font-weight: bold;\n      cursor: pointer;\n    }\n    button:disabled { opacity: .5; cursor: wait; }\n    #status {\n      white-space: pre-wrap;\n      overflow-wrap: anywhere;\n      line-height: 1.5;\n    }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>Maker Quest</h1>\n    <p>Staging authentication test only</p>\n\n    <form id=\"authForm\">\n      <input id=\"name\" placeholder=\"Your name\"\n             autocomplete=\"name\" required>\n      <input id=\"email\" type=\"email\" placeholder=\"Gmail address\"\n             autocomplete=\"email\" required>\n      <input id=\"password\" type=\"password\"\n             placeholder=\"Password (8+ characters)\"\n             autocomplete=\"new-password\"\n             minlength=\"8\" required>\n\n      <button id=\"signup\" type=\"submit\">Create Test Account</button>\n      <button id=\"signin\" type=\"button\">Sign In</button>\n      <button id=\"session\" type=\"button\">Check Session</button>\n    </form>\n\n    <p id=\"status\" role=\"status\" aria-live=\"polite\">\n      Ready for testing.\n    </p>\n  </main>\n\n  <script>\n    const API =\n      \"https://maker-quest-auth-staging.racerblur.workers.dev/api/auth\";\n\n    const status = document.getElementById(\"status\");\n    const form = document.getElementById(\"authForm\");\n\n    async function request(path, data) {\n      status.textContent = \"Contacting staging server...\";\n\n      try {\n        const response = await fetch(API + path, {\n          method: data ? \"POST\" : \"GET\",\n          headers: { \"Content-Type\": \"application/json\" },\n          credentials: \"include\",\n          ...(data ? { body: JSON.stringify(data) } : {})\n        });\n\n        const result = await response.json();\n\n        if (!response.ok) {\n          status.textContent =\n            \"Request failed: \" +\n            (result.message || result.error || response.status);\n          return;\n        }\n\n        if (path === \"/sign-up/email\") {\n          status.textContent =\n            \"Registration submitted. Check Gmail and Resend \" +\n            \"for a verification email.\";\n        } else if (path === \"/get-session\") {\n          status.textContent = result?.user\n            ? \"Signed in as \" + result.user.email +\n              \"\\nEmail verified: \" + result.user.emailVerified\n            : \"No active session.\";\n        } else {\n          status.textContent = \"Request succeeded.\";\n        }\n      } catch (error) {\n        status.textContent =\n          \"Network or CORS error: \" + error.message;\n      }\n    }\n\n    form.addEventListener(\"submit\", (event) => {\n      event.preventDefault();\n\n      request(\"/sign-up/email\", {\n        name: document.getElementById(\"name\").value,\n        email: document.getElementById(\"email\").value,\n        password: document.getElementById(\"password\").value\n      });\n    });\n\n    document.getElementById(\"signin\").onclick = () => {\n      request(\"/sign-in/email\", {\n        email: document.getElementById(\"email\").value,\n        password: document.getElementById(\"password\").value\n      });\n    };\n\n    document.getElementById(\"session\").onclick = () => {\n      request(\"/get-session\");\n    };\n  </script>\n</body>\n</html>\n";

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
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/auth-test") {
      return new Response(authTestHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }

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

    if (!url.pathname.startsWith("/api/auth/")) {
      return new Response("Not found", { status: 404 });
    }

    return authFor(env).handler(request);
  },
};
