// Stand-in for the Firebase Auth SDK — the real thing exchanges a custom
// token minted by functions/api/login.js for a Firebase session
// (signInWithLoginToken() in index.html, after a real password check); this
// always "succeeds" instantly, with no network, whatever token string it's
// handed (the test server's own /api/login stub below always returns
// "test-token" — see smoke.mjs).
export function getAuth(app) {
  return { app, signOut: async () => {} };
}
export async function signInWithCustomToken(auth, token) {
  return { user: { uid: "test-uid" } };
}
