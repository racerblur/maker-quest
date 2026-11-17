import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence, onAuthStateChanged,
  GoogleAuthProvider, signInWithPopup, signInAnonymously, linkWithPopup, signOut,
  connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc,
  updateDoc, collection, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

const emulated = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator');
const app = initializeApp(emulated ? { ...firebaseConfig, projectId: 'demo-maker-quest', apiKey: 'demo-key' } : firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);
// Emulator use is explicit AND restricted to loopback. Never accept a remote
// emulator URL from a query parameter, or send staging tokens to an emulator.
if (emulated) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
const $ = id => document.getElementById(id);
const accountPage = !!$('account-status');
const passport = window.makerQuestPassport;
const badgeIds = ['robotics', 'workshop', 'art', 'racing'];
let generation = 0, stop = () => {}, signedIn = null, savedBadges = [], ready = false;
let saving = false, signing = false;

function message(text) {
  const el = $('save-status') || $('toast');
  if (el) el.textContent = text;
}
function friendly(error) {
  const messages = {
    'auth/popup-blocked': 'Allow pop-ups for this site, then tap Google again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled. Your current account is unchanged.',
    'auth/unauthorized-domain': 'This staging domain is not authorized for Google sign-in yet.',
    'auth/credential-already-in-use': 'That Google account already has a participant account. Your guest progress is preserved. Keep this guest signed in until a safe account merge is available.',
    'auth/account-exists-with-different-credential': 'That account uses another sign-in provider. Your current account is unchanged.',
    'auth/network-request-failed': 'Could not reach sign-in. Check your connection and try again.',
    'permission-denied': 'The staging database denied access. Your changes were not confirmed.',
    'unavailable': 'The staging database is unavailable. Please reconnect and try again.'
  };
  return messages[error.code] || `Could not complete the request (${error.code || 'connection error'}). Please try again.`;
}
function lockPassport(locked) {
  if (!passport) return;
  for (const el of document.querySelectorAll('#mapClaim, #reset, #challengeList button')) {
    if (locked) {
      if (!el.dataset.accountLock) el.dataset.accountLock = el.disabled ? 'disabled' : 'enabled';
      el.disabled = true;
    } else if (el.dataset.accountLock) {
      el.disabled = el.dataset.accountLock === 'disabled'; delete el.dataset.accountLock;
    }
  }
  // render() replaces challenge buttons, so lock after each remote render too.
}
function controls() {
  if (!accountPage) return;
  $('guest').hidden = !!signedIn;
  $('guest').disabled = signing || !ready;
  $('google').disabled = signing || !ready || (!!signedIn && !signedIn.isAnonymous);
  $('google').textContent = signedIn?.isAnonymous ? 'Keep guest progress with Google' : 'Continue with Google';
  $('logout').hidden = !signedIn;
  $('logout').disabled = signing || saving;
  $('participant').hidden = !signedIn;
  for (const id of ['save-name', 'import-local']) $(id).disabled = saving || signing || !ready;
}
function showBadges(ids) {
  savedBadges = ids;
  passport?.replace(ids);
  if (!accountPage) return;
  $('demo-badges').replaceChildren();
  for (const id of badgeIds) {
    const li = document.createElement('li');
    li.textContent = `${ids.includes(id) ? '✓' : '○'} ${id}`;
    $('demo-badges').append(li);
  }
}
function accountBanner(user) {
  if (accountPage) return;
  let banner = $('staging-account');
  if (!banner) {
    banner = document.createElement('div'); banner.id = 'staging-account';
    banner.style.cssText = 'padding:8px 16px;background:#211438;color:#fff;font:14px/1.5 system-ui;text-align:center;overflow-wrap:anywhere';
    const label = document.createElement('span'); label.id = 'staging-account-label';
    const link = document.createElement('a'); link.textContent = ' Manage account'; link.style.color = '#81efff';
    link.href = './staging/account.html' + location.search;
    banner.append(label, link); document.body.prepend(banner);
    const style = document.createElement('style');
    style.textContent = 'body.in-battle #staging-account,body.playing #staging-account{display:none}';
    document.head.append(style);
  }
  $('staging-account-label').textContent = 'STAGING · ' + (user ? user.isAnonymous ? 'Guest account' : 'Google account' : 'Local demo');
}

async function saveChanges(ids) {
  if (!signedIn || !ready || saving || signing) {
    passport?.replace(savedBadges); message('Wait for account loading or saving to finish.'); return;
  }
  const user = signedIn, mine = generation;
  const before = [...savedBadges], next = [...new Set(ids)].filter(id => badgeIds.includes(id));
  saving = true; controls(); lockPassport(true); message('Saving sample badges…');
  try {
    const batch = writeBatch(db);
    for (const id of next.filter(id => !before.includes(id))) batch.set(doc(db, 'participants', user.uid, 'demoBadges', id), { earnedAt: serverTimestamp() });
    for (const id of before.filter(id => !next.includes(id))) batch.delete(doc(db, 'participants', user.uid, 'demoBadges', id));
    await batch.commit();
    if (mine === generation) message('Sample badges saved to your staging account.');
  } catch (error) {
    if (mine === generation) { passport?.replace(before); message(friendly(error)); }
  } finally {
    if (mine === generation) { saving = false; controls(); lockPassport(false); }
  }
}

async function restore(user) {
  const mine = ++generation; stop(); stop = () => {}; ready = false; saving = false;
  signedIn = user; savedBadges = []; showBadges([]); lockPassport(true); accountBanner(user); controls();
  if (!user) {
    passport?.connect(null); passport?.restoreLocal(); lockPassport(false); ready = true;
    if (accountPage) $('account-status').textContent = 'Signed out. Continue as guest or sign in with Google.';
    controls(); return;
  }
  // Block all local mutation until this account has loaded; do not upload local
  // badges implicitly or leave the preceding account's badges on screen.
  passport?.connect(() => { passport.replace(savedBadges); message('Account is loading. Please wait.'); lockPassport(true); });
  if (accountPage) $('account-status').textContent = 'Loading your staging account…';
  try {
    const ref = doc(db, 'participants', user.uid), snap = await getDoc(ref);
    if (mine !== generation) return;
    if (!snap.exists()) await setDoc(ref, { displayName: 'Maker', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (mine !== generation) return;
    if (accountPage) {
      $('display-name').value = snap.exists() ? snap.data().displayName : 'Maker';
      $('account-status').textContent = user.isAnonymous ? 'Signed in as a guest. Link Google to keep access across devices.' : 'Signed in with Google. Your staging account is ready.';
    }
    stop = onSnapshot(collection(db, 'participants', user.uid, 'demoBadges'), { includeMetadataChanges: true }, snapshot => {
      if (mine !== generation) return;
      showBadges(snapshot.docs.map(d => d.id).filter(id => badgeIds.includes(id)));
      const confirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
      ready = confirmed;
      passport?.connect(ready ? saveChanges : () => { passport.replace(savedBadges); message('Waiting for the server to confirm your passport.'); lockPassport(true); });
      lockPassport(!ready || saving); controls();
      message(confirmed ? 'Passport synced to your staging account.' : 'Passport changes are pending server confirmation.');
    }, error => {
      if (mine !== generation) return;
      ready = false; showBadges([]); lockPassport(true); message(friendly(error)); controls();
    });
  } catch (error) {
    if (mine !== generation) return;
    message(friendly(error));
    if (accountPage) { $('account-error').textContent = friendly(error); $('logout').disabled = false; }
  }
}

if (accountPage) {
  async function sign(action) {
    if (signing || !ready) return;
    signing = true; $('account-error').textContent = ''; controls();
    try { await action(); }
    catch (error) { $('account-error').textContent = friendly(error); }
    finally { signing = false; controls(); }
  }
  $('guest').onclick = () => sign(() => signInAnonymously(auth));
  $('google').onclick = () => sign(() => {
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    return auth.currentUser?.isAnonymous ? linkWithPopup(auth.currentUser, provider).then(() => restore(auth.currentUser)) : signInWithPopup(auth, provider);
  });
  $('logout').onclick = () => {
    if (signedIn?.isAnonymous && !confirm('This guest account has no cross-device recovery. Link Google first to keep access. Sign out anyway?')) return;
    // Also permit logout if database loading failed.
    if (!signing && !saving) signOut(auth).catch(error => { $('account-error').textContent = friendly(error); });
  };
  $('name-form').onsubmit = async event => {
    event.preventDefault(); if (!ready || !signedIn || saving) return;
    const mine = generation, user = signedIn, name = $('display-name').value.trim();
    if (!name || name.length > 24) { message('Choose a display name of 1–24 characters.'); return; }
    saving = true; controls(); message('Saving display name…');
    try { await updateDoc(doc(db, 'participants', user.uid), { displayName: name, updatedAt: serverTimestamp() }); if (mine === generation) message('Display name saved.'); }
    catch (error) { if (mine === generation) message(friendly(error)); }
    finally { if (mine === generation) { saving = false; controls(); } }
  };
  $('import-local').onclick = async () => {
    if (!ready || saving) return;
    try {
      const ids = JSON.parse(localStorage.getItem('maker-quest-companion-demo-passport-v1') || '[]');
      if (!Array.isArray(ids)) throw new Error('invalid local data');
      await saveChanges([...savedBadges, ...ids]);
    } catch { message('Could not read local demo badges. Your account progress is unchanged.'); }
  };
}

try {
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, restore, error => { message(friendly(error)); });
} catch (error) {
  if (accountPage) $('account-error').textContent = 'Persistent browser storage is unavailable. Enable site storage and reload before signing in.';
  else message('Account storage is unavailable; local demo only.');
}
