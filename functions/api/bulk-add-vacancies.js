// GET/POST /api/bulk-add-vacancies — TEMPORARY one-time import of the 10
// open vacancies Adam sent as a Power BI screenshot (2026-09-19), mapped
// to store codes/positions and confirmed with him directly (one row, ТЦ
// "Сільпо", deliberately left out — he asked to hold off on it). GET shows
// what will be written without writing anything; POST performs the write.
// Idempotent by design: every doc uses a fixed id (vimport_1..vimport_10),
// so re-running this — e.g. to fix a typo here before Adam confirms — just
// overwrites the same 10 docs rather than creating duplicates. Already
// behind the same site-wide Basic Auth every other route here relies on
// (functions/_middleware.js). Delete this file once Adam confirms the
// vacancies look right on the Вакансії tab — it's single-use, not a
// general import tool.
import { firestoreSetTypedDoc } from "./_firebase.js";

const VACANCIES = [
  { n: "vimport_1", storeCode: "J120", position: "DepSM", employmentShare: 0.5, openedDate: "2026-04-30", candidateCount: 19, openContacts: 75, vacancyName: 'Завідувач відділу JYSK, ТЦ "Район" 20 годин на тиждень' },
  { n: "vimport_2", storeCode: "J120", position: "LR", employmentShare: 0.5, openedDate: "2026-08-06", candidateCount: 5, openContacts: 75, vacancyName: 'Завідувач складу JYSK, ТЦ "Район"' },
  { n: "vimport_3", storeCode: "J029", position: "SA", employmentShare: 0.5, openedDate: "2026-04-08", candidateCount: 77, openContacts: 14, vacancyName: 'Продавець-консультант, JYSK ТЦ "Проспект" 20 год на тиждень' },
  { n: "vimport_4", storeCode: "J029", position: "SA", employmentShare: 0.5, openedDate: "2026-04-08", candidateCount: 61, openContacts: 14, vacancyName: 'Продавець-консультант, Jysk ТЦ "Проспект" 20 годин на тиждень' },
  { n: "vimport_5", storeCode: "J009", position: "DepSM", employmentShare: 0.5, openedDate: "2026-06-23", candidateCount: 41, openContacts: 11, vacancyName: 'Продавець-консультант/Завідувач відділу JYSK, ТЦ "Термінал"' },
  { n: "vimport_6", storeCode: "J121", position: "LR", employmentShare: 0.5, openedDate: "2026-05-30", candidateCount: 6, openContacts: 5, vacancyName: 'Завідувач складу JYSK, Рітейл Парк "Inzhur"' },
  { n: "vimport_7", storeCode: "J015", position: "DepSM", employmentShare: 0.25, openedDate: "2026-08-05", candidateCount: 7, openContacts: 5, vacancyName: 'Продавець-консультант/Завідувач відділу JYSK, ТЦ "SKYMALL" 10 годин на тиждень' },
  { n: "vimport_8", storeCode: "J015", position: "DepSM", employmentShare: 0.5, openedDate: "2026-08-05", candidateCount: 6, openContacts: 5, vacancyName: 'Продавець-консультант/Завідувач відділу JYSK, ТЦ "SKYMALL" 20 годин на тиждень' },
  { n: "vimport_9", storeCode: "J050", position: "SMT", employmentShare: 0.5, openedDate: "2026-04-16", candidateCount: 9, openContacts: 5, vacancyName: 'Стажер на керуючого магазину JYSK, ТЦ "ЦУМ"' },
  { n: "vimport_10", storeCode: "J050", position: "DepSM", employmentShare: 0.5, openedDate: "2026-08-12", candidateCount: 6, openContacts: 2, vacancyName: 'Продавець-консультант/Завідувач відділу JYSK, ТЦ "ЦУМ"' },
];

function toDoc(v) {
  return {
    id: v.n, storeCode: v.storeCode, vacancyName: v.vacancyName, position: v.position, employmentShare: v.employmentShare,
    openedDate: v.openedDate, hiredDate: null, hireStatus: "open", responsiblePerson: null, priority: null,
    minorEmployeePresent: null, searchChannels: [], marketingPresence: "", ambassadorActions: "", comments: [],
    workUaContacts: null, workUaUpdatedAt: null, candidateCount: v.candidateCount, openContacts: v.openContacts,
  };
}

export async function onRequestGet() {
  const rows = VACANCIES.map((v) => `<tr><td>${v.storeCode}</td><td>${v.position}</td><td>${v.employmentShare}</td><td>${v.openedDate}</td><td>${v.candidateCount}</td><td>${v.openContacts}</td><td>${v.vacancyName}</td></tr>`).join("");
  return html(`
    <p>Буде записано ${VACANCIES.length} вакансій у kyiv1_vacancies:</p>
    <table border="1" cellpadding="4" style="border-collapse:collapse;font-size:13px;">
      <tr><th>Магазин</th><th>Посада</th><th>Ставка</th><th>Дата</th><th>Канд.</th><th>Контакти</th><th>Назва</th></tr>
      ${rows}
    </table>
    <form method="POST" style="margin-top:16px;"><button type="submit">Записати</button></form>
  `);
}

export async function onRequestPost(context) {
  const { env } = context;
  const results = [];
  for (const v of VACANCIES) {
    try {
      await firestoreSetTypedDoc(env, "kyiv1_vacancies", v.n, toDoc(v));
      results.push(`✅ ${v.n} (${v.storeCode}, ${v.position})`);
    } catch (e) {
      results.push(`❌ ${v.n}: ${String(e.message || e)}`);
    }
  }
  return html(`<p>Готово.</p><pre>${results.join("\n")}</pre>`);
}

function html(body) {
  return new Response(
    `<!DOCTYPE html><html lang="uk"><meta charset="utf-8"><body style="font-family:sans-serif;max-width:700px;margin:40px auto;">${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
