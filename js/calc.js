// Domain rules and derived figures
import { calcVat, sum, todayISO, inRange, yearOf, median, roundTo, daysBetween, addDays, fmtNum } from './util.js';

export const GIG_STATUS = { bokad: 'Bókað', vinnsla: 'Í vinnslu', afhent: 'Afhent', lokid: 'Lokið', haett: 'Hætt við' };
export const PRICING = { samid: 'Samið', osamid: 'Ósamið', probono: 'Pro bono', greidi: 'Greiði' };
export const INV_STATUS = { osent: 'Ósent', sent: 'Sent / ógreitt', greitt: 'Greitt' };
export const PURCHASE_STATUS = { hugmynd: 'Hugmynd', skodun: 'Í skoðun', listi: 'Á innkaupalista', keypt: 'Keypt', fallid: 'Fallið frá' };
export const PRIORITY = { mikil: 'Mikil þörf', gagnlegt: 'Gagnlegt', mabida: 'Má bíða' };
export const ACTIVE_PURCHASE = ['hugmynd', 'skodun', 'listi'];

export const clientName = (data, id) => (data.clients.find((c) => c.id === id) || {}).name || '';

export function gigAmounts(g, settings) {
  return calcVat(g.price || 0, settings.vatRate, !!g.priceInclVat);
}

export const invoiceForGig = (data, gigId) => data.invoices.find((i) => i.gigId === gigId);

// Commercial gigs with an agreed price and no invoice yet
export function gigsNeedingInvoice(data) {
  const invoiced = new Set(data.invoices.map((i) => i.gigId).filter(Boolean));
  return data.gigs
    .filter((g) => g.pricing === 'samid' && g.status !== 'haett' && (g.price || 0) > 0 && !invoiced.has(g.id) && !g.noInvoice)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export const isIssued = (inv) => inv.status === 'sent' || inv.status === 'greitt';
export const isOverdue = (inv, today = todayISO()) => inv.status === 'sent' && inv.dueDate && inv.dueDate < today;

export const expenseCost = (e) => (e.gross || 0) - (e.deductibleVat || 0);

export function summarize(data, range) {
  const issued = data.invoices.filter((i) => isIssued(i) && inRange(i.issueDate, range));
  const paid = data.invoices.filter((i) => i.status === 'greitt' && inRange(i.paidDate || i.issueDate, range));
  const outstanding = data.invoices.filter((i) => i.status === 'sent' && (i.issueDate || '') <= range[1]);
  const unsentInv = data.invoices.filter((i) => i.status === 'osent');
  const needInv = gigsNeedingInvoice(data);
  const exps = data.expenses.filter((e) => inRange(e.date, range));
  const revenueNet = sum(issued, (i) => i.net);
  const outputVat = sum(issued, (i) => i.vat);
  const cost = sum(exps, expenseCost);
  const deductibleVat = sum(exps, (e) => e.deductibleVat);
  return {
    issued, paid, outstanding, exps, unsentInv, needInv,
    revenueNet, outputVat, revenueGross: sum(issued, (i) => i.gross),
    received: sum(paid, (i) => i.gross),
    outstandingGross: sum(outstanding, (i) => i.gross),
    unsentGross: sum(unsentInv, (i) => i.gross) + sum(needInv, (g) => gigAmounts(g, data.settings).gross),
    unsentCount: unsentInv.length + needInv.length,
    expenseNet: sum(exps, (e) => e.net), expenseVat: sum(exps, (e) => e.vat), expenseGross: sum(exps, (e) => e.gross),
    cost, deductibleVat,
    result: revenueNet - cost,
    vatPayable: outputVat - deductibleVat,
    foreignCount: exps.filter((e) => e.foreign).length,
  };
}

export function yearsInData(data) {
  const ys = new Set([new Date().getFullYear()]);
  data.gigs.forEach((g) => g.date && ys.add(yearOf(g.date)));
  data.invoices.forEach((i) => i.issueDate && ys.add(yearOf(i.issueDate)));
  data.expenses.forEach((e) => e.date && ys.add(yearOf(e.date)));
  return [...ys].sort((a, b) => b - a);
}

export function upcomingGigs(data, n = 6) {
  const t = todayISO();
  return data.gigs.filter((g) => g.date >= t && g.status !== 'haett').sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
}

// Items requiring attention: [{kind, text, sub, open: {type,id}, tone}]
export function attentionItems(data) {
  const t = todayISO();
  const items = [];
  for (const i of data.invoices) {
    if (isOverdue(i, t)) items.push({ tone: 'red', text: `Reikningur ${i.number || ''} er kominn fram yfir gjalddaga`, sub: `${clientName(data, i.clientId)} · ${daysBetween(i.dueDate, t)} dagar`, open: { type: 'invoice', id: i.id } });
  }
  for (const i of data.invoices.filter((i) => i.status === 'osent')) {
    items.push({ tone: 'amber', text: `Reikningur ósendur: ${i.description || i.number || 'án lýsingar'}`, sub: clientName(data, i.clientId), open: { type: 'invoice', id: i.id } });
  }
  for (const g of gigsNeedingInvoice(data)) {
    if (g.status === 'afhent' || g.status === 'lokid' || (g.date && g.date < addDays(t, -14))) {
      items.push({ tone: 'amber', text: `Vantar reikning: ${g.title}`, sub: `${clientName(data, g.clientId)} · ${GIG_STATUS[g.status]}`, open: { type: 'newInvoiceFromGig', id: g.id } });
    }
  }
  for (const g of data.gigs.filter((g) => g.pricing === 'osamid' && g.status !== 'haett')) {
    items.push({ tone: 'red', text: `Ósamið verð: ${g.title}`, sub: clientName(data, g.clientId), open: { type: 'gig', id: g.id } });
  }
  for (const g of data.gigs.filter((g) => g.status === 'bokad' && g.date && g.date < t)) {
    items.push({ tone: 'grey', text: `Uppfæra stöðu: ${g.title}`, sub: 'Dagsetning liðin en enn skráð „Bókað“', open: { type: 'gig', id: g.id } });
  }
  const noReceipt = data.expenses.filter((e) => !e.attachment && yearOf(e.date) >= new Date().getFullYear() - 1);
  if (noReceipt.length) items.push({ tone: 'grey', text: `${noReceipt.length} kostnaðarliðir án kvittunar`, sub: 'Bókarinn þarf fylgiskjöl', open: { type: 'route', id: 'kostnadur' } });
  return items;
}

// Price suggestion from comparable earlier gigs
export function suggestPrice(data, { category, estHours, excludeId }) {
  const s = data.settings;
  const priced = data.gigs.filter((g) => g.id !== excludeId && g.pricing === 'samid' && g.status !== 'haett' && (g.price || 0) > 0);
  const withNet = (g) => ({ g, net: gigAmounts(g, s).net, hours: Number(g.actualHours || g.estHours) || 0 });
  const comps = priced.filter((g) => g.category === category).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8).map(withNet);
  const rates = priced.map(withNet).filter((x) => x.hours > 0).map((x) => x.net / x.hours);
  const generalRate = rates.length >= 2 ? roundTo(median(rates), 500) : s.hourlyRate;
  if (comps.length < 2) return { enough: false, comps, generalRate };
  const prices = comps.map((c) => c.net);
  const compRates = comps.filter((c) => c.hours > 0).map((c) => c.net / c.hours);
  let suggestion = roundTo(median(prices), 1000);
  let basis = `Miðgildi ${comps.length} sambærilegra verkefna í flokknum „${category}“`;
  if (estHours > 0 && compRates.length >= 2) {
    const rate = median(compRates);
    suggestion = roundTo(rate * estHours, 1000);
    basis = `${estHours} klst. × miðgildi tímaverðs (${fmtNum(rate)} kr./klst.) í ${compRates.length} sambærilegum verkefnum`;
  }
  return { enough: true, comps, suggestion, basis, min: Math.min(...prices), max: Math.max(...prices), generalRate };
}
