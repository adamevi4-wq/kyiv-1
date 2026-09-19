// Minimal in-memory Firestore stand-in, stateful for the duration of the
// page load, enough to exercise real read/write/listen code paths without
// hitting the network. Seeding is optional — with none, index.html's own
// fsGet()/fsCollectionGet() calls all return undefined/[], so the app
// falls back to its own built-in DEFAULT_USERS/DEFAULT_STORES/
// DEFAULT_ZONES/ADMIN_DEFAULT_PASSWORD constants, exactly like a genuinely
// empty Firestore project would — including running its one-time
// migrateToPerItemDocs() backfill on the first admin login, the same as
// a real empty project.
const STORE = new Map(); // "collectionPath/docId" -> data
const listeners = new Map(); // doc key -> Set(cb)
const collectionListeners = new Map(); // collectionPath -> Set(cb)

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
export function collection(db, collectionPath) {
  return { db, collectionPath, _isCollection: true };
}

function docsInCollection(collectionPath) {
  const prefix = collectionPath + "/";
  const out = [];
  for (const [k, v] of STORE.entries()) {
    if (k.startsWith(prefix) && !k.slice(prefix.length).includes("/")) {
      out.push({ id: k.slice(prefix.length), data: () => v });
    }
  }
  return out;
}

export async function getDoc(ref) {
  const data = STORE.get(ref._key);
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

export async function getDocs(collRef) {
  const docs = docsInCollection(collRef.collectionPath);
  return { forEach(cb) { docs.forEach((d) => cb(d)); }, docs };
}

export async function setDoc(ref, data, opts) {
  const prev = STORE.get(ref._key) || {};
  const next = opts && opts.merge ? { ...prev, ...data } : data;
  STORE.set(ref._key, next);
  notifyDoc(ref);
  notifyCollection(ref.collectionPath);
}

export async function deleteDoc(ref) {
  STORE.delete(ref._key);
  notifyDoc(ref);
  notifyCollection(ref.collectionPath);
}

function notifyDoc(ref) {
  const set = listeners.get(ref._key);
  if (!set) return;
  const data = STORE.get(ref._key);
  set.forEach((cb) => cb({ exists: () => data !== undefined, data: () => data }));
}
function notifyCollection(collectionPath) {
  const set = collectionListeners.get(collectionPath);
  if (!set) return;
  const docs = docsInCollection(collectionPath);
  set.forEach((cb) => cb({ forEach(fn) { docs.forEach((d) => fn(d)); } }));
}

export function onSnapshot(ref, cb) {
  // Real Firestore's onSnapshot never fires synchronously either — deferring
  // this matters here because callers (this app's startPolling/bind) push
  // the unsubscribe handle onto a list right after this call returns, and
  // use that list's length as a re-entrancy guard; firing synchronously
  // would re-enter before that push happens.
  if (ref._isCollection) {
    if (!collectionListeners.has(ref.collectionPath)) collectionListeners.set(ref.collectionPath, new Set());
    collectionListeners.get(ref.collectionPath).add(cb);
    queueMicrotask(() => {
      const docs = docsInCollection(ref.collectionPath);
      cb({ forEach(fn) { docs.forEach((d) => fn(d)); } });
    });
    return () => {
      const set = collectionListeners.get(ref.collectionPath);
      if (set) set.delete(cb);
    };
  }
  if (!listeners.has(ref._key)) listeners.set(ref._key, new Set());
  listeners.get(ref._key).add(cb);
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
