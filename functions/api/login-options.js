// GET /api/login-options — the manager login dropdown's directory
// (id, name, store), with the password field stripped, so index.html's
// login screen can populate its <select> without the browser ever touching
// Firestore before a real login (see login.js and firestore.rules for why
// the anonymous-auth shortcut that used to make this trivial is gone).
// Read via the same Firebase service account as telegram-bot/worker.js —
// IAM bypasses Security Rules, same as that bot's own Firestore access.
import { firestoreGet, jsonResponse } from "./_firebase.js";

// Mirrors index.html's own DEFAULT_USERS (minus the password field, which
// that constant only sets to the store code as a fallback default anyway) —
// used when kyiv1/users doesn't exist yet, e.g. a fresh Firestore project.
const DEFAULT_USERS = [
  { id: "u1", name: "Афонічев Марк", store: "J104" },
  { id: "u2", name: "Безхлібний Андрій", store: "J015" },
  { id: "u3", name: "Гаценко Олег", store: "J121" },
  { id: "u4", name: "Міщенко Юлія", store: "J109" },
  { id: "u5", name: "Доля Наталія", store: "J029" },
  { id: "u6", name: "Крамаренко Олександр", store: "J009" },
  { id: "u7", name: "Третяк Олександр", store: "J035" },
  { id: "u8", name: "Білоус Сергій", store: "J050" },
  { id: "u9", name: "Сиролет Владислав", store: "J120" },
  { id: "u10", name: "Ящик Євгеній", store: "J027" },
];

export async function onRequestGet(context) {
  const { env } = context;
  let users = DEFAULT_USERS;
  try {
    const raw = await firestoreGet(env, "kyiv1", "users");
    if (raw) users = JSON.parse(raw);
  } catch (e) {
    // Firestore/service-account trouble — fall back to the default
    // directory rather than leaving the login screen with an empty list.
  }
  const directory = users.map((u) => ({ id: u.id, name: u.name, store: u.store }));
  return jsonResponse(directory);
}
