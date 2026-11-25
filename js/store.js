import { notify } from './notify.js';
// App state + persistence. Data lives in one JSON document.
// Local mode: IndexedDB in this browser. Dropbox mode: /data.json in the app folder (IndexedDB used as cache).
import { idbGet, idbSet } from './idb.js';
import * as dbx from './dropbox.js';
import { uid, safeFileName, todayISO } from './util.js';

export const COLLECTIONS = ['clients', 'gigs', 'invoices', 'expenses', 'purchases'];

export const DEFAULT_SETTINGS = {
  vatRate: 24,
  dueDays: 14,
  vatFrom: '',
  vatExemptCategories: ['Tónlist'],
  utsvar: 14.97, // Reykjavík
  otherIncome: 0,
  ownPayMonthly: '',
  ownPayFrom: '',
  pensionOn: true,
  taxPrepaid: 0,
  hourlyRate: 15000,
  categories: ['Brúðkaup', 'Portrett', 'Fermingar', 'Fjölskyldumyndir', 'Viðburðir', 'Fyrirtæki og auglýsingar', 'Vörumyndir', 'Fasteignir', 'Annað'],
  expenseCategories: ['Búnaður', 'Hugbúnaður', 'Áskriftir', 'Þjónusta', 'Ferðakostnaður', 'Sími og net', 'Markaðsmál', 'Námskeið', 'Annað'],
  updatedAt: 0,
};

export function emptyData() {
  const d = { version: 1, settings: { ...DEFAULT_SETTINGS }, deleted: {} };
  COLLECTIONS.forEach((c) => (d[c] = []));
  return d;
}

function normalize(d) {
  const e = emptyData();
  if (!d || typeof d !== 'object') return e;
  e.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
  e.deleted = { ...(d.deleted || {}) };
  COLLECTIONS.forEach((c) => (e[c] = Array.isArray(d[c]) ? d[c] : []));
  return e;
}

// Record-level merge: newest updatedAt wins, deletions are kept as tombstones
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const out = emptyData();
  out.settings = (b.settings.updatedAt || 0) > (a.settings.updatedAt || 0) ? b.settings : a.settings;
  out.deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) out.deleted[id] = Math.max(out.deleted[id] || 0, t);
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const r of [...a[c], ...b[c]]) {
      const cur = map.get(r.id);
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) map.set(r.id, r);
    }
    out[c] = [...map.values()].filter((r) => !(out.deleted[r.id] >= (r.updatedAt || 0)));
  }
  return out;
}

// ---------- state ----------
let data = emptyData();
let mode = localStorage.getItem('mode'); // 'local' | 'dropbox' | null
let rev = localStorage.getItem('dbx_rev') || null;
let dirty = localStorage.getItem('dirty') === '1';
let sync = { status: 'idle', message: '' };
const listeners = new Set();

export const getData = () => data;
export const getMode = () => mode;
export const getSync = () => sync;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }
function setSync(status, message = '') { sync = { status, message }; emit(); }
function setDirty(v) { dirty = v; localStorage.setItem('dirty', v ? '1' : '0'); }

// ---------- mutations ----------
function commit(next) {
  data = next;
  idbSet('data', data).catch(() => {});
  setDirty(true);
  emit();
  schedulePush();
}

export function upsert(col, rec) {
  const r = { ...rec, id: rec.id || uid(), updatedAt: Date.now() };
  if (!rec.createdAt) r.createdAt = r.updatedAt;
  const list = data[col].filter((x) => x.id !== r.id);
  list.push(r);
  commit({ ...data, [col]: list });
  return r;
}
export function remove(col, id) {
  commit({ ...data, [col]: data[col].filter((x) => x.id !== id), deleted: { ...data.deleted, [id]: Date.now() } });
}
export function updateSettings(patch) {
  commit({ ...data, settings: { ...data.settings, ...patch, updatedAt: Date.now() } });
}
export function find(col, id) { return id ? data[col].find((x) => x.id === id) : undefined; }

// ---------- persistence ----------
let pushTimer = null;
function schedulePush() {
  if (mode !== 'dropbox') { setDirty(false); return; }
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 800);
}

let busy = null;
async function push() {
  if (mode !== 'dropbox' || !dirty) return;
  if (busy) { await busy; return push(); }
  busy = (async () => {
    setSync('saving');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = data;
        try {
          const res = await dbx.upload('/data.json', JSON.stringify(snapshot), rev ? { update: rev } : 'add');
          rev = res.rev; localStorage.setItem('dbx_rev', rev);
          if (data === snapshot) setDirty(false);
          break;
        } catch (e) {
          if (e.status !== 409) throw e;
          await pullRemote(); // someone else saved (e.g. phone) – merge and try again
        }
      }
      setSync(dirty ? 'saving' : 'idle');
      if (dirty) schedulePush();
    } catch (e) {
      handleError(e);
    }
  })();
  try { await busy; } finally { busy = null; }
}

async function pullRemote() {
  const remote = await dbx.download('/data.json');
  if (!remote) { rev = null; localStorage.removeItem('dbx_rev'); return; }
  const remoteData = JSON.parse(await remote.blob.text());
  data = merge(data, remoteData);
  rev = remote.rev; localStorage.setItem('dbx_rev', rev);
  idbSet('data', data).catch(() => {});
  emit();
}

function handleError(e) {
  console.error(e);
  if (e instanceof dbx.AuthError) setSync('auth', 'Tengjast þarf Dropbox aftur');
  else if (!navigator.onLine) setSync('offline', 'Ótengt – vistast þegar netið kemur');
  else setSync('error', e.message || 'Villa við vistun');
}

// One-time data updates after the app changes (run after the latest data has loaded)
function migrate() {
  if (data.settings.taxV === 1) {
    const st = data.settings;
    const patch = { taxV: 2 };
    if (st.ownPay !== '' && st.ownPay != null && (st.ownPayMonthly === '' || st.ownPayMonthly == null)) { patch.ownPayMonthly = Math.round(Number(st.ownPay) / 12); patch.ownPayFrom = `${new Date().getFullYear()}-01`; }
    updateSettings(patch);
  }
  if (data.settings.taxV === 2) {
    const st = data.settings;
    updateSettings({ taxV: 3, ...(st.ownPayMonthly === '' || st.ownPayMonthly == null ? { ownPayMonthly: 100000, ownPayFrom: '2026-10' } : {}) });
  }
  if (!data.settings.taxV) {
    const u = data.settings.utsvar;
    updateSettings({ taxV: 2, ...(u == null || u === 14.94 ? { utsvar: 14.97 } : {}) });
    migrate();
  }
}

export async function refresh() {
  if (mode !== 'dropbox') return;
  if (busy) return;
  try {
    setSync('saving', 'Sæki gögn…');
    await pullRemote();
    setSync('idle');
    migrate();
    if (dirty) await push();
  } catch (e) { handleError(e); }
}

export async function init() {
  let justConnected = false;
  try { justConnected = await dbx.handleRedirect(); } catch (e) { notify(e.message, 'error'); }
  const cached = await idbGet('data').catch(() => null);
  if (cached) data = normalize(cached);
  if (justConnected) {
    const wasLocal = mode === 'local';
    mode = 'dropbox'; localStorage.setItem('mode', 'dropbox');
    rev = null; localStorage.removeItem('dbx_rev');
    if (wasLocal) await migrateLocalFiles();
    setDirty(true); // merge local data into Dropbox
  }
  if (isDemo() && !mode) {
    mode = 'local';
    try { localStorage.setItem('mode', 'local'); } catch { /* ignore */ }
    const { sampleData } = await import('./sample.js');
    data = sampleData();
    idbSet('data', data).catch(() => {});
  }
  emit();
  if (mode === 'local') migrate();
  if (mode === 'dropbox') {
    if (!dbx.isConnected()) setSync('auth', 'Tengjast þarf Dropbox aftur');
    else refresh();
    window.addEventListener('online', () => refresh());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  }
}

export const isDemo = () => !!(window.APP_CONFIG && window.APP_CONFIG.demo);
export function replaceAll(next) { commit(normalize(next)); }

export function useLocalMode() {
  mode = 'local'; localStorage.setItem('mode', 'local'); emit();
}
export function connectDropbox(key) { return dbx.startAuth(key); }
export function disconnectDropbox() {
  dbx.disconnect();
  setSync('auth', 'Ekki tengt við Dropbox');
}

// ---------- files ----------
// folder e.g. 'Reikningar/2026'. Returns {path, name}
export async function putFile(folder, file, baseName) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  const name = safeFileName(baseName || file.name.replace(/\.[^.]+$/, '')) + ext;
  const path = `/${folder}/${name}`;
  if (mode === 'dropbox') {
    const res = await dbx.upload(path, file, 'add', true);
    return { path: res.path_display, name: res.path_display.split('/').pop(), size: file.size, type: file.type };
  }
  const p = `${path}#${Date.now()}`;
  await idbSet('file:' + p, file);
  return { path: p, name, size: file.size, type: file.type, local: true };
}

export async function fileBlob(att) {
  if (att.local) return idbGet('file:' + att.path);
  const r = await dbx.download(att.path);
  return r && r.blob;
}

export async function openFile(att) {
  const w = window.open('', '_blank');
  try {
    let url;
    if (att.local) url = URL.createObjectURL(await idbGet('file:' + att.path));
    else url = await dbx.tempLink(att.path);
    if (w) w.location.href = url; else if (att.local) notify('Ekki hægt að opna skjöl í þessari prufuútgáfu.', 'error'); else location.href = url;
  } catch (e) {
    if (w) w.close();
    notify('Tókst ekki að opna skjalið: ' + e.message, 'error');
  }
}

async function migrateLocalFiles() {
  const fix = async (rec) => {
    if (!rec.attachment || !rec.attachment.local) return rec;
    const blob = await idbGet('file:' + rec.attachment.path);
    if (!blob) return rec;
    const path = rec.attachment.path.replace(/#\d+$/, '');
    const res = await dbx.upload(path, blob, 'add', true);
    return { ...rec, attachment: { ...rec.attachment, path: res.path_display, name: res.path_display.split('/').pop(), local: false }, updatedAt: Date.now() };
  };
  try {
    const next = { ...data };
    for (const c of ['invoices', 'expenses']) next[c] = await Promise.all(data[c].map(fix));
    data = next;
    await idbSet('data', data);
  } catch (e) {
    notify('Ekki tókst að færa öll skjöl í Dropbox: ' + e.message, 'error');
  }
}

// ---------- backup ----------
export function exportJSON() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `afrit-${todayISO()}.json`;
  a.click();
}
// Imports a backup or an import file. Clients that already exist (same kennitala or name)
// are reused, and invoices whose number is already registered are skipped with their gig.
export async function importJSON(file) {
  const inc = normalize(JSON.parse(await file.text()));
  const norm = (s) => (s || '').trim().toLowerCase();
  const clientMap = {};
  inc.clients = inc.clients.filter((c) => {
    const same = data.clients.find((x) => x.id !== c.id && ((c.kennitala && x.kennitala && x.kennitala.replace(/\D/g, '') === c.kennitala.replace(/\D/g, '')) || norm(x.name) === norm(c.name)));
    if (same) { clientMap[c.id] = same.id; return false; }
    return true;
  });
  const remap = (r) => (r.clientId && clientMap[r.clientId] ? { ...r, clientId: clientMap[r.clientId] } : r);
  const known = new Set(data.invoices.map((i) => norm(i.number)).filter(Boolean));
  const skippedGigs = new Set();
  let skipped = 0;
  inc.invoices = inc.invoices.filter((i) => {
    const dup = i.number && known.has(norm(i.number)) && !data.invoices.some((x) => x.id === i.id);
    if (dup) { skipped++; if (i.gigId) skippedGigs.add(i.gigId); }
    return !dup;
  }).map(remap);
  inc.gigs = inc.gigs.filter((g) => !skippedGigs.has(g.id)).map(remap);
  const isNew = (col) => (r) => !data[col].some((x) => x.id === r.id);
  const counts = { invoices: inc.invoices.filter(isNew('invoices')).length, gigs: inc.gigs.filter(isNew('gigs')).length, clients: inc.clients.filter(isNew('clients')).length, skipped };
  let next = merge(data, inc);
  const patch = JSON.parse(await file.text()).settingsPatch;
  if (patch) {
    const st = { ...next.settings };
    if (patch.vatFrom) st.vatFrom = patch.vatFrom;
    if (patch.addCategories) st.categories = [...new Set([...st.categories.filter((c) => c !== 'Annað'), ...patch.addCategories, ...(st.categories.includes('Annað') ? ['Annað'] : [])])];
    next = { ...next, settings: { ...st, updatedAt: Date.now() } };
  }
  commit(next);
  return counts;
}
