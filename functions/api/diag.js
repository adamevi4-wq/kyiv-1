// GET /api/diag — TEMPORARY diagnostic endpoint for debugging the
// 2026-09-19 login outage (both admin and manager logins failing after
// PR #102, still failing after an admin-password reset via
// /api/admin-reset). Reports whether the Cloudflare Pages Production
// environment can actually reach Firestore as login.js needs, AND
// self-tests the exact hash algorithm and write/read cycle those two
// endpoints depend on — never the secret itself, never any real
// password/hash. Delete this file once the login issue is confirmed
// fixed; it's not meant to be a permanent part of the app.
import { getGoogleAccessToken, firestoreGet, firestoreSet, makeCredential, verifyCredential } from "./_firebase.js";

export async function onRequestGet(context) {
  const { env } = context;
  const result = { hasKey: !!env.FIREBASE_SERVICE_ACCOUNT_KEY };
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return json(result);
  }
  result.keyLength = env.FIREBASE_SERVICE_ACCOUNT_KEY.length;

  let sa;
  try {
    sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    result.parsesAsJson = true;
    result.hasClientEmail = !!sa.client_email;
    result.hasPrivateKey = !!sa.private_key;
    result.hasTokenUri = !!sa.token_uri;
  } catch (e) {
    result.parsesAsJson = false;
    result.parseError = String(e.message || e);
    return json(result);
  }

  try {
    const token = await getGoogleAccessToken(env);
    result.gotGoogleAccessToken = !!token;
  } catch (e) {
    result.gotGoogleAccessToken = false;
    result.tokenError = String(e.message || e);
    return json(result);
  }

  // Pure in-memory self-test of makeCredential/verifyCredential — no
  // Firestore involved. If this is false, the hashing scheme itself is
  // broken (would affect every password check, not just admin).
  try {
    const testPassword = "diag-test-" + Date.now();
    const hashed = await makeCredential(testPassword);
    result.hashRoundTrip = await verifyCredential(testPassword, hashed);
    result.hashRoundTripWrongPasswordRejected = !(await verifyCredential(testPassword + "x", hashed));
  } catch (e) {
    result.hashRoundTripError = String(e.message || e);
  }

  // Firestore write-then-read round trip on a disposable test doc — proves
  // whether firestoreSet() (used by /api/admin-reset) and firestoreGet()
  // (used by /api/login) actually agree on the same stored value.
  try {
    const testValue = "diag-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    await firestoreSet(env, "kyiv1", "diag-roundtrip-test", testValue);
    const readBack = await firestoreGet(env, "kyiv1", "diag-roundtrip-test");
    result.firestoreRoundTrip = readBack === testValue;
    if (!result.firestoreRoundTrip) {
      result.firestoreRoundTripWrote = testValue;
      result.firestoreRoundTripRead = readBack;
    }
  } catch (e) {
    result.firestoreRoundTripError = String(e.message || e);
  }

  try {
    const adminPass = await firestoreGet(env, "kyiv1", "admin-password");
    result.canReadFirestore = true;
    result.adminPasswordDocExists = adminPass !== null;
    if (adminPass) {
      result.adminPasswordLength = adminPass.length;
      result.adminPasswordHasColon = adminPass.includes(":");
    }
  } catch (e) {
    result.canReadFirestore = false;
    result.firestoreError = String(e.message || e);
  }

  return json(result);
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { "Content-Type": "application/json" } });
}
