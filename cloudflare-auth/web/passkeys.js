const webauthn = window.SimpleWebAuthnBrowser;
const passkeySupported = !!window.PublicKeyCredential && !!webauthn;

async function enrollmentRequest(path, data) {
  const response = await fetch('/api/passkey/' + path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Passkey setup failed.');
  return result;
}

function passkeyAction(button, task) {
  return run(async () => {
    if (!passkeySupported) throw new Error('This browser cannot use passkeys.');
    button.disabled = true;
    try {
      await task();
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        throw new Error('The passkey prompt was canceled or timed out. Please try again.');
      }
      throw error;
    } finally {
      button.disabled = false;
    }
  });
}

async function enrollPasskey(data) {
  const {options, flowToken} = await enrollmentRequest('start', data);
  const response = await webauthn.startRegistration({optionsJSON: options});
  return enrollmentRequest('finish', {flowToken, response});
}

$('passkey-form').onsubmit = event => {
  event.preventDefault();
  return passkeyAction(event.submitter, async () => {
    const result = await enrollPasskey({name: $('passkey-name').value});
    $('passkey-code-list').textContent = result.recoveryCodes.join('\n');
    $('passkey-codes').hidden = false;
    $('signed-out').hidden = true;
    $('passkey-codes-done').focus();
    status.textContent = 'Your passkey is ready. Save your recovery codes before signing in.';
  });
};

$('passkey-codes-done').onclick = () => {
  $('passkey-code-list').textContent = '';
  $('passkey-codes').hidden = true;
  $('signed-out').hidden = false;
  $('passkey-login').focus();
  status.textContent = 'Sign in with the passkey you just created.';
};

$('passkey-login').onclick = event => passkeyAction(event.currentTarget, async () => {
  const options = await api('passkey/generate-authenticate-options');
  const response = await webauthn.startAuthentication({optionsJSON: options});
  await api('passkey/verify-authentication', {response});
  await session();
});

$('passkey-recovery-form').onsubmit = event => {
  event.preventDefault();
  return passkeyAction(event.submitter, async () => {
    await enrollPasskey({code: $('passkey-code').value});
    $('passkey-code').value = '';
    $('passkey-recovery').open = false;
    $('passkey-login').focus();
    status.textContent = 'Your old passkeys were replaced. Sign in with your new passkey.';
  });
};

$('passkey-backup').onclick = event => passkeyAction(event.currentTarget, async () => {
  const options = await api('passkey/generate-register-options');
  const response = await webauthn.startRegistration({optionsJSON: options});
  await api('passkey/verify-registration', {response, name:'Backup passkey'});
  status.textContent = 'Backup passkey added.';
});
