import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';
import { pages } from './pages.generated';

type AppEnv = Env & { BETTER_AUTH_SECRET: string; RESEND_API_KEY?: string; GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; EMAIL_FROM?: string };
const badges = ['robotics', 'workshop', 'art', 'racing'];
const games = ['bot-battle', 'power-racers'];
const json = (value: unknown, status = 200) => Response.json(value, {status, headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'}});

export function authFor(env: AppEnv) {
  async function send(to: string, subject: string, url: string) {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email sender is not configured');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: {Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({from: env.EMAIL_FROM, to: [to], subject, text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`}),
    });
    if (!response.ok) {
      // Do not log recipient addresses, tokens, links, or provider response bodies.
      console.error(JSON.stringify({event: 'auth_email_failed', status: response.status}));
      throw new Error(`Email delivery failed (${response.status})`);
    }
  }
  return betterAuth({
    database: drizzleAdapter(drizzle(env.DB, {schema}), {provider: 'sqlite', schema}),
    secret: env.BETTER_AUTH_SECRET, baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: !!(env.EMAIL_FROM && env.RESEND_API_KEY), requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user, url}) => send(user.email, 'Reset your Maker Quest password', url),
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true,
      sendVerificationEmail: async ({user, url}) => send(user.email, 'Verify your Maker Quest email', url),
    },
    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET},
    } : {},
    session: {expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24},
    advanced: {useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === 'https:'},
  });
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url), path = url.pathname;
    if (path === '/api/config') return json({
      google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
      restrictedEmailSender: !!env.EMAIL_FROM?.includes('@resend.dev'),
    });
    if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) return json({message: 'Staging authentication is not configured'}, 503);
    const auth = authFor(env);
    if (path.startsWith('/api/auth/')) return auth.handler(request);
    if (path.startsWith('/api/')) {
      if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(env.BETTER_AUTH_URL).origin) return json({message: 'Origin not allowed'}, 403);
      const session = await auth.api.getSession({headers: request.headers});
      if (!session?.user.emailVerified) return json({message: 'Sign in with a verified account'}, 401);
      const userId = session.user.id;
      if (path === '/api/progress' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT badge FROM badge WHERE userId = ? ORDER BY badge').bind(userId).all<{badge:string}>();
        return json({badges: rows.results.map(row => row.badge)});
      }
      if (path === '/api/progress' && request.method === 'PUT') {
        const data = await request.json() as {badges?: unknown};
        if (!Array.isArray(data.badges) || data.badges.length > 4 || data.badges.some(b => !badges.includes(b))) return json({message:'Invalid badges'}, 400);
        // Monotonic claims: concurrent devices cannot erase one another's badges.
        if (data.badges.length) await env.DB.batch(data.badges.map(b => env.DB.prepare('INSERT OR IGNORE INTO badge (userId, badge) VALUES (?, ?)').bind(userId, b)));
        return json({saved:true});
      }
      if (path === '/api/leaderboard' && request.method === 'GET') {
        const game = url.searchParams.get('game');
        if (!game || !games.includes(game)) return json({message:'Invalid game'}, 400);
        const rows = await env.DB.prepare('SELECT user.name, score.score FROM score JOIN user ON user.id = score.userId WHERE game = ? AND hour = ? ORDER BY score DESC, user.id LIMIT 10').bind(game, Math.floor(Date.now()/3600000)).all();
        return json({scores:rows.results, period:'Current hour', demo:true});
      }
      if (path === '/api/scores' && request.method === 'POST') {
        const data = await request.json() as {game:string; score:number};
        if (!games.includes(data.game) || !Number.isSafeInteger(data.score) || data.score < 0 || data.score > 100000) return json({message:'Invalid score'}, 400);
        await env.DB.prepare('INSERT INTO score (userId, game, hour, score) VALUES (?, ?, ?, ?) ON CONFLICT(userId, game, hour) DO UPDATE SET score = MAX(score, excluded.score)').bind(userId, data.game, Math.floor(Date.now()/3600000), data.score).run();
        return json({saved:true, demo:true});
      }
      return json({message:'Not found'}, 404);
    }
    const page = pages[path === '/' ? '/index.html' : path === '/auth-test' ? '/account.html' : path];
    if (page) return new Response(page.body, {headers:{'Content-Type':page.type, 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin'}});
    // Public media only, fixed upstream. Never proxy auth or arbitrary URLs.
    if (/^\/assets\/[a-zA-Z0-9/_.-]+\.(mp3|png)$/.test(path) && !path.includes('..')) return fetch(`https://maker-quest.pages.dev${path}`);
    return new Response('Not found', {status:404});
  },
} satisfies ExportedHandler<AppEnv>;
