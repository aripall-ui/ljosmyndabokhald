// "Gögn fyrir bókara": ZIP with CSV files + attached invoices and receipts
import * as store from './store.js';
import { periodRange, periodLabel, asciiName, safeFileName, VAT_PERIODS, todayISO } from './util.js';
import { summarize, clientName, INV_STATUS, PRICING, GIG_STATUS, expenseCost } from './calc.js';

const cell = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// Semicolon-separated with BOM so Excel (Icelandic locale) opens it correctly
const csv = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
const yesNo = (b) => (b ? 'Já' : 'Nei');

export async function exportForAccountant(data, period, progress = () => {}) {
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const range = periodRange(period);
  const r = summarize(data, range);
  const client = (id) => data.clients.find((c) => c.id === id) || {};
  const used = new Set();
  const uniq = (folder, name) => {
    let n = name, i = 2;
    while (used.has(folder + n)) n = name.replace(/(\.[^.]+)?$/, ` (${i++})$1`);
    used.add(folder + n);
    return n;
  };
  const files = [];
  const attach = (folder, att, base) => {
    if (!att) return '';
    const ext = (att.name.match(/\.[a-z0-9]+$/i) || [''])[0];
    const name = uniq(folder, safeFileName(base) + ext);
    files.push({ folder, name, att });
    return `${folder}/${name}`;
  };

  // Invoices (issued in period, sent or paid)
  const invRows = [['Reikningsnúmer', 'Útgáfudagur', 'Eindagi', 'Viðskiptavinur', 'Kennitala', 'Lýsing', 'Upphæð án VSK', 'VSK %', 'VSK', 'Upphæð með VSK', 'Staða', 'Sent', 'Greitt', 'Fylgiskjal']];
  for (const i of [...r.issued].sort((a, b) => a.issueDate.localeCompare(b.issueDate))) {
    const c = client(i.clientId);
    const file = attach('Reikningar', i.attachment, `${i.issueDate} ${i.number || ''} ${c.name || ''}`);
    invRows.push([i.number, i.issueDate, i.dueDate, c.name, c.kennitala, i.description, i.net, i.vatRate, i.vat, i.gross, INV_STATUS[i.status], i.sentDate, i.paidDate, file]);
  }
  zip.file('reikningar.csv', csv(invRows));

  // Payments received in period
  const payRows = [['Greiðsludagur', 'Reikningsnúmer', 'Útgáfudagur', 'Viðskiptavinur', 'Upphæð með VSK']];
  for (const i of [...r.paid].sort((a, b) => (a.paidDate || '').localeCompare(b.paidDate || ''))) payRows.push([i.paidDate, i.number, i.issueDate, clientName(data, i.clientId), i.gross]);
  zip.file('greidslur.csv', csv(payRows));

  // Outstanding at end of period
  const outRows = [['Reikningsnúmer', 'Útgáfudagur', 'Eindagi', 'Viðskiptavinur', 'Kennitala', 'Lýsing', 'Upphæð án VSK', 'VSK', 'Upphæð með VSK']];
  for (const i of r.outstanding) { const c = client(i.clientId); outRows.push([i.number, i.issueDate, i.dueDate, c.name, c.kennitala, i.description, i.net, i.vat, i.gross]); }
  zip.file('utistandandi.csv', csv(outRows));

  // Expenses
  const expRows = [['Dagsetning', 'Heiti', 'Seljandi', 'Flokkur', 'Án VSK', 'VSK %', 'VSK', 'Með VSK', 'Frádráttarbær innskattur', 'Raunkostnaður', 'Erlend þjónusta', 'Eign/búnaður', 'Fylgiskjal', 'Athugasemdir']];
  for (const e of [...r.exps].sort((a, b) => a.date.localeCompare(b.date))) {
    const file = attach('Kvittanir', e.attachment, `${e.date} ${e.supplier || ''} ${e.name}`);
    expRows.push([e.date, e.name, e.supplier, e.category, e.net, e.vatRate, e.vat, e.gross, e.deductibleVat, expenseCost(e), yesNo(e.foreign), yesNo(e.asset), file, e.notes]);
  }
  zip.file('kostnadur.csv', csv(expRows));

  // Gigs in period (context)
  const gigRows = [['Dagsetning', 'Heiti', 'Viðskiptavinur', 'Flokkur', 'Verð', 'Verð án VSK', 'Staða']];
  for (const g of data.gigs.filter((g) => g.date >= range[0] && g.date <= range[1]).sort((a, b) => a.date.localeCompare(b.date))) {
    const net = g.pricing === 'samid' ? (g.priceInclVat ? Math.round(g.price / (1 + data.settings.vatRate / 100)) : g.price) : '';
    gigRows.push([g.date, g.title, clientName(data, g.clientId), g.category, PRICING[g.pricing], net, GIG_STATUS[g.status]]);
  }
  zip.file('gigg.csv', csv(gigRows));

  // Summary
  const sumRows = [['Liður', 'Upphæð'],
    ['Tímabil', periodLabel(period)], ['Frá', range[0]], ['Til', range[1]],
    ['Tekjur án VSK', r.revenueNet], ['Útskattur', r.outputVat], ['Tekjur með VSK', r.revenueGross],
    ['Greiðslur mótteknar', r.received], ['Útistandandi í lok tímabils', r.outstandingGross],
    ['Kostnaður án VSK', r.expenseNet], ['Innskattur alls', r.expenseVat], ['Frádráttarbær innskattur', r.deductibleVat],
    ['Rekstrarkostnaður (eftir frádrátt)', r.cost], ['Áætluð rekstrarniðurstaða', r.result], ['Áætlaður VSK til greiðslu', r.vatPayable],
  ];
  if (period.kind === 'year') {
    sumRows.push([], ['VSK-tímabil', 'Útskattur', 'Innskattur', 'VSK til greiðslu']);
    VAT_PERIODS.forEach((label, idx) => {
      const x = summarize(data, periodRange({ year: period.year, kind: 'vat', n: idx + 1 }));
      sumRows.push([label, x.outputVat, x.deductibleVat, x.vatPayable]);
    });
  }
  zip.file('samantekt.csv', csv(sumRows));

  // Attachments
  let done = 0;
  const missing = [];
  for (const f of files) {
    progress(`Sæki skjöl ${++done}/${files.length}…`);
    try {
      const blob = await store.fileBlob(f.att);
      if (blob) zip.folder(f.folder).file(f.name, blob); else missing.push(f.name);
    } catch { missing.push(f.name); }
  }
  zip.file('LESTU.txt', [
    `Gögn fyrir bókara – ${periodLabel(period)} (${range[0]} – ${range[1]})`,
    `Útbúið ${todayISO()}`,
    '',
    'samantekt.csv    – lykiltölur tímabilsins',
    'reikningar.csv   – útgefnir reikningar (eftir dagsetningu reiknings)',
    'greidslur.csv    – mótteknar greiðslur (eftir greiðsludegi)',
    'utistandandi.csv – ógreiddir reikningar í lok tímabils',
    'kostnadur.csv    – rekstrarkostnaður með VSK-sundurliðun',
    'gigg.csv         – verkefni á tímabilinu',
    'Reikningar/ og Kvittanir/ – fylgiskjöl, vísað til í CSV-skrám',
    '',
    'CSV-skrár eru semíkommuaðgreindar (opnast beint í Excel).',
    ...(missing.length ? ['', 'Skjöl sem tókst ekki að sækja:', ...missing] : []),
  ].join('\r\n'));

  progress('Bý til ZIP…');
  const blob = await zip.generateAsync({ type: 'blob' });
  const tag = period.kind === 'year' ? `${period.year}` : period.kind === 'month' ? `${period.year}-${String(period.n).padStart(2, '0')}` : `${period.year}-vsk-${asciiName(VAT_PERIODS[period.n - 1]).replace(/\./g, '')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gogn-fyrir-bokara-${tag}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
