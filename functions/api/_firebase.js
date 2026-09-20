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

// Writes a kyiv1/{doc}-style blob doc ({value: "<string>"}) — the same
// shape index.html's own fsSet() writes client-side. Used by
// admin-reset.js, the one server-side write this API surface needs.
export async function firestoreSet(env, collection, docId, rawString) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?updateMask.fieldPaths=value`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { value: { stringValue: rawString } } }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore set failed ${collection}/${docId}: ${res.status} ${errText}`);
  }
}

// Lists every document in a collection of real (non-blob) documents — the
// kyiv1_stores/kyiv1_vacancies/kyiv1_users collections index.html writes
// with the Firestore SDK's own setDoc (typed fields, not a single JSON
// string), unlike firestoreGet's kyiv1/{doc} blobs above. Decodes
// Firestore's REST typed-value format into plain JS. No pagination — these
// collections are small (stores/managers: ~10, vacancies: a few dozen at
// most), well under Firestore's default page size.
export async function firestoreListCollection(env, collection) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore list failed ${collection}: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return (data.documents || []).map((doc) => decodeFirestoreFields(doc.fields));
}

function decodeFirestoreValue(v) {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue, 10);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in v) return decodeFirestoreFields(v.mapValue.fields || {});
  return null;
}
function decodeFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeFirestoreValue(v);
  return out;
}

// Writes a typed (multi-field) document — the inverse of
// firestoreListCollection's decode above — into a real per-item collection
// (kyiv1_stores/kyiv1_vacancies/kyiv1_users), matching the shape
// index.html's own setDoc() writes client-side (a full replace of the
// doc's fields, not a merge — same as setDoc without {merge:true}).
export async function firestoreSetTypedDoc(env, collection, docId, data) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: encodeFirestoreFields(data) }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Firestore set failed ${collection}/${docId}: ${res.status} ${errText}`);
  }
}
function encodeFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeFirestoreValue) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFirestoreFields(v) } };
  return { nullValue: null };
}
function encodeFirestoreFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = encodeFirestoreValue(v);
  return out;
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

// Signs/verifies the site-login session cookie
// (functions/api/site-login.js issues it, functions/_middleware.js checks
// it on every request) — a plain HMAC-SHA256-signed payload, replacing
// the browser's own Basic Auth credential cache with an explicit cookie
// so site-login.js can be a normal styled page instead of the native
// system popup. Still gated by the exact same shared secret
// (env.SITE_PASS) as before — this only changes how that secret is
// collected and remembered, not the security model.
// Needs env.SITE_SESSION_SECRET (any long random string, set once —
// Cloudflare Pages → Settings → Environment variables, as Secret).
export async function signSessionToken(env, payload) {
  if (!env.SITE_SESSION_SECRET) throw new Error("SITE_SESSION_SECRET is not set on this Pages project");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SITE_SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const body = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${base64urlEncode(sig)}`;
}
// Never throws on a bad/missing/tampered token — every caller (the
// middleware included) just treats null as "not signed in this way, fall
// through to the login page" rather than a hard error.
export async function verifySessionToken(env, token) {
  if (!token || !env.SITE_SESSION_SECRET) return null;
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.SITE_SESSION_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify("HMAC", key, base64urlDecode(sig), new TextEncoder().encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (typeof payload.exp === "number" && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
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

function base64urlDecode(str) {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
export async function makeCredential(password) {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const salt = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${await sha256Hex(`${salt}:${password}`)}`;
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
