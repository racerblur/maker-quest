import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

const recoveryCodeCount = 8;
const registrationLifetime = 5 * 60;

type Enrollment = {
  challenge: string;
  user_id: string;
  name: string;
  recovery_hash: string | null;
};

export const passkeyOrigin = (baseURL: string) => new URL(baseURL).origin;
export const passkeyEmail = (id: string) => `passkey-${id}@accounts.maker-quest.invalid`;

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function json(value: unknown, status = 200) {
  return Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}

async function start(db: D1Database, origin: string, body: {name?: unknown; code?: unknown}) {
  let userId = crypto.randomUUID();
  let name = typeof body.name === 'string' ? body.name.trim() : '';
  let recoveryHash: string | null = null;
  if (body.code !== undefined) {
    if (typeof body.code !== 'string' || !/^[\w-]{32}$/.test(body.code.trim())) {
      return json({message:'Invalid or used recovery code.'}, 400);
    }
    recoveryHash = await digest(body.code.trim());
    const account = await db.prepare(
      'SELECT user.id, user.name FROM passkey_recovery JOIN user ON user.id = user_id WHERE code_hash = ?'
    ).bind(recoveryHash).first<{id:string; name:string}>();
    if (!account) return json({message:'Invalid or used recovery code.'}, 400);
    userId = account.id;
    name = account.name;
  } else if (name.length < 1 || name.length > 80) {
    return json({message:'Enter a display name of up to 80 characters.'}, 400);
  }

  const options = await generateRegistrationOptions({
    rpName: 'Maker Quest staging',
    rpID: new URL(origin).hostname,
    userID: Uint8Array.from(new TextEncoder().encode(userId)),
    userName: name,
    attestationType: 'none',
    authenticatorSelection: {residentKey:'required', userVerification:'required'},
    timeout: 60000,
  });
  const flowToken = randomToken();
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('DELETE FROM passkey_enrollment WHERE expires_at <= ?').bind(now),
    db.prepare('INSERT INTO passkey_enrollment VALUES (?, ?, ?, ?, ?, ?)')
      .bind(await digest(flowToken), options.challenge, userId, name, recoveryHash, now + registrationLifetime),
  ]);
  return json({options, flowToken});
}

async function finish(db: D1Database, origin: string, body: {flowToken?: unknown; response?: RegistrationResponseJSON}) {
  if (typeof body.flowToken !== 'string' || !/^[\w-]{32}$/.test(body.flowToken) || !body.response) {
    return json({message:'Start passkey setup again.'}, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const enrollment = await db.prepare(
    'DELETE FROM passkey_enrollment WHERE id = ? AND expires_at > ? RETURNING challenge, user_id, name, recovery_hash'
  ).bind(await digest(body.flowToken), now).first<Enrollment>();
  if (!enrollment) return json({message:'Passkey setup expired. Start again.'}, 400);

  const result = await verifyRegistrationResponse({
    response:body.response,
    expectedChallenge:enrollment.challenge,
    expectedOrigin:origin,
    expectedRPID:new URL(origin).hostname,
    requireUserVerification:true,
  }).catch(() => null);
  if (!result?.verified || !result.registrationInfo) {
    return json({message:'Could not verify the new passkey. Start again.'}, 400);
  }

  const {credential, credentialDeviceType, credentialBackedUp, aaguid} = result.registrationInfo;
  const {user_id:userId, name, recovery_hash:recoveryHash} = enrollment;
  const passkeyId = crypto.randomUUID();
  const values = [passkeyId, 'Passkey', btoa(String.fromCharCode(...credential.publicKey)), userId,
    credential.id, credential.counter, credentialDeviceType, Number(credentialBackedUp),
    credential.transports?.join(',') ?? null, now, aaguid];
  const columns = 'id, name, publicKey, userId, credentialID, counter, deviceType, backedUp, transports, createdAt, aaguid';
  const placeholders = '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?';

  if (recoveryHash) {
    // D1 executes the batch atomically. Only the first valid redemption can insert a replacement.
    const [insert] = await db.batch([
      db.prepare(`INSERT INTO passkey (${columns}) SELECT ${placeholders}
        WHERE EXISTS (SELECT 1 FROM passkey_recovery WHERE code_hash = ? AND user_id = ?)`)
        .bind(...values, recoveryHash, userId),
      db.prepare('DELETE FROM session WHERE userId = ? AND EXISTS (SELECT 1 FROM passkey WHERE id = ?)')
        .bind(userId, passkeyId),
      db.prepare('DELETE FROM passkey WHERE userId = ? AND id <> ? AND EXISTS (SELECT 1 FROM passkey WHERE id = ?)')
        .bind(userId, passkeyId, passkeyId),
      db.prepare('DELETE FROM passkey_recovery WHERE code_hash = ? AND EXISTS (SELECT 1 FROM passkey WHERE id = ?)')
        .bind(recoveryHash, passkeyId),
    ]);
    if (!insert.meta.changes) return json({message:'Invalid or used recovery code.'}, 400);
    return json({recovered:true});
  }

  const recoveryCodes = Array.from({length:recoveryCodeCount}, randomToken);
  const hashes = await Promise.all(recoveryCodes.map(digest));
  await db.batch([
    db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)')
      .bind(userId, name, passkeyEmail(userId), now, now),
    db.prepare(`INSERT INTO passkey (${columns}) VALUES (${placeholders})`).bind(...values),
    ...hashes.map(hash => db.prepare('INSERT INTO passkey_recovery (code_hash, user_id) VALUES (?, ?)').bind(hash, userId)),
  ]);
  return json({recoveryCodes});
}

export async function passkeyEnrollment(request: Request, db: D1Database, origin: string) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'POST') return json({message:'Method not allowed.'}, 405);
  if (request.headers.get('Origin') !== origin) return json({message:'Origin not allowed.'}, 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return json({message:'Expected a JSON request.'}, 415);
  }
  const body = await request.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({message:'Invalid request.'}, 400);
  if (path === '/api/passkey/start') return start(db, origin, body);
  if (path === '/api/passkey/finish') return finish(db, origin, body);
  return json({message:'Not found.'}, 404);
}
