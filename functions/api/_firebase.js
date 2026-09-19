// Shared Firestore-via-service-account + custom-token helper for
// functions/api/*.js. Mirrors telegram-bot/worker.js's
// getGoogleAccessToken/firestoreGetRaw (RS256-signed JWT, the standard
// "JWT Bearer" service-account flow the Firebase Admin SDK performs under
// the hood) — a second copy of the same small pattern, not a shared import,
// because Cloudflare Pages Functions and the Cloudflare Worker are separate
// deploy targets with no build step tying them together.
//
// Needs env.FIREBASE_SERVICE_ACCOUNT_KEY, set in the Cloudflare Pages
// project's Settings → Environment variables (as Secret) — the same place
// SITE_USER/SITE_PASS already live for functions/_middleware.js.

const PROJECT_ID = "district-tracker-ef4c6"; // public — see index.html's own firebaseConfig

let cachedToken = null; // { token, expiresAt } — one per warm isolate, mirrors worker.js

export async function getGoogleAccessToken(env) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set on this Pages project");
  }
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const scope = "https://www.googleapis.com/auth/datastore";
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa.client_email, scope, aud: sa.token_uri, exp: now + 3600, iat: now };
  const jwt = await signRS256(sa.private_key, { alg: "RS256", typ: "JWT" }, claims);

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${jwt}`,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`getGoogleAccessToken: token exchange failed ${res.status} ${errText}`);
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export async function firestoreGet(env, collection, docId) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore get failed ${collection}/${docId}: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.fields?.value?.stringValue ?? null;
}

// Mints a Firebase Auth "custom token" — a second, different JWT from the
// Google OAuth2 access token above (different audience/claims), meant to be
// handed to the browser, which exchanges it for a real Firebase Auth
// session via signInWithCustomToken(). Docs: "Create custom tokens without
// using the Admin SDK". Max lifetime is 1 hour (Firebase enforces this).
export async function mintFirebaseCustomToken(env, uid, claims) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set on this Pages project");
  }
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
    claims,
  };
  return signRS256(sa.private_key, { alg: "RS256", typ: "JWT" }, payload);
}

async function signRS256(privateKeyPem, header, payload) {
  const encHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64urlEncode(signature)}`;
}

function base64urlEncode(bytes) {
  let binary = "";
  for (const b of bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Same "salt:hex-sha256(salt:password)" scheme as index.html's own
// makeCredential/verifyCredential — ported here because password checking
// now has to happen server-side (see login.js), not in the browser before
// it has any Firestore access. Keep these two files' algorithms in sync.
export async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyCredential(password, stored) {
  if (typeof stored !== "string" || !stored) return false;
  const sep = stored.indexOf(":");
  if (sep === -1) return password === stored;
  const salt = stored.slice(0, sep), hash = stored.slice(sep + 1);
  return (await sha256Hex(`${salt}:${password}`)) === hash;
}

export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
