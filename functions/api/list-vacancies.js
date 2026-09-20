// GET /api/list-vacancies — TEMPORARY read-only dump of kyiv1_vacancies,
// to diagnose the duplicate entries Adam reported on the Вакансії tab
// (2026-09-20). Shows every doc's real id + fields so the exact
// duplicates can be identified before deleting anything — real HR data,
// not something to guess at from a screenshot. Already behind the same
// site-wide Basic Auth every other route here relies on
// (functions/_middleware.js). Delete this file once the duplicates are
// resolved — it's a one-off diagnostic, not a general tool.
import { firestoreListCollection } from "./_firebase.js";

export async function onRequestGet(context) {
  const { env } = context;
  let docs;
  try {
    docs = await firestoreListCollection(env, "kyiv1_vacancies");
  } catch (e) {
    return html(`<p style="color:red">Помилка: ${String(e.message || e)}</p>`);
  }
  docs.sort((a, b) => (a.storeCode || "").localeCompare(b.storeCode || "") || (a.openedDate || "").localeCompare(b.openedDate || ""));
  const rows = docs.map((v) => `<tr>
    <td>${esc(v.id)}</td><td>${esc(v.storeCode)}</td><td>${esc(v.position)}</td>
    <td>${esc(v.employmentShare)}</td><td>${esc(v.candidateCount)}</td><td>${esc(v.openContacts)}</td>
    <td>${esc(v.openedDate)}</td><td>${esc(v.hireStatus)}</td><td style="max-width:320px;">${esc(v.vacancyName)}</td>
  </tr>`).join("");
  return html(`
    <p>${docs.length} документів у kyiv1_vacancies:</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:12px;">
      <tr><th>id</th><th>store</th><th>position</th><th>share</th><th>cand</th><th>contacts</th><th>opened</th><th>status</th><th>vacancyName</th></tr>
      ${rows}
    </table>
  `);
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
