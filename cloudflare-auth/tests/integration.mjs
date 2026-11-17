import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {exportJWK, generateKeyPair, SignJWT} from 'jose';
import {chromium} from '@playwright/test';
const origin='http://localhost:8788';
const mail=[];let mailFailure=false;let invalidReceipt=false;
const googleClientId='local-google-client';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const googleKey={...await exportJWK(publicKey),kid:'local-google-key',alg:'RS256',use:'sig'};
let googleChallenge;
const mf=new Miniflare(convertV4MiniflareOptions({port:8788,host:"127.0.0.1",workers:[{rootPath:fileURLToPath(new URL('../',import.meta.url)),modules:[{type:'ESModule',path:fileURLToPath(new URL('../.test-build/index.js',import.meta.url))}],compatibilityDate:'2026-11-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{BETTER_AUTH_SECRET:'local-only-test-secret-at-least-32-characters',BETTER_AUTH_URL:origin,EMAIL_FROM:'Maker Quest <test@example.test>',RESEND_API_KEY:'local-test-only',GOOGLE_CLIENT_ID:googleClientId,GOOGLE_CLIENT_SECRET:'local-google-secret'},outboundService:async request=>{
 const {hostname}=new URL(request.url);
 if(hostname==='oauth2.googleapis.com'){
  const body=new URLSearchParams(await request.text());
  assert.equal(body.get('code'),'local-google-code');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.get('code_verifier')));
  assert.equal(Buffer.from(digest).toString('base64url'),googleChallenge);
  const idToken=await new SignJWT({name:'Google Maker',email:'google@example.test',email_verified:true})
   .setProtectedHeader({alg:'RS256',kid:googleKey.kid}).setIssuer('https://accounts.google.com')
   .setAudience(googleClientId).setSubject('local-google-user').setIssuedAt().setExpirationTime('5m').sign(privateKey);
  return Response.json({id_token:idToken,access_token:'local-google-access',token_type:'Bearer',expires_in:3600});
 }
 if(hostname==='www.googleapis.com')return Response.json({keys:[googleKey]});
 assert.equal(hostname,'api.resend.com');if(invalidReceipt)return Response.json({});mail.push(await request.json());if(mailFailure)return new Response(JSON.stringify({name:'validation_error',message:'You can only send testing emails to your own email address.'}),{status:403,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify({id:'mock-mail'}),{headers:{'Content-Type':'application/json'}});
}}]}));
try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0001_auth_schema.sql','0002_progress.sql','0003_passkeys.sql']){
  const sql=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
  for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 }
 async function call(path,data,cookie='',method='POST',requestOrigin=origin){
  const r=await mf.dispatchFetch(origin+path,{redirect:'manual',method:data?method:'GET',headers:{Origin:requestOrigin,'Content-Type':'application/json',Cookie:cookie},...(data?{body:JSON.stringify(data)}:{})});
  const text=await r.text();let result;try{result=JSON.parse(text)}catch{result=text}return {status:r.status,result,cookie:r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; '),headers:r.headers};
 }
 mailFailure=true;
 const failed=await call('/api/auth/sign-up/email',{name:'Rejected Mail',email:'rejected@example.test',password:'Strong-test-password-17'});
 assert.equal(failed.status,502);assert.equal(failed.result.code,'EMAIL_TEST_RECIPIENT_RESTRICTED');assert.equal(failed.result.emailSent,false);
 assert.equal((await call('/api/auth/send-verification-email',{email:'rejected@example.test'})).status,502);
 assert.equal((await call('/api/auth/request-password-reset',{email:'rejected@example.test'})).status,502);
 console.log('PASS Resend 403 propagates to registration, resend and recovery despite Better Auth swallowing exceptions');
 mailFailure=false;mail.length=0;
 invalidReceipt=true;
 const missingReceipt=await call('/api/auth/send-verification-email',{email:'rejected@example.test'});
 assert.equal(missingReceipt.status,502);assert.equal(missingReceipt.result.code,'EMAIL_PROVIDER_INVALID_RECEIPT');
 invalidReceipt=false;
 const social=await call('/api/auth/sign-in/social',{provider:'google',callbackURL:origin+'/account.html'});
 assert.equal(social.status,200);
 const authorization=new URL(social.result.url);
 assert.equal(authorization.hostname,'accounts.google.com');
 assert.equal(authorization.searchParams.get('redirect_uri'),origin+'/api/auth/callback/google');
 googleChallenge=authorization.searchParams.get('code_challenge');
 assert.ok(googleChallenge);
 const state=authorization.searchParams.get('state');assert.ok(state);
 const callback=await call('/api/auth/callback/google?'+new URLSearchParams({code:'local-google-code',state}),null,social.cookie);
 assert.equal(callback.status,302);
 assert.equal(callback.headers.get('location'),origin+'/account.html');
 const googleSession=await call('/api/auth/get-session',null,callback.cookie);
 assert.equal(googleSession.result.user.emailVerified,true);
 assert.equal(googleSession.result.user.email,'google@example.test');
 assert.equal(await db.prepare("SELECT providerId FROM account WHERE userId = ?").bind(googleSession.result.user.id).first('providerId'),'google');
 assert.equal(mail.length,0);
 console.log('PASS mocked Google OAuth callback, PKCE, D1 account and verified session without email');

 const signup=await call('/api/auth/sign-up/email',{name:'Test Maker',email:'maker@example.test',password:'Strong-test-password-17',callbackURL:origin+'/account.html'});
 assert.equal(signup.status,200,JSON.stringify(signup.result));assert.equal(signup.result.token,null);assert.equal(signup.result.emailStatus,'accepted');assert.equal(mail.length,1);console.log('PASS registration sends verification through mocked Resend');
 assert.equal((await call('/api/auth/sign-in/email',{email:'maker@example.test',password:'Strong-test-password-17'})).status,403);console.log('PASS unverified login blocked');
 const verifyURL=new URL(mail[0].text.match(/https?:\/\/\S+/)[0]);
 const verification=await call(verifyURL.pathname+verifyURL.search);assert.equal(verification.status,302);let cookie=verification.cookie;
 const login=await call('/api/auth/sign-in/email',{email:'maker@example.test',password:'Strong-test-password-17'});assert.equal(login.status,200,JSON.stringify(login.result));cookie=login.cookie;
 assert.ok(cookie);assert.equal((await call('/api/auth/get-session',null,cookie)).result.user.emailVerified,true);console.log('PASS verification, login and persistent cookie session');
 assert.equal((await call('/api/progress',{badges:['robotics']},cookie,'PUT')).status,200);
 assert.deepEqual((await call('/api/progress',null,cookie)).result.badges,['robotics']);
 await call('/api/progress',{badges:['racing']},cookie,'PUT');assert.deepEqual((await call('/api/progress',null,cookie)).result.badges,['racing','robotics']);
 assert.equal((await call('/api/progress',{badges:['fake']},cookie,'PUT')).status,400);
 assert.equal((await call('/api/progress',{badges:['art']},cookie,'PUT','https://evil.test')).status,403);console.log('PASS saved badges, concurrent merge, invalid badge and cross-origin rejection');
 for(const game of ['bot-battle','power-racers']){assert.equal((await call('/api/scores',{game,score:200},cookie)).status,200);await call('/api/scores',{game,score:100},cookie);const scores=(await call('/api/leaderboard?game='+game,null,cookie)).result.scores;assert.equal(scores[0].score,200);assert.equal(scores[0].name,'Test Maker')}
 assert.equal((await call('/api/scores',{game:'bot-battle',score:100001},cookie)).status,400);console.log('PASS both hourly leaderboards, best-score retention and bounds');
 await call('/api/auth/sign-up/email',{name:'Other Maker',email:'other@example.test',password:'Other-test-password-17'});
 const otherURL=new URL(mail.at(-1).text.match(/https?:\/\/\S+/)[0]);await call(otherURL.pathname+otherURL.search);
 const other=await call('/api/auth/sign-in/email',{email:'other@example.test',password:'Other-test-password-17'});
 assert.deepEqual((await call('/api/progress',null,other.cookie)).result.badges,[]);console.log('PASS progress isolated between accounts');
 const oldCookie=cookie;assert.equal((await call('/api/auth/sign-out',{},cookie)).status,200);assert.equal((await call('/api/auth/get-session',null,oldCookie)).result,null);assert.equal((await call('/api/progress',null,oldCookie)).status,401);console.log('PASS logout invalidates session and protects progress');
 const relogin=await call('/api/auth/sign-in/email',{email:'maker@example.test',password:'Strong-test-password-17'});cookie=relogin.cookie;assert.equal((await call('/api/progress',null,cookie)).result.badges.length,2);console.log('PASS progress persists after logout and login');
 await call('/api/auth/request-password-reset',{email:'maker@example.test',redirectTo:origin+'/account.html'});
 const resetLink=new URL(mail.at(-1).text.match(/https?:\/\/\S+/)[0]);const resetRedirect=await call(resetLink.pathname+resetLink.search);const token=new URL(resetRedirect.headers.get('location')).searchParams.get('token');assert.ok(token);
 const reset=await call('/api/auth/reset-password',{token,newPassword:'New-password-test-17'});assert.equal(reset.status,200,JSON.stringify(reset.result));
 assert.equal((await call('/api/auth/get-session',null,cookie)).result,null);
 assert.equal((await call('/api/auth/sign-in/email',{email:'maker@example.test',password:'Strong-test-password-17'})).status,401);
 const recovered=await call('/api/auth/sign-in/email',{email:'maker@example.test',password:'New-password-test-17'});assert.equal(recovered.status,200);assert.equal((await call('/api/progress',null,recovered.cookie)).result.badges.length,2);
 assert.notEqual((await call('/api/auth/reset-password',{token,newPassword:'Again-password-test-17'})).status,200);console.log('PASS password recovery, old password/session revoked, single-use token, saved progress retained');
 assert.equal((await call('/api/progress')).status,401);assert.equal((await call('/api/leaderboard?game=bot-battle')).status,401);
 console.log('PASS anonymous access denied');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/account.html');await page.locator('#email-options summary').click();
  mailFailure=true;await page.locator('#email').fill('ui-failure@example.test');await page.locator('#password').fill('Strong-test-password-17');await page.locator('#register').click();await page.getByRole('status').filter({hasText:'Verification email was not sent'}).waitFor();mailFailure=false;console.log('PASS browser displays provider rejection instead of check-inbox success');
  await page.locator('#email').fill('maker@example.test');await page.locator('#password').fill('New-password-test-17');await page.locator('#login').click();await page.getByRole('status').filter({hasText:'Signed in as'}).waitFor();
  await page.reload();await page.getByRole('status').filter({hasText:'Signed in as'}).waitFor();
  await page.goto(origin+'/companion.html');await page.locator('#toast').filter({hasText:'Progress loaded'}).waitFor();await page.locator('[data-tab="passport"]').click();assert.equal(await page.locator('#progress').textContent(),'2 / 4 badges');
  await page.locator('[data-tab="challenges"]').click();await page.getByRole('button',{name:'Earn demo badge'}).first().click();await page.locator('#toast').filter({hasText:'Badges saved'}).waitFor();await page.reload();await page.locator('#toast').filter({hasText:'Progress loaded'}).waitFor();assert.equal(await page.locator('#progress').textContent(),'3 / 4 badges');
  await page.goto(origin+'/bot-battle.html');await page.locator('#leaders').filter({hasText:'Test Maker'}).waitFor();
  await page.goto(origin+'/power-racers.html');await page.locator('#raceLeaders').filter({hasText:'Test Maker'}).waitFor();
  await page.goto(origin+'/account.html');await page.locator('#logout').click();await page.getByRole('status').filter({hasText:'Signed out'}).waitFor();await page.goto(origin+'/companion.html');await page.locator('#toast').filter({hasText:'Sign in'}).waitFor();assert.equal(await page.locator('#mapClaim').isDisabled(),true);

  async function authenticator(tab){
   const protocol=await tab.context().newCDPSession(tab);
   await protocol.send('WebAuthn.enable');
   const {authenticatorId}=await protocol.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,
    isUserVerified:true,automaticPresenceSimulation:true,
   }});
   return {protocol,authenticatorId};
  }
  const first=await browser.newPage();first.on('pageerror',e=>errors.push(e.message));
  const firstDevice=await authenticator(first);
  await first.goto(origin+'/account.html');
  await first.locator('#passkey-name').fill('Passkey Maker');
  await first.getByRole('button',{name:'Create account with a passkey'}).click();
  await first.locator('#passkey-code-list').waitFor();
  const codes=(await first.locator('#passkey-code-list').textContent()).split('\n');
  assert.equal(codes.length,8);assert.equal(new Set(codes).size,8);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM passkey_recovery WHERE code_hash = ?').bind(codes[0]).first('n'),0);
  await first.getByRole('button',{name:'I saved my codes'}).click();
  await first.getByRole('button',{name:'Sign in with a passkey'}).click();
  await first.getByRole('status').filter({hasText:'Signed in as Passkey Maker'}).waitFor();
  const passkeyUser=await first.request.get(origin+'/api/auth/get-session').then(r=>r.json());
  assert.equal(passkeyUser.user.emailVerified,false);
  assert.equal((await first.request.put(origin+'/api/progress',{data:{badges:['art']},headers:{Origin:origin}})).status(),200);
  await firstDevice.protocol.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:firstDevice.authenticatorId});
  await authenticator(first);
  await first.getByRole('button',{name:'Add a backup passkey'}).click();
  await first.getByRole('status').filter({hasText:'Backup passkey added'}).waitFor();
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM passkey WHERE userId = ?').bind(passkeyUser.user.id).first('n'),2);

  const replacement=await browser.newPage();replacement.on('pageerror',e=>errors.push(e.message));
  await authenticator(replacement);
  await replacement.goto(origin+'/account.html');
  await replacement.getByText('Use a recovery code').click();
  await replacement.locator('#passkey-code').fill(codes[0]);
  await replacement.getByRole('button',{name:'Replace your passkeys'}).click();
  await replacement.getByRole('status').filter({hasText:'Your old passkeys were replaced'}).waitFor();
  assert.equal((await first.request.get(origin+'/api/progress')).status(),401);
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM passkey WHERE userId = ?').bind(passkeyUser.user.id).first('n'),1);
  const repeated=await call('/api/passkey/start',{code:codes[0]});
  assert.equal(repeated.status,400);
  assert.equal((await call('/api/passkey/start',{name:'Rejected'},'','POST','https://other.test')).status,403);
  await replacement.getByRole('button',{name:'Sign in with a passkey'}).click();
  await replacement.getByRole('status').filter({hasText:'Signed in as Passkey Maker'}).waitFor();
  assert.deepEqual(await replacement.request.get(origin+'/api/progress').then(r=>r.json()),{badges:['art']});
  await first.close();
  await replacement.close();
  console.log('PASS Chromium passkey signup, sign-in, backup, one-time recovery, old session revocation and saved progress');
  assert.deepEqual(errors,[]);console.log('PASS Chromium login, reload persistence, badge claim/reload, both leaderboard displays, logout and passport lock');
 } finally {await browser.close()}
 console.log('ALL LOCAL INTEGRATION AND BROWSER CHECKS PASSED. Resend and Google provider responses mocked.');
}finally{await mf.dispose()}
