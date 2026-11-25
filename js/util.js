// Formatting, dates, VAT and small helpers (Icelandic conventions)

export const MONTHS = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
export const MONTHS_SHORT = ['jan.', 'feb.', 'mar.', 'apr.', 'maí', 'jún.', 'júl.', 'ágú.', 'sep.', 'okt.', 'nóv.', 'des.'];
export const VAT_PERIODS = ['jan.–feb.', 'mar.–apr.', 'maí–jún.', 'júl.–ágú.', 'sep.–okt.', 'nóv.–des.'];

const pad = (n) => String(n).padStart(2, '0');

export function fmtNum(n) {
  n = Math.round(Number(n) || 0);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + s;
}
export const kr = (n) => fmtNum(n) + ' kr.';

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONTHS_SHORT[m - 1]} ${y}`;
}
export function fmtDateNum(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
export function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((new Date(pb[0], pb[1] - 1, pb[2]) - new Date(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
export const yearOf = (iso) => (iso ? Number(iso.slice(0, 4)) : null);
export const monthOf = (iso) => (iso ? Number(iso.slice(5, 7)) : null);

// Period filter: {year, kind: 'year'|'month'|'vat', n}
export function periodRange(p) {
  const y = p.year;
  if (p.kind === 'month') {
    const last = new Date(y, p.n, 0).getDate();
    return [`${y}-${pad(p.n)}-01`, `${y}-${pad(p.n)}-${pad(last)}`];
  }
  if (p.kind === 'vat') {
    const m1 = p.n * 2 - 1, m2 = p.n * 2;
    const last = new Date(y, m2, 0).getDate();
    return [`${y}-${pad(m1)}-01`, `${y}-${pad(m2)}-${pad(last)}`];
  }
  return [`${y}-01-01`, `${y}-12-31`];
}
export function periodLabel(p) {
  if (p.kind === 'month') return `${MONTHS[p.n - 1]} ${p.year}`;
  if (p.kind === 'vat') return `${VAT_PERIODS[p.n - 1]} ${p.year}`;
  return `Árið ${p.year}`;
}
export const inRange = (iso, [a, b]) => !!iso && iso >= a && iso <= b;

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Parse "12.500", "12 500 kr", "12500,5" -> number
export function parseAmount(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/kr\.?/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// VAT: amounts in whole krónur
export function calcVat(amount, rate, inclVat) {
  amount = Math.round(Number(amount) || 0);
  const r = (Number(rate) || 0) / 100;
  if (inclVat) {
    const net = Math.round(amount / (1 + r));
    return { net, vat: amount - net, gross: amount };
  }
  const vat = Math.round(amount * r);
  return { net: amount, vat, gross: amount + vat };
}

export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const roundTo = (n, step) => Math.round(n / step) * step;
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

export function safeFileName(s) {
  return String(s || 'skjal').replace(/[\/\\:*?"<>|#%]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '') || 'skjal';
}
export function asciiName(s) {
  const map = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ý: 'y', ð: 'd', þ: 'th', æ: 'ae', ö: 'o' };
  return String(s).toLowerCase().replace(/[áéíóúýðþæö]/g, (c) => map[c]).replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-');
}
