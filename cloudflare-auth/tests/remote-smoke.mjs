// Requires a synthetic staging account with email already verified. Never use production credentials.
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='https://maker-quest-auth-staging.racerblur.workers.dev';
const user=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.ok(user.email.endsWith('@example.invalid'),'Synthetic accounts only');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({ignoreHTTPSErrors:process.env.TEST_IGNORE_HTTPS_ERRORS==='1'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/account.html');await page.locator('#email-options summary').click();await page.locator('#email').fill(user.email);await page.locator('#password').fill(user.password);await page.locator('#login').click();await page.locator('#status').filter({hasText:'Signed in as'}).waitFor();
 await page.reload();await page.locator('#status').filter({hasText:'Signed in as'}).waitFor();assert.equal(await page.locator('#form').isVisible(),false);assert.equal(await page.locator('#google').isVisible(),false);await page.getByRole('link',{name:'Open Maker Passport →'}).waitFor();console.log('PASS deployed login, reload persistence and clear signed-in UI');
 await page.goto(base+'/companion.html');await page.locator('#toast').filter({hasText:'Progress loaded'}).waitFor();await page.locator('[data-tab="challenges"]').click();
 const claim=page.getByRole('button',{name:'Earn demo badge'});if(await claim.count()){await claim.first().click();await page.locator('#toast').filter({hasText:'Badges saved'}).waitFor()}
 await page.reload();await page.locator('#toast').filter({hasText:'Progress loaded'}).waitFor();assert.notEqual(await page.locator('#progress').textContent(),'0 / 4 badges');console.log('PASS deployed passport claim and reload');
 for(const game of ['bot-battle','power-racers']){
  const result=await page.evaluate(async game=>{const r=await fetch('/api/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game,score:123})});return {status:r.status}},game);assert.equal(result.status,200);
  await page.goto(base+'/'+game+'.html');await page.locator(game==='bot-battle'?'#leaders':'#raceLeaders').filter({hasText:user.name}).waitFor();
 }
 console.log('PASS deployed score API and both leaderboard displays (synthetic API scores; no full rounds played)');
 await page.goto(base+'/account.html');await page.locator('#logout').click();await page.locator('#status').filter({hasText:'Signed out'}).waitFor();
 assert.equal(await page.evaluate(async()=> (await fetch('/api/progress')).status),401);await page.reload();await page.locator('#status').filter({hasText:'Signed out'}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS deployed logout, anonymous access denial and no browser JavaScript errors');
}finally{await browser.close()}
