// Estimated taxes for a sole trader in Iceland (estimate, not an assessment).
// Sources: Skatturinn – "Skatthlutfall, skattþrep og persónuafsláttur ársins 2026" and "Helstu tölur og prósentur 2026".
import { summarize, isVatRegistered } from './calc.js';
import { periodRange, todayISO, calcVat } from './util.js';

export const TAX_YEARS = {
  2026: {
    brackets: [ // monthly upper limits and rates incl. average útsvar (14,94%)
      { upTo: 498122, rate: 31.49 },
      { upTo: 1398450, rate: 37.99 },
      { upTo: Infinity, rate: 46.29 },
    ],
    avgUtsvar: 14.94,
    personalAllowance: 869898, // per year
    tryggingagjald: 6.35,
    pension: 15.5, // 4% employee + 11,5% employer (mandatory on reiknað endurgjald)
  },
};
const params = (year) => TAX_YEARS[year] || TAX_YEARS[Math.max(...Object.keys(TAX_YEARS).map(Number))];

// Annual income tax + útsvar on income x, after personal allowance
export function incomeTax(x, year, utsvar) {
  const p = params(year);
  const adj = (Number(utsvar) || p.avgUtsvar) - p.avgUtsvar;
  let tax = 0, prev = 0;
  for (const b of p.brackets) {
    const top = b.upTo * 12;
    if (x > prev) tax += (Math.min(x, top) - prev) * (b.rate + adj) / 100;
    prev = top;
  }
  return Math.max(0, tax - p.personalAllowance);
}

// Share of the year elapsed (for "so far" figures)
function elapsed(year) {
  const now = new Date();
  if (year < now.getFullYear()) return 1;
  if (year > now.getFullYear()) return 0;
  const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);
  return Math.max(1 / 365, (now - start) / (end - start));
}

// VAT periods: due on the 5th of the second month after the period ends
export function vatDueDate(year, n) {
  const m = n * 2 + 2; // month number of the due date (can roll into next year)
  const y = year + Math.floor((m - 1) / 12);
  const mm = ((m - 1) % 12) + 1;
  return `${y}-${String(mm).padStart(2, '0')}-05`;
}

// Months of reiknað endurgjald in a year, from start month 'YYYY-MM' (inclusive)
export function ownPayMonths(year, from) {
  const [fy, fm] = (from || `${year}-01`).split('-').map(Number);
  const startM = fy < year ? 1 : fy > year ? 13 : fm;
  const now = new Date();
  const curM = year < now.getFullYear() ? 12 : year > now.getFullYear() ? 0 : now.getMonth() + 1;
  return { year: Math.max(0, 12 - startM + 1), soFar: Math.max(0, curM - startM + 1) };
}

export function taxEstimate(data, year) {
  const s = data.settings;
  const p = params(year);
  const r = summarize(data, periodRange({ year, kind: 'year' }));
  const frac = elapsed(year);
  const profit = r.revenueNet - r.cost; // so far this year
  const projected = frac > 0 ? profit / frac : 0; // whole-year projection

  // Reiknað endurgjald: monthly amount from a start month; if not set, the whole profit (cautious estimate)
  const monthly = s.ownPayMonthly === '' || s.ownPayMonthly == null ? null : Number(s.ownPayMonthly);
  const months = ownPayMonths(year, s.ownPayFrom);
  const calc = (prof, share) => {
    const m = share === 1 ? months.year : months.soFar;
    const R = Math.max(0, Math.min(monthly == null ? prof : monthly * m, prof));
    const tg = R * p.tryggingagjald / 100;
    const pension = s.pensionOn === false ? 0 : R * p.pension / 100;
    const base = Math.max(0, prof - tg - pension); // tryggingagjald and pension are deductible
    return { R, tg, pension, base };
  };
  const full = calc(projected, 1);
  const other = Number(s.otherIncome) || 0;
  const taxYear = incomeTax(other + full.base, year, s.utsvar) - incomeTax(other, year, s.utsvar);
  const effRate = full.base > 0 ? taxYear / full.base : 0; // marginal rate on top of other income
  const now = calc(profit, frac);
  const incomeTaxNow = now.base * effRate;

  // VAT per two-month period; periods whose due date has passed are assumed paid
  const today = todayISO();
  const vatPeriods = [1, 2, 3, 4, 5, 6].map((n) => {
    const x = summarize(data, periodRange({ year, kind: 'vat', n }));
    return { n, due: vatDueDate(year, n), amount: x.vatPayable, out: x.outputVat, in: x.deductibleVat, paid: vatDueDate(year, n) < today };
  }).filter((v) => v.out || v.in);
  const vatToPay = vatPeriods.filter((v) => !v.paid).reduce((a, v) => a + v.amount, 0);
  const nextVat = vatPeriods.find((v) => !v.paid);

  const prepaid = Number(s.taxPrepaid) || 0;
  const directNow = Math.round(incomeTaxNow + now.tg);
  const pensionNow = Math.round(now.pension);
  return {
    year, frac, profit, projected, effRate, prepaid,
    now: { R: Math.round(now.R), base: Math.round(now.base), tg: Math.round(now.tg), pension: pensionNow, incomeTax: Math.round(incomeTaxNow) },
    full: { R: Math.round(full.R), base: Math.round(full.base), tg: Math.round(full.tg), pension: Math.round(full.pension), incomeTax: Math.round(taxYear) },
    vat: { periods: vatPeriods, toPay: Math.max(0, vatToPay), next: nextVat },
    setAside: Math.max(0, directNow - prepaid) + pensionNow + Math.max(0, vatToPay),
    // Monthly claim from Skatturinn on reiknað endurgjald: withholding at the marginal rate + tryggingagjald
    monthly: monthly ? {
      amount: monthly, months,
      tax: Math.round(monthly * (incomeTax(other + monthly * 12, year, s.utsvar) - incomeTax(other, year, s.utsvar)) / (monthly * 12)),
      tg: Math.round(monthly * p.tryggingagjald / 100),
      pension: Math.round(monthly * p.pension / 100),
    } : null,
    params: p,
  };
}

// How much a purchase lowers what you owe: income tax (and tryggingagjald if all profit is reiknað endurgjald)
// on the cost excl. deductible VAT, plus the input VAT deducted from the next VAT return.
// items: [{ amount, inclVat, vatRate }] bought today.
export function purchaseTaxEffect(data, year, items) {
  const today = todayISO();
  const s = data.settings;
  const extra = items.map((it, i) => {
    const v = calcVat(it.amount, it.vatRate, it.inclVat);
    const ded = isVatRegistered(s, today) ? v.vat : 0;
    return { id: 'whatif-' + i, date: today, ...v, deductibleVat: ded };
  });
  const before = taxEstimate(data, year);
  const after = taxEstimate({ ...data, expenses: [...data.expenses, ...extra] }, year);
  const gross = extra.reduce((a, e) => a + e.gross, 0);
  const vatBack = extra.reduce((a, e) => a + e.deductibleVat, 0);
  const incomeTax = (before.now.incomeTax + before.now.tg) - (after.now.incomeTax + after.now.tg);
  const saving = Math.max(0, incomeTax) + vatBack;
  return { gross, vatBack, incomeTax: Math.max(0, incomeTax), saving, realCost: gross - saving, before: before.setAside, after: Math.max(0, before.setAside - saving) };
}
