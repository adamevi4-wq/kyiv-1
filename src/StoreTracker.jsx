import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { doc, getDoc, setDoc, updateDoc, onSnapshot, deleteField } from 'firebase/firestore';
import { db, configured } from './firebase.js';

const DEFAULT_STORES = [
  { code: 'J009', name: 'Kramarenko' },
  { code: 'J015', name: 'Bezkhlibnyi' },
  { code: 'J027', name: 'Yashchyk' },
  { code: 'J029', name: 'Dolia' },
  { code: 'J035', name: 'Tretyak' },
  { code: 'J050', name: 'Belous' },
  { code: 'J104', name: 'Afonichev' },
  { code: 'J109', name: 'Mishchenko' },
  { code: 'J120', name: 'Sirolet' },
  { code: 'J121', name: 'Hatsenko' },
];

const MONTHS_UA = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_UA[m - 1]} ${y}`;
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('room') || 'default').trim();
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return clean || 'default';
}

// How long we ignore incoming realtime updates for a section after the
// local user typed something in it, so their own keystrokes never get
// reverted mid-edit. Their edit is written (debounced) well inside this
// window, so nothing is lost — it just delays *other people's* concurrent
// edits from appearing on screen until this user pauses briefly.
const SUPPRESS_MS = 1500;
const WRITE_DEBOUNCE_MS = 500;

export default function StoreTracker() {
  if (!configured) return <SetupInstructions />;
  return <StoreTrackerApp />;
}

function SetupInstructions() {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-lg p-6">
        <h1 className="text-lg font-semibold mb-2">⚙️ Потрібно підключити Firebase</h1>
        <p className="text-sm text-neutral-600 mb-3">
          Цей застосунок синхронізує дані в реальному часі через безкоштовний Firebase
          (Firestore). Відкрийте <code className="bg-neutral-100 px-1 rounded">src/firebaseConfig.js</code>{' '}
          і вставте свої дані з безкоштовного проєкту Firebase.
        </p>
        <p className="text-sm text-neutral-600">Детальні кроки — у файлі <code className="bg-neutral-100 px-1 rounded">README.md</code> в корені репозиторію.</p>
      </div>
    </div>
  );
}

function StoreTrackerApp() {
  const [room] = useState(getRoomFromUrl);
  const docRef = useMemo(() => doc(db, 'districts', room), [room]);

  const [loaded, setLoaded] = useState(false);
  const [connErr, setConnErr] = useState(null);
  const [syncState, setSyncState] = useState('connecting'); // connecting | synced | syncing | offline
  const [stores, setStores] = useState(DEFAULT_STORES);
  const [kpis, setKpis] = useState([]);
  const [entries, setEntries] = useState({});
  const [month, setMonth] = useState(currentMonthKey());
  const [activeKpiId, setActiveKpiId] = useState(null);
  const [newKpiName, setNewKpiName] = useState('');
  const [newKpiUnit, setNewKpiUnit] = useState('');
  const [editingStores, setEditingStores] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [roomInput, setRoomInput] = useState('');

  const suppressUntilRef = useRef(0);
  const writeTimers = useRef({});
  const bump = () => {
    suppressUntilRef.current = Date.now() + SUPPRESS_MS;
  };

  // Subscribe to the shared document in real time. Any change made from any
  // device/browser lands here within a moment of it being written.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);

    (async () => {
      try {
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          await setDoc(docRef, { stores: DEFAULT_STORES, kpis: [], entries: {} }, { merge: true });
        }
      } catch (e) {
        if (!cancelled) setConnErr(e.message || String(e));
      }
    })();

    const unsub = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      (snap) => {
        if (cancelled) return;
        setConnErr(null);

        if (Date.now() < suppressUntilRef.current) {
          // A local edit is still "warm" — don't overwrite it on screen.
          setSyncState(snap.metadata.hasPendingWrites ? 'syncing' : snap.metadata.fromCache ? 'offline' : 'synced');
          setLoaded(true);
          return;
        }

        const data = snap.data();
        if (data) {
          if (Array.isArray(data.stores) && data.stores.length) setStores(data.stores);
          if (Array.isArray(data.kpis)) {
            setKpis(data.kpis);
            setActiveKpiId((prev) => {
              if (prev && data.kpis.some((k) => k.id === prev)) return prev;
              return data.kpis.length ? data.kpis[0].id : null;
            });
          }
          if (data.entries) setEntries(data.entries);
        }
        setSyncState(snap.metadata.hasPendingWrites ? 'syncing' : snap.metadata.fromCache ? 'offline' : 'synced');
        setLoaded(true);
      },
      (err) => {
        if (!cancelled) {
          setConnErr(err.message || String(err));
          setLoaded(true);
        }
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [docRef]);

  const addKpi = () => {
    const name = newKpiName.trim();
    if (!name) return;
    bump();
    const kpi = { id: uid(), name, unit: newKpiUnit.trim() };
    const next = [...kpis, kpi];
    setKpis(next);
    setActiveKpiId(kpi.id);
    setNewKpiName('');
    setNewKpiUnit('');
    updateDoc(docRef, { kpis: next }).catch((e) => setConnErr(e.message || String(e)));
  };

  const removeKpi = (id) => {
    bump();
    const nextKpis = kpis.filter((k) => k.id !== id);
    const updates = { kpis: nextKpis };
    Object.keys(entries).forEach((mKey) => {
      if (entries[mKey] && entries[mKey][id] !== undefined) {
        updates[`entries.${mKey}.${id}`] = deleteField();
      }
    });
    setKpis(nextKpis);
    setEntries((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((mKey) => {
        if (next[mKey] && next[mKey][id] !== undefined) {
          const monthEntries = { ...next[mKey] };
          delete monthEntries[id];
          next[mKey] = monthEntries;
        }
      });
      return next;
    });
    if (activeKpiId === id) {
      setActiveKpiId(nextKpis.length ? nextKpis[0].id : null);
    }
    updateDoc(docRef, updates).catch((e) => setConnErr(e.message || String(e)));
  };

  const setValue = (kpiId, storeCode, raw) => {
    bump();
    setEntries((prev) => {
      const monthEntries = { ...(prev[month] || {}) };
      const kpiEntries = { ...(monthEntries[kpiId] || {}) };
      if (raw === '') {
        delete kpiEntries[storeCode];
      } else {
        const num = Number(raw.replace(',', '.'));
        if (!Number.isNaN(num)) kpiEntries[storeCode] = num;
      }
      monthEntries[kpiId] = kpiEntries;
      return { ...prev, [month]: monthEntries };
    });

    const key = `${month}|${kpiId}|${storeCode}`;
    if (writeTimers.current[key]) clearTimeout(writeTimers.current[key]);
    writeTimers.current[key] = setTimeout(() => {
      delete writeTimers.current[key];
      const path = `entries.${month}.${kpiId}.${storeCode}`;
      const num = raw === '' ? null : Number(raw.replace(',', '.'));
      const payload = raw === '' || Number.isNaN(num) ? { [path]: deleteField() } : { [path]: num };
      updateDoc(docRef, payload).catch((e) => setConnErr(e.message || String(e)));
    }, WRITE_DEBOUNCE_MS);
  };

  const getValue = (kpiId, storeCode) => {
    const v = entries[month]?.[kpiId]?.[storeCode];
    return v === undefined ? '' : String(v);
  };

  const updateStoreName = (code, name) => {
    bump();
    const next = stores.map((s) => (s.code === code ? { ...s, name } : s));
    setStores(next);
    const key = `storename|${code}`;
    if (writeTimers.current[key]) clearTimeout(writeTimers.current[key]);
    writeTimers.current[key] = setTimeout(() => {
      delete writeTimers.current[key];
      updateDoc(docRef, { stores: next }).catch((e) => setConnErr(e.message || String(e)));
    }, WRITE_DEBOUNCE_MS);
  };

  const updateStoreCode = (oldCode, newCode) => {
    const trimmed = newCode.trim();
    if (!trimmed || trimmed === oldCode) return;
    bump();
    const nextStores = stores.map((s) => (s.code === oldCode ? { ...s, code: trimmed } : s));
    const updates = { stores: nextStores };

    Object.keys(entries).forEach((mKey) => {
      Object.keys(entries[mKey] || {}).forEach((kId) => {
        const val = entries[mKey][kId]?.[oldCode];
        if (val !== undefined) {
          updates[`entries.${mKey}.${kId}.${oldCode}`] = deleteField();
          updates[`entries.${mKey}.${kId}.${trimmed}`] = val;
        }
      });
    });

    setStores(nextStores);
    setEntries((prev) => {
      const next = {};
      Object.keys(prev).forEach((mKey) => {
        const monthEntries = {};
        Object.keys(prev[mKey] || {}).forEach((kId) => {
          const kpiEntries = { ...(prev[mKey][kId] || {}) };
          if (kpiEntries[oldCode] !== undefined) {
            kpiEntries[trimmed] = kpiEntries[oldCode];
            delete kpiEntries[oldCode];
          }
          monthEntries[kId] = kpiEntries;
        });
        next[mKey] = monthEntries;
      });
      return next;
    });

    updateDoc(docRef, updates).catch((e) => setConnErr(e.message || String(e)));
  };

  const addStore = () => {
    bump();
    let code = 'J000';
    let n = 1;
    while (stores.some((s) => s.code === code)) {
      code = `J${String(n).padStart(3, '0')}`;
      n += 1;
    }
    const next = [...stores, { code, name: 'Новий магазин' }];
    setStores(next);
    updateDoc(docRef, { stores: next }).catch((e) => setConnErr(e.message || String(e)));
  };

  const removeStore = (code) => {
    bump();
    const next = stores.filter((s) => s.code !== code);
    setStores(next);
    updateDoc(docRef, { stores: next }).catch((e) => setConnErr(e.message || String(e)));
  };

  const activeKpi = kpis.find((k) => k.id === activeKpiId) || null;

  const monthEntriesForActive = activeKpi ? entries[month]?.[activeKpi.id] || {} : {};
  const values = stores.map((s) => monthEntriesForActive[s.code]).filter((v) => typeof v === 'number');
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const best = values.length ? Math.max(...values) : null;
  const worst = values.length ? Math.min(...values) : null;

  const trendData = useMemo(() => {
    if (!activeKpi) return [];
    const keys = [];
    for (let i = 5; i >= 0; i -= 1) keys.push(shiftMonth(month, -i));
    return keys.map((mKey) => {
      const row = { month: monthLabel(mKey) };
      const mData = entries[mKey]?.[activeKpi.id] || {};
      const vals = Object.values(mData).filter((v) => typeof v === 'number');
      row.average = vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : null;
      return row;
    });
  }, [entries, activeKpi, month]);

  const fmt = (n) => {
    if (n === null || n === undefined) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  };

  const shareUrl = useMemo(() => {
    const url = new URL(window.location.href);
    url.search = room === 'default' ? '' : `?room=${encodeURIComponent(room)}`;
    return url.toString();
  }, [room]);

  const goToRoom = () => {
    const clean = roomInput.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!clean) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', clean);
    window.location.href = url.toString();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // clipboard not available — user can select the text manually
    }
  };

  if (!loaded) {
    return <div className="p-8 text-sm text-neutral-500">Завантаження…</div>;
  }

  return (
    <div className="w-full min-h-screen bg-white text-neutral-900 font-sans">
      <div className="border-b border-neutral-200 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Kyiv-1 — Трекер показників дістрікту</h1>
          <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{stores.length} магазинів · {kpis.length} показників</span>
            <SyncBadge state={syncState} />
            {room !== 'default' && (
              <span className="text-neutral-400">· кімната: <span className="font-mono">{room}</span></span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShareOpen((v) => !v)}
            className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50"
          >
            🔗 Поділитися
          </button>
          <div className="flex items-center gap-1 border border-neutral-200 rounded-md px-1 py-1">
            <button
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-600"
              aria-label="Попередній місяць"
            >
              ‹
            </button>
            <span className="text-sm font-medium px-3 min-w-[110px] text-center">{monthLabel(month)}</span>
            <button
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-600"
              aria-label="Наступний місяць"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {shareOpen && (
        <div className="px-6 py-4 border-b border-neutral-200 bg-neutral-50 space-y-3">
          <div>
            <p className="text-xs text-neutral-500 mb-1">
              Будь-хто з цим посиланням бачить і редагує ці ж дані в реальному часі:
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.target.select()}
                className="flex-1 border border-neutral-300 rounded px-2 py-1.5 text-sm font-mono bg-white"
              />
              <button
                onClick={copyLink}
                className="px-3 py-1.5 text-sm rounded bg-neutral-900 text-white whitespace-nowrap"
              >
                {copied ? 'Скопійовано ✓' : 'Копіювати'}
              </button>
            </div>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-1">
              Перейти в інший (окремий) трекер за кодом кімнати:
            </p>
            <div className="flex items-center gap-2">
              <input
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="напр. dnipro-district"
                className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-64"
                onKeyDown={(e) => e.key === 'Enter' && goToRoom()}
              />
              <button
                onClick={goToRoom}
                disabled={!roomInput.trim()}
                className="px-3 py-1.5 text-sm rounded border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40"
              >
                Перейти
              </button>
            </div>
          </div>
        </div>
      )}

      {connErr && (
        <div className="px-6 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50">
          Помилка синхронізації: {connErr}
        </div>
      )}

      <div className="px-6 py-4 border-b border-neutral-200">
        <div className="flex items-center flex-wrap gap-2">
          {kpis.map((k) => (
            <button
              key={k.id}
              onClick={() => setActiveKpiId(k.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                activeKpiId === k.id
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:border-neutral-400'
              }`}
            >
              {k.name}
              {k.unit ? <span className="opacity-60 ml-1">({k.unit})</span> : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <input
            value={newKpiName}
            onChange={(e) => setNewKpiName(e.target.value)}
            placeholder="Назва показника (напр. Конверсія)"
            className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-64"
            onKeyDown={(e) => e.key === 'Enter' && addKpi()}
          />
          <input
            value={newKpiUnit}
            onChange={(e) => setNewKpiUnit(e.target.value)}
            placeholder="Од. виміру (напр. %, грн)"
            className="border border-neutral-300 rounded px-2 py-1.5 text-sm w-40"
            onKeyDown={(e) => e.key === 'Enter' && addKpi()}
          />
          <button
            onClick={addKpi}
            disabled={!newKpiName.trim()}
            className="px-3 py-1.5 text-sm rounded bg-neutral-900 text-white disabled:opacity-40"
          >
            Додати показник
          </button>
          {activeKpi ? (
            <button
              onClick={() => removeKpi(activeKpi.id)}
              className="px-3 py-1.5 text-sm rounded border border-red-200 text-red-600 hover:bg-red-50 ml-auto"
            >
              Видалити «{activeKpi.name}»
            </button>
          ) : null}
        </div>
      </div>

      {kpis.length === 0 ? (
        <div className="px-6 py-10 text-center text-neutral-500 text-sm">
          Додайте перший показник вище, щоб почати вносити дані.
        </div>
      ) : !activeKpi ? (
        <div className="px-6 py-10 text-center text-neutral-500 text-sm">Оберіть показник зі списку вище.</div>
      ) : (
        <>
          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-neutral-200 bg-neutral-50">
            <div className="bg-white rounded-md border border-neutral-200 px-4 py-3">
              <p className="text-xs text-neutral-500">Середнє по дістрікту</p>
              <p className="text-xl font-semibold mt-1">
                {fmt(avg)} <span className="text-sm font-normal text-neutral-500">{activeKpi.unit}</span>
              </p>
            </div>
            <div className="bg-white rounded-md border border-neutral-200 px-4 py-3">
              <p className="text-xs text-neutral-500">Найкращий результат</p>
              <p className="text-xl font-semibold mt-1 text-emerald-700">
                {fmt(best)} <span className="text-sm font-normal text-neutral-500">{activeKpi.unit}</span>
              </p>
            </div>
            <div className="bg-white rounded-md border border-neutral-200 px-4 py-3">
              <p className="text-xs text-neutral-500">Найгірший результат</p>
              <p className="text-xl font-semibold mt-1 text-red-700">
                {fmt(worst)} <span className="text-sm font-normal text-neutral-500">{activeKpi.unit}</span>
              </p>
            </div>
          </div>

          <div className="px-6 py-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-200">
                  <th className="py-2 pr-2 font-medium w-24">Код</th>
                  <th className="py-2 pr-2 font-medium">Магазин</th>
                  <th className="py-2 pl-2 font-medium w-40 text-right">
                    {activeKpi.name}
                    {activeKpi.unit ? ` (${activeKpi.unit})` : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const val = monthEntriesForActive[s.code];
                  const isBest = typeof val === 'number' && val === best && values.length > 1;
                  const isWorst = typeof val === 'number' && val === worst && values.length > 1;
                  return (
                    <tr key={s.code} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-2 text-neutral-500 font-mono text-xs">{s.code}</td>
                      <td className="py-1.5 pr-2">{s.name}</td>
                      <td className="py-1.5 pl-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getValue(activeKpi.id, s.code)}
                          onChange={(e) => setValue(activeKpi.id, s.code, e.target.value)}
                          placeholder="—"
                          className={`w-28 text-right border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-neutral-900 ${
                            isBest ? 'border-emerald-300 bg-emerald-50' : isWorst ? 'border-red-300 bg-red-50' : 'border-neutral-300'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-neutral-200">
            <p className="text-xs text-neutral-500 mb-2">Динаміка середнього по дістрікту (6 місяців)</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#737373' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#737373' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="average" stroke="#171717" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div className="px-6 py-4 border-t border-neutral-200">
        <button
          onClick={() => setEditingStores((v) => !v)}
          className="text-sm text-neutral-600 hover:text-neutral-900 underline"
        >
          {editingStores ? 'Сховати список магазинів' : 'Керувати списком магазинів'}
        </button>
        {editingStores && (
          <div className="mt-3 space-y-2">
            {stores.map((s) => (
              <div key={s.code} className="flex items-center gap-2">
                <input
                  defaultValue={s.code}
                  onBlur={(e) => updateStoreCode(s.code, e.target.value)}
                  className="border border-neutral-300 rounded px-2 py-1 text-xs font-mono w-24"
                />
                <input
                  value={s.name}
                  onChange={(e) => updateStoreName(s.code, e.target.value)}
                  className="border border-neutral-300 rounded px-2 py-1 text-sm flex-1"
                />
                <button
                  onClick={() => removeStore(s.code)}
                  className="text-xs text-red-600 hover:underline px-2"
                >
                  Видалити
                </button>
              </div>
            ))}
            <button
              onClick={addStore}
              className="text-sm px-3 py-1.5 rounded border border-neutral-300 hover:bg-neutral-50"
            >
              + Додати магазин
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SyncBadge({ state }) {
  const map = {
    connecting: { label: 'Підключення…', color: 'bg-neutral-300' },
    synced: { label: 'Онлайн · синхронізовано', color: 'bg-emerald-500' },
    syncing: { label: 'Синхронізація…', color: 'bg-amber-500' },
    offline: { label: 'Офлайн (зміни збережуться, коли з’явиться інтернет)', color: 'bg-red-500' },
  };
  const s = map[state] || map.connecting;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
      <span>{s.label}</span>
    </span>
  );
}
