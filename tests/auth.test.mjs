import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, GoogleAuthProvider,
  linkWithCredential, signInWithCredential, signOut } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

test('mock Google linking preserves guest UID and progress, and collision keeps guest intact', async () => {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Run only under Auth emulator');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run only under Firestore emulator');
  const app = initializeApp({ projectId: 'demo-maker-quest', apiKey: 'demo-key' }, `link-${Date.now()}`);
  const auth = getAuth(app), db = getFirestore(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  // Unsigned Google token is accepted ONLY by the emulator. It proves the UID
  // and data-linking behavior, not real Google OAuth or identity verification.
  const sub = `mock-google-${Date.now()}`;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    iss: 'https://accounts.google.com', aud: 'demo-maker-quest', sub,
    email: `${sub}@example.test`, email_verified: true, name: 'Mock Maker',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600
  })}.`;
  const credential = () => GoogleAuthProvider.credential(token);
  try {
    const guest = (await signInAnonymously(auth)).user, uid = guest.uid;
    await setDoc(doc(db, 'participants', uid), { displayName: 'Linked Maker', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await setDoc(doc(db, 'participants', uid, 'demoBadges', 'robotics'), { earnedAt: serverTimestamp() });
    await linkWithCredential(guest, credential());
    assert.equal(auth.currentUser.uid, uid);
    assert.equal(auth.currentUser.isAnonymous, false);
    await signOut(auth);
    await signInWithCredential(auth, credential());
    assert.equal(auth.currentUser.uid, uid);
    assert.equal((await getDoc(doc(db, 'participants', uid))).data().displayName, 'Linked Maker');
    assert.equal((await getDoc(doc(db, 'participants', uid, 'demoBadges', 'robotics'))).exists(), true);
    await signOut(auth);
    const otherGuest = (await signInAnonymously(auth)).user;
    await assert.rejects(linkWithCredential(otherGuest, credential()), error => error.code === 'auth/credential-already-in-use');
    assert.equal(auth.currentUser.uid, otherGuest.uid);
    assert.equal(auth.currentUser.isAnonymous, true);
  } finally { await deleteApp(app); }
});
