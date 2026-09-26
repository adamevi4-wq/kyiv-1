// POST /api/login — verifies a manager/admin password server-side (reading
// the stored salted-hash from Firestore via the same service account
// telegram-bot/worker.js uses) and, on success, mints a Firebase Auth
// custom token for the browser to sign in with.
//
// Replaces the old flow where index.html signed every visitor into
// Firestore anonymously *before* any password was checked, just to fetch
// kyiv1/users (including every user's password hash) and kyiv1/admin-password
// client-side for a local comparison — meaning anyone who could reach the
// site (past the shared Basic Auth) could pull every store's hashed
// password with a bare Firestore REST call, whether or not they knew any
// real password. Now the browser gets no Firestore token at all until it
// already knows a real password; firestore.rules additionally rejects any
// anonymous-provider token as defense in depth.
import { firestoreGet, firestoreSet, firestoreListCollection, verifyCredential, mintFirebaseCustomToken, jsonResponse } from "./_firebase.js";

const ADMIN_DEFAULT_PASSWORD = "DM-Kyiv1"; // mirrors index.html's own fallback

const DEFAULT_USERS = [
  { id: "u1", name: "Афонічев Марк", store: "J104", password: "J104" },
  { id: "u2", name: "Безхлібний Андрій", store: "J015", password: "J015" },
  { id: "u3", name: "Гаценко Олег", store: "J121", password: "J121" },
  { id: "u4", name: "Міщенко Юлія", store: "J109", password: "J109" },
  { id: "u5", name: "Доля Наталія", store: "J029", password: "J029" },
  { id: "u6", name: "Крамаренко Олександр", store: "J009", password: "J009" },
  { id: "u7", name: "Третяк Олександр", store: "J035", password: "J035" },
  { id: "u8", name: "Білоус Сергій", store: "J050", password: "J050" },
  { id: "u9", name: "Сиролет Владислав", store: "J120", password: "J120" },
  { id: "u10", name: "Ящик Євгеній", store: "J027", password: "J027" },
];

// Brute-force protection: nothing previously stopped an unlimited number of
// password guesses against this endpoint (unlike /api/admin-reset, which
// already caps wrong-code guesses via kyiv1/admin-reset-pending's own
// `attempts` field). Keyed by ACCOUNT (admin, or one specific manager id),
// not by caller IP — guesses spread across many machines/IPs still count
// against the same lockout, which a per-IP scheme would miss entirely.
// Auto-recovers after LOGIN_LOCKOUT_MS instead of needing an admin to
// manually clear it, since this gates routine daily login for ~20
// non-technical retail employees, not a rare recovery flow — a permanent
// lock would be real-world painful, not just theoretically annoying.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_ATTEMPT_WINDOW_MS = LOGIN_LOCKOUT_MS; // a failed streak this stale resets on its own

async function readLoginAttempts(env) {
  try {
    const raw = await firestoreGet(env, "kyiv1", "login-attempts");
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    // A read hiccup here must never itself become a way to bypass the
    // lockout (so a real failure below still gets recorded against a fresh
    // {} instead of throwing) — the credential check that follows still
    // decides whether this specific request succeeds.
    return {};
  }
}

async function writeLoginAttempts(env, all) {
  try {
    await firestoreSet(env, "kyiv1", "login-attempts", JSON.stringify(all));
  } catch (e) {
    // Best-effort — a failed write just means this one failed attempt
    // doesn't count toward the lockout; the password check itself already
    // happened and already failed, so this isn't a security hole.
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "invalid request" }, 400);
  }
  const { role, userId, password } = body || {};
  if (typeof password !== "string" || !password) {
    return jsonResponse({ error: "invalid credentials" }, 401);
  }
  if (role !== "admin" && !(role === "manager" && typeof userId === "string")) {
    return jsonResponse({ error: "invalid request" }, 400);
  }

  const attemptKey = role === "admin" ? "admin" : `user_${userId}`;
  const now = Date.now();
  const attempts = await readLoginAttempts(env);
  const entry = attempts[attemptKey] || { count: 0, lastAttemptTs: 0, lockedUntil: 0 };
  if (entry.lockedUntil > now) {
    return jsonResponse({ error: "too many attempts", retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) }, 429);
  }
  if (entry.lastAttemptTs && now - entry.lastAttemptTs > LOGIN_ATTEMPT_WINDOW_MS) {
    entry.count = 0; // old failed streak — doesn't count against a fresh attempt
  }

  const recordFailure = async () => {
    entry.count += 1;
    entry.lastAttemptTs = now;
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
      entry.count = 0;
    }
    attempts[attemptKey] = entry;
    await writeLoginAttempts(env, attempts);
  };
  const recordSuccess = async () => {
    if (!entry.count && !entry.lockedUntil) return; // nothing to clear, skip the write
    attempts[attemptKey] = { count: 0, lastAttemptTs: 0, lockedUntil: 0 };
    await writeLoginAttempts(env, attempts);
  };

  try {
    if (role === "admin") {
      const raw = await firestoreGet(env, "kyiv1", "admin-password");
      const stored = raw || ADMIN_DEFAULT_PASSWORD;
      if (!(await verifyCredential(password, stored))) {
        await recordFailure();
        return jsonResponse({ error: "invalid credentials" }, 401);
      }
      await recordSuccess();
      const token = await mintFirebaseCustomToken(env, "admin", { role: "admin" });
      return jsonResponse({ token });
    }

    // role === "manager"
    // kyiv1_users (one real document per manager, 2026-09-19 phase 4) is
    // the source of truth once index.html's one-time migration has run;
    // kyiv1/users (the old whole-district JSON blob) is the pre-migration
    // fallback — see firestore.rules and index.html's migrateToPerItemDocs().
    let users = await firestoreListCollection(env, "kyiv1_users");
    if (!users.length) {
      const raw = await firestoreGet(env, "kyiv1", "users");
      users = raw ? JSON.parse(raw) : DEFAULT_USERS;
    }
    const user = users.find((u) => u.id === userId);
    if (!user || !(await verifyCredential(password, user.password))) {
      await recordFailure();
      return jsonResponse({ error: "invalid credentials" }, 401);
    }
    await recordSuccess();
    const token = await mintFirebaseCustomToken(env, `user_${user.id}`, { role: "manager", store: user.store });
    return jsonResponse({ token });
  } catch (e) {
    // FIREBASE_SERVICE_ACCOUNT_KEY missing/misconfigured, Firestore/token
    // exchange failure — never leak details, just refuse the login.
    return jsonResponse({ error: "login temporarily unavailable" }, 503);
  }
}
