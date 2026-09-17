// Stand-in for the Firebase Auth SDK — the real thing signs every visitor
// in anonymously (see ensureFirebaseAuth() in index.html) before any
// Firestore call; this always "succeeds" instantly, with no network.
export function getAuth(app) {
  return { app };
}
export async function signInAnonymously(auth) {
  return { user: { uid: "test-anon-uid" } };
}
