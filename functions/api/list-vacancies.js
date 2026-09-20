// GET/POST /api/list-vacancies — TEMPORARY diagnostic+cleanup for the
// duplicate entries Adam reported on the Вакансії tab (2026-09-20). Two
// independent imports of the same screenshot's data landed as separate
// docs: this session's own /api/bulk-add-vacancies (vimport_1..10, short
// position codes — LR/SA/DepSM/SMT) and a second import under different
// ids (v_imp_<timestamp>_<n>_<rand>, full Ukrainian position text) — 5 of
// those 10 vacancies ended up duplicated across both sets (same store/
// candidates/contacts/date, just a different position label and a
// different id). GET shows every doc's real id + fields; POST deletes the
// 5 confirmed duplicates below (Adam: keep the readable-text version,
// drop the short-code one — "LR - це завідувач"). Already behind the
// same site-wide Basic Auth every other route here relies on
// (functions/_middleware.js). Delete this file once confirmed clean.
import { firestoreListCollection, firestoreDeleteDoc } from "./_firebase.js";

// The short-code vimport_* doc for each of the 5 vacancies that exist
// twice — its v_imp_... twin (same store/candidates/contacts/openedDate)
// is what stays.
const DUPLICATE_IDS_TO_DELETE = ["vimport_1", "vimport_2", "vimport_6", "vimport_9", "vimport_10"];

export async function onRequestGet(context) {
  const { env } = context;
  let docs;
  try {
    docs = await firestoreListCollection(env, "kyiv1_vacancies");
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
  docs.sort((a, b) => (a.storeCode || "").localeCompare(b.storeCode || "") || (a.openedDate || "").localeCompare(b.openedDate || ""));
  const rows = docs.map((v) => `<tr style="${DUPLICATE_IDS_TO_DELETE.includes(v.id) ? "background:#fee;" : ""}">
    <td>${esc(v.id)}</td><td>${esc(v.storeCode)}</td><td>${esc(v.position)}</td>
    <td>${esc(v.employmentShare)}</td><td>${esc(v.candidateCount)}</td><td>${esc(v.openContacts)}</td>
    <td>${esc(v.openedDate)}</td><td>${esc(v.hireStatus)}</td><td style="max-width:320px;">${esc(v.vacancyName)}</td>
  </tr>`).join("");
  return html(`
    <p>${docs.length} документів у kyiv1_vacancies. Червоним — ${DUPLICATE_IDS_TO_DELETE.length} дублі, які POST-запит нижче видалить.</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px;">
      <tr><th>id</th><th>store</th><th>position</th><th>share</th><th>cand</th><th>contacts</th><th>opened</th><th>status</th><th>vacancyName</th></tr>
      ${rows}
    </table>
    <form method="POST" style="margin-top:16px;"><button type="submit">Видалити ${DUPLICATE_IDS_TO_DELETE.length} дублі (позначені червоним)</button></form>
  `);
}

export async function onRequestPost(context) {
  const { env } = context;
  const results = [];
  for (const id of DUPLICATE_IDS_TO_DELETE) {
    try {
      await firestoreDeleteDoc(env, "kyiv1_vacancies", id);
      results.push(`✅ видалено ${id}`);
    } catch (e) {
      results.push(`❌ ${id}: ${String(e.message || e)}`);
    }
  }
  return html(`<p>Готово.</p><pre>${results.join("\n")}</pre><p><a href="/api/list-vacancies">Переглянути список знову</a></p>`);
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function html(body) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;margin:24px;">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
