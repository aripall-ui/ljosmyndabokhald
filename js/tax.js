// Estimated taxes for a sole trader in Iceland (estimate, not an assessment).
// Sources: Skatturinn – "Skatthlutfall, skattþrep og persónuafsláttur ársins 2026" and "Helstu tölur og prósentur 2026".
import { summarize } from './calc.js';
import { periodRange, todayISO } from './util.js';

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

export function taxEstimate(data, year) {
  const s = data.settings;
  const p = params(year);
  const r = summarize(data, periodRange({ year, kind: 'year' }));
  const frac = elapsed(year);
  const profit = r.revenueNet - r.cost; // so far this year
  const projected = frac > 0 ? profit / frac : 0; // whole-year projection

  // Reiknað endurgjald: the yearly amount from settings, otherwise the whole profit (cautious estimate)
  const ownPay = s.ownPay === '' || s.ownPay == null ? null : Number(s.ownPay);
  const calc = (prof, share) => {
    const R = Math.max(0, Math.min(ownPay == null ? prof : ownPay * share, prof));
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
    params: p,
  };
}
