const $ = id => document.getElementById(id);
const status = $('status');
async function api(path, data) {
  const response = await fetch('/api/auth/' + path, {method:data?'POST':'GET', credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Request failed');
  return result;
}
async function run(fn){try{await fn()}catch(error){status.textContent=error.message}}
async function session(){const result=await api('get-session');status.textContent=result?.user?'Signed in as '+result.user.email+' · Verified: '+result.user.emailVerified:'Signed out';}
const credentials=()=>({email:$('email').value,password:$('password').value});
$('form').onsubmit=e=>{e.preventDefault();run(async()=>{await api('sign-in/email',credentials());await session()})};
$('register').onclick=()=>run(async()=>{if(!$('form').reportValidity())return;await api('sign-up/email',{...credentials(),name:$('name').value||'Maker',callbackURL:location.origin+'/account.html'});status.textContent='Registration submitted. Check your inbox. Delivery is not confirmed by this response.'});
$('resend').onclick=()=>run(async()=>{await api('send-verification-email',{email:$('email').value,callbackURL:location.origin+'/account.html'});status.textContent='Verification requested. Check your inbox.'});
$('recover').onclick=()=>run(async()=>{await api('request-password-reset',{email:$('email').value,redirectTo:location.origin+'/account.html'});status.textContent='If the account exists, a reset email has been requested.'});
const token=new URLSearchParams(location.search).get('token');
if(token){$('reset').hidden=false;$('login').hidden=true;}
$('reset').onclick=()=>run(async()=>{await api('reset-password',{token,newPassword:$('password').value});history.replaceState(null,'','/account.html');status.textContent='Password reset. Sign in with your new password.';$('reset').hidden=true;$('login').hidden=false});
$('logout').onclick=()=>run(async()=>{await api('sign-out',{});await session()});
$('google').onclick=()=>run(async()=>{const result=await api('sign-in/social',{provider:'google',callbackURL:location.origin+'/account.html'});if(result.url)location.assign(result.url)});
run(async()=>{const config=await(await fetch('/api/config')).json();$('google').disabled=!config.google;for(const id of ['register','login','resend','recover'])$(id).disabled=!config.email;$('configuration').textContent=[!config.google?'Google sign-in needs OAuth configuration.':'',!config.email?'Email sign-in needs a verified sender.':'',config.restrictedEmailSender?'Resend test sender: delivery is restricted to the Resend account owner.':''].filter(Boolean).join(' ');await session()});
