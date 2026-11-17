const $ = id => document.getElementById(id);
const status = $('status');
async function api(path, data) {
  const response = await fetch('/api/auth/' + path, {method:data?'POST':'GET', credentials:'same-origin',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Request failed');
  return result;
}
async function run(fn){try{await fn()}catch(error){status.textContent=error.message}}
async function session(){
 const result=await api('get-session'), signedIn=!!result?.user;
 $('signed-in').hidden=!signedIn; $('signed-out').hidden=signedIn; $('logout').hidden=!signedIn;
 const passkeyAccount=signedIn&&result.user.email===`passkey-${result.user.id}@accounts.maker-quest.invalid`;
 status.textContent=signedIn?'Signed in as '+(passkeyAccount?result.user.name:result.user.email):'Signed out';
 if(signedIn)HTMLFormElement.prototype.reset.call($('form'));
}
const credentials=()=>({email:$('email').value,password:$('password').value});
$('form').onsubmit=e=>{e.preventDefault();run(async()=>{await api('sign-in/email',credentials());await session()})};
$('register').onclick=()=>run(async()=>{if(!$('form').reportValidity())return;const result=await api('sign-up/email',{...credentials(),name:$('name').value||'Maker',callbackURL:location.origin+'/account.html'});status.textContent=result.emailStatus==='accepted'?'The email service accepted your verification email. Check your inbox and spam folder.':'No new verification email was confirmed. Try Resend verification email, or sign in with Google.'});
$('resend').onclick=()=>run(async()=>{const result=await api('send-verification-email',{email:$('email').value,callbackURL:location.origin+'/account.html'});status.textContent=result.emailStatus==='accepted'?'The email service accepted your verification email. Check your inbox and spam folder.':'If the account is eligible, a verification email has been requested.'});
$('recover').onclick=()=>run(async()=>{await api('request-password-reset',{email:$('email').value,redirectTo:location.origin+'/account.html'});status.textContent='If the account exists, a reset email has been requested.'});
const token=new URLSearchParams(location.search).get('token');
if(token){$('reset').hidden=false;$('login').hidden=true;$('email-options').open=true;$('email').required=false;$('password').autocomplete='new-password';}
$('reset').onclick=()=>run(async()=>{await api('reset-password',{token,newPassword:$('password').value});history.replaceState(null,'','/account.html');status.textContent='Password reset. Sign in with your new password.';$('reset').hidden=true;$('login').hidden=false});
$('logout').onclick=()=>run(async()=>{await api('sign-out',{});await session()});
$('google').onclick=()=>run(async()=>{
 $('google').disabled=true;$('google').textContent='Opening Google…';status.textContent='Taking you to Google to sign in…';
 try{const result=await api('sign-in/social',{provider:'google',callbackURL:location.origin+'/account.html',errorCallbackURL:location.origin+'/account.html?google=failed'});if(!result.url)throw new Error('Could not open Google. Please try again.');location.assign(result.url)}
 catch(error){$('google').disabled=false;$('google').textContent='Continue with Google';throw error}
});
run(async()=>{const config=await(await fetch('/api/config')).json();$('google').disabled=!config.google;for(const id of ['register','login','resend','recover'])$(id).disabled=!config.email;$('configuration').textContent=config.google?'':'Google sign-in is temporarily unavailable.';$('email-note').textContent=config.restrictedEmailSender?'Email sign-up and password reset are limited during staging. New users can create an account with a passkey.':!config.email?'Email sign-in is currently unavailable.':'';await session();if(new URLSearchParams(location.search).get('google')==='failed')status.textContent='Google sign-in did not complete. Please try again.'});
