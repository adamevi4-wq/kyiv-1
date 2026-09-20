// GET /api/district-summary — a numbers-only, read-only mirror of
// kyiv1_stores for the "Магазини та ставки" tab's district-wide top
// summary (stat-row, укомплектованість gauge, status-distribution bars).
//
// firestore.rules (2026-09-20) now scopes a manager's own Firestore token
// to just their own store — the same change that finally makes the
// per-store sections below that summary actually private, not just
// hidden in the UI. But it also means a manager's browser can no longer
// read every store's numbers to total them up itself, and Adam wants that
// top summary to stay district-wide for everyone regardless. This
// endpoint is the one deliberate, narrow exception: the same
// service-account access every other functions/api/*.js file already
// uses (bypasses Security Rules by design) to read every store, but
// returns ONLY the handful of aggregate-relevant numeric fields — never
// riskyCount, comments, or anything else the per-store isolation work was
// specifically about keeping private between stores.
import { firestoreGet, firestoreListCollection, jsonResponse } from "./_firebase.js";

// Mirrors index.html's own DEFAULT_STORES shape (zero-filled) — used only
// if kyiv1_stores is genuinely empty and the old blob doc has nothing
// either, so the tab's top summary never just breaks on a fresh project.
const FIELDS = ["code", "baseStakes", "actualStakes", "baseHeadcount", "actualHeadcount", "hasDisabilityEmployee", "cpdCount"];

export async function onRequestGet(context) {
  const { env } = context;
  let stores = [];
  try {
    stores = await firestoreListCollection(env, "kyiv1_stores");
    if (!stores.length) {
      const raw = await firestoreGet(env, "kyiv1", "staffing-stores");
      if (raw) stores = JSON.parse(raw);
    }
  } catch (e) {
    return jsonResponse({ error: "district summary temporarily unavailable" }, 503);
  }
  const trimmed = stores.map((s) => Object.fromEntries(FIELDS.map((f) => [f, s[f] ?? null])));
  return jsonResponse(trimmed);
}
