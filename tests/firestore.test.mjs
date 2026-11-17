import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, deleteField } from 'firebase/firestore';

let env, alice, bob, publicDb;
const profile = (name = 'Maker') => ({ displayName: name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-maker-quest',
    firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  alice = env.authenticatedContext('alice').firestore();
  bob = env.authenticatedContext('bob').firestore();
  publicDb = env.unauthenticatedContext().firestore();
});
after(async () => { await env.cleanup(); });

test('participant lifecycle permits owner and denies cross-user access', async () => {
  const own = doc(alice, 'participants/alice');
  await assertSucceeds(setDoc(own, profile()));
  await assertSucceeds(getDoc(own));
  await assertSucceeds(updateDoc(own, { displayName: 'Robot fan', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(bob, 'participants/alice')));
  await assertFails(setDoc(doc(bob, 'participants/alice'), profile()));
  await assertFails(updateDoc(doc(bob, 'participants/alice'), { displayName: 'Hijacked', updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(bob, 'participants/alice')));
  await assertFails(deleteDoc(own));
  await assertFails(getDocs(collection(alice, 'participants')));
  await assertFails(getDoc(doc(publicDb, 'participants/alice')));
  await assertFails(getDocs(collection(publicDb, 'participants')));
  await assertFails(setDoc(doc(publicDb, 'participants/nobody'), profile()));
});

test('create and update both reject polluted, oversized and malformed profiles', async () => {
  const invalid = [
    { displayName: '' }, { displayName: '   ' }, { displayName: 'a'.repeat(1024 * 32) },
    { displayName: 42 }, { isAdmin: true }, { uid: 'bob' },
    { createdAt: Timestamp.fromMillis(1) }, { updatedAt: Timestamp.fromMillis(1) },
    { createdAt: 'yesterday' }, { extraData: 'pollution' }
  ];
  for (const [i, patch] of invalid.entries()) {
    const uid = `invalid-${i}`, db = env.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(db, 'participants', uid), { ...profile(), ...patch }));
    await assertFails(updateDoc(doc(alice, 'participants/alice'), { updatedAt: serverTimestamp(), ...patch }));
  }
  await assertFails(setDoc(doc(bob, 'participants/bob'), { displayName: 'No timestamps' }));
  await assertFails(updateDoc(doc(alice, 'participants/alice'), { displayName: deleteField(), updatedAt: serverTimestamp() }));
});

test('demo badges are scoped, finite, timestamped, immutable and resettable', async () => {
  const path = 'participants/alice/demoBadges/robotics';
  await assertSucceeds(setDoc(doc(alice, path), { earnedAt: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(alice, 'participants/alice/demoBadges')));
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(getDocs(collection(bob, 'participants/alice/demoBadges')));
  await assertFails(getDoc(doc(publicDb, path)));
  await assertFails(deleteDoc(doc(bob, path)));
  await assertFails(setDoc(doc(bob, 'participants/alice/demoBadges/art'), { earnedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(bob, 'participants/bob/demoBadges/art'), { earnedAt: serverTimestamp() })); // no parent
  await assertFails(setDoc(doc(alice, 'participants/alice/demoBadges/admin'), { earnedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(alice, 'participants/alice/demoBadges/art'), { earnedAt: 'today' }));
  await assertFails(setDoc(doc(alice, 'participants/alice/demoBadges/art'), { earnedAt: Timestamp.fromMillis(1) }));
  await assertFails(updateDoc(doc(alice, path), { earnedAt: Timestamp.fromMillis(1) }));
  await assertFails(updateDoc(doc(alice, path), { verified: true }));
  await assertFails(updateDoc(doc(alice, path), { earnedAt: deleteField() }));
  await assertSucceeds(deleteDoc(doc(alice, path)));
});

test('client cannot create prize scores, awards, resets or administrators', async () => {
  for (const path of ['events/fest/rounds/hour/leaders/alice', 'events/fest',
    'participants/alice/awards/robotics', 'admins/alice', 'runs/alice']) {
    await assertFails(setDoc(doc(alice, path), { score: 9999999, admin: true }));
  }
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'events/fest/rounds/hour/leaders/alice'), { displayName: 'Maker', score: 10 });
  });
  await assertSucceeds(getDocs(collection(alice, 'events/fest/rounds/hour/leaders')));
  await assertFails(getDocs(collection(publicDb, 'events/fest/rounds/hour/leaders')));
  await assertFails(updateDoc(doc(alice, 'events/fest/rounds/hour/leaders/alice'), { score: 999 }));
  await assertFails(deleteDoc(doc(alice, 'events/fest/rounds/hour/leaders/alice')));
});
