// GET /api/diag — TEMPORARY diagnostic endpoint for debugging the
// 2026-09-19 login outage (both admin and manager logins failing after
// PR #102). Reports whether the Cloudflare Pages Production environment
// can actually reach Firestore as the service account login.js needs —
// never the secret itself, never any password/hash. Delete this file once
// the login issue is confirmed fixed; it's not meant to be a permanent
// part of the app.
import { getGoogleAccessToken, firestoreGet } from "./_firebase.js";

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

  try {
    const adminPass = await firestoreGet(env, "kyiv1", "admin-password");
    result.canReadFirestore = true;
    result.adminPasswordDocExists = adminPass !== null;
  } catch (e) {
    result.canReadFirestore = false;
    result.firestoreError = String(e.message || e);
  }

  return json(result);
}

function json(obj) {
  return new Response(JSON.stringify(obj, null, 2), { headers: { "Content-Type": "application/json" } });
}
