// Minimal in-memory Firestore stand-in, stateful for the duration of the
// page load, enough to exercise real read/write/listen code paths without
// hitting the network. Seeding is optional — with none, index.html's own
// fsGet() calls all return undefined, so the app falls back to its own
// built-in DEFAULT_USERS/DEFAULT_STORES/DEFAULT_ZONES/ADMIN_DEFAULT_PASSWORD
// constants, exactly like a genuinely empty Firestore project would.
const STORE = new Map();
const listeners = new Map(); // key -> Set(cb)

function key(collectionPath, docId) {
  return `${collectionPath}/${docId}`;
}

export function initializeFirestore(app, opts) {
  return { app, opts };
}
export function persistentLocalCache(opts) {
  return { kind: "persistentLocalCache", opts };
}
export function persistentMultipleTabManager() {
  return { kind: "persistentMultipleTabManager" };
}

export function doc(db, collectionPath, docId) {
  return { db, collectionPath, docId, _key: key(collectionPath, docId) };
}

export async function getDoc(ref) {
  const data = STORE.get(ref._key);
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

export async function setDoc(ref, data, opts) {
  const prev = STORE.get(ref._key) || {};
  const next = opts && opts.merge ? { ...prev, ...data } : data;
  STORE.set(ref._key, next);
  const set = listeners.get(ref._key);
  if (set) set.forEach((cb) => cb({ exists: () => true, data: () => next }));
}

export function onSnapshot(ref, cb) {
  if (!listeners.has(ref._key)) listeners.set(ref._key, new Set());
  listeners.get(ref._key).add(cb);
  // Real Firestore's onSnapshot never fires synchronously either — deferring
  // this matters here because callers (this app's startPolling/bind) push
  // the unsubscribe handle onto a list right after this call returns, and
  // use that list's length as a re-entrancy guard; firing synchronously
  // would re-enter before that push happens.
  queueMicrotask(() => {
    const data = STORE.get(ref._key);
    cb({ exists: () => data !== undefined, data: () => data });
  });
  return () => {
    const set = listeners.get(ref._key);
    if (set) set.delete(cb);
  };
}

// Seed hook for the test harness — window.__SEED__ = { collectionPath: { docId: { value: "..." } } }.
if (typeof window !== "undefined" && window.__SEED__) {
  for (const [collectionPath, docs] of Object.entries(window.__SEED__)) {
    for (const [docId, value] of Object.entries(docs)) {
      STORE.set(key(collectionPath, docId), value);
    }
  }
}
