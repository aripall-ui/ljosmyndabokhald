import { notify } from './notify.js';
// Page views
import { html, useState } from '../vendor/preact-htm.js';
import * as store from './store.js';
import { useStore, useUI, openModal, Icon, Badge, Empty, Segmented, Field, MoneyInput, VatSummary, setYear, SpendNote } from './components.js';
import { kr, fmtDate, todayISO, periodRange, periodLabel, yearOf, sum, calcVat, MONTHS, VAT_PERIODS, inRange } from './util.js';
import {
  GIG_STATUS, PRICING, INV_STATUS, INV_LABEL, CONV_TYPE, PURCHASE_STATUS, PRIORITY, ACTIVE_PURCHASE, clientName, invoiceForGig, gigsNeedingInvoice,
  summarize, yearsInData, upcomingGigs, attentionItems, gigAmounts, isOverdue, expenseCost,
} from './calc.js';
import { exportForAccountant } from './export.js';
import { taxEstimate, purchaseTaxEffect } from './tax.js';

const STATUS_TONE = { bokad: 'blue', vinnsla: 'amber', afhent: 'purple', lokid: 'green', haett: 'grey' };
const INV_TONE = { osent: 'amber', sent: 'blue', greitt: 'green', nidurfellt: 'grey' };
const PRIO_TONE = { mikil: 'red', gagnlegt: 'amber', mabida: 'grey' };

export function YearSelect() {
  const data = useStore();
  const { year } = useUI();
  const years = yearsInData(data);
  if (!years.includes(year)) years.push(year);
  return html`<select class="year-select" title="Veldu ár" value=${year} onChange=${(e) => setYear(Number(e.target.value))} aria-label="Ár">
    ${years.sort((a, b) => b - a).map((y) => html`<option value=${y}>${y}</option>`)}
  </select>`;
}

function PageHead({ title, children }) {
  return html`<div class=${'page-head' + (children ? '' : ' title-only')}><h1>${title}</h1>${children && html`<div class="row">${children}</div>`}</div>`;
}

function Stat({ label, value, sub, tone, onClick }) {
  return html`<button type="button" class=${'stat' + (tone ? ' ' + tone : '') + (onClick ? ' clickable' : '')} onClick=${onClick} disabled=${!onClick}>
    <span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub && html`<span class="stat-sub">${sub}</span>`}
  </button>`;
}

const go = (route) => { location.hash = '#' + route; };
function openTarget(o) {
  if (o.type === 'route') go(o.id);
  else if (o.type === 'newInvoiceFromGig') openModal('invoice', { gigId: o.id });
  else openModal(o.type, { id: o.id });
}

// ======================= YFIRLIT =======================
export function Dashboard() {
  const data = useStore();
  const { year } = useUI();
  const r = summarize(data, periodRange({ year, kind: 'year' }));
  const prevYearOutstanding = r.outstanding.filter((i) => yearOf(i.issueDate) < year).length;
  const tx = taxEstimate(data, year);
  const upcoming = upcomingGigs(data);
  const attention = attentionItems(data);
  return html`
    <${PageHead} title="Yfirlit" />
    <div class="quick">
      <button class="primary" onClick=${() => openModal('gig')}><${Icon} name="plus" size=${18} /> Gigg</button>
      <button onClick=${() => openModal('invoice')}><${Icon} name="plus" size=${18} /> Reikningur</button>
      <button onClick=${() => openModal('expense')}><${Icon} name="plus" size=${18} /> Kostnaður</button>
      <button onClick=${() => openModal('purchase')}><${Icon} name="plus" size=${18} /> Innkaup</button>
    </div>
    <div class="stats">
      <${Stat} label="Tekjur á árinu" value=${kr(r.revenueNet)} sub=${`án VSK · greitt ${kr(r.received)}`} onClick=${() => go('bokhald')} />
      <${Stat} label="Útistandandi greiðslur" value=${kr(r.outstandingGross)} sub=${`${r.outstanding.length} reikn.${prevYearOutstanding ? ` · ${prevYearOutstanding} frá fyrri árum` : ''}`} tone=${r.outstanding.some((i) => isOverdue(i)) ? 'warn' : ''} onClick=${() => go('reikningar')} />
      <${Stat} label="Ósendir reikningar" value=${kr(r.unsentGross)} sub=${`${r.unsentCount} atriði`} tone=${r.unsentCount ? 'warn' : ''} onClick=${() => go('reikningar')} />
      <${Stat} label="Kostnaður á árinu" value=${kr(r.cost)} sub="eftir frádrátt innskatts" onClick=${() => go('kostnadur')} />
      <${Stat} label="Tekjur umfram kostnað" value=${kr(r.result)} tone=${r.result < 0 ? 'neg' : 'pos'} onClick=${() => go('bokhald')} />
      <${Stat} label="Til hliðar fyrir skatta" value=${kr(tx.setAside)} sub=${tx.vat.toPay > 0 ? `þar af VSK ${kr(tx.vat.toPay)}` : 'tekjuskattur og gjöld'} tone="warn" onClick=${() => go('bokhald')} />
    </div>
    <div class="two-col">
      <section class="card">
        <h2>Fram undan</h2>
        ${upcoming.length ? html`<div class="list compact">${upcoming.map((g) => html`<${GigRow} g=${g} data=${data} />`)}</div>`
          : html`<${Empty}>Engin bókuð gigg framundan.</${Empty}>`}
      </section>
      <section class="card">
        <h2>Þarfnast athygli ${attention.length ? html`<span class="count">${attention.length}</span>` : ''}</h2>
        ${attention.length ? html`<div class="list compact">${attention.map((a) => html`
          <button type="button" class="item attention" onClick=${() => openTarget(a.open)}>
            <span class=${'dot ' + a.tone}></span>
            <div class="item-main"><strong>${a.text}</strong><span class="muted">${a.sub}</span></div>
          </button>`)}</div>` : html`<${Empty}>Allt í góðu lagi 👌</${Empty}>`}
      </section>
    </div>`;
}

// ======================= GIGG =======================
function GigRow({ g, data }) {
  const inv = invoiceForGig(data, g.id);
  const a = gigAmounts(g, data.settings);
  return html`<div class="item" role="button" tabindex="0" onClick=${() => openModal('gig', { id: g.id })} onKeyDown=${(e) => e.key === 'Enter' && openModal('gig', { id: g.id })}>
    <div class="date-chip"><span>${g.date ? Number(g.date.slice(8)) : '–'}</span><small>${g.date ? fmtDate(g.date).split(' ')[1] : ''}</small></div>
    <div class="item-main">
      <strong>${g.title}</strong>
      <span class="muted">${[clientName(data, g.clientId), g.category, g.date && yearOf(g.date) !== new Date().getFullYear() ? yearOf(g.date) : ''].filter(Boolean).join(' · ')}</span>
      <span class="badges">
        <${Badge} tone=${STATUS_TONE[g.status]}>${GIG_STATUS[g.status]}</${Badge}>
        ${inv ? html`<${Badge} tone=${INV_TONE[inv.status]}>Reikn.: ${INV_LABEL[inv.status]}</${Badge}>`
          : g.pricing === 'samid' && g.status !== 'haett' ? html`<${Badge} tone="amber">Vantar reikning</${Badge}>` : ''}
      </span>
    </div>
    <div class="item-amount">
      ${g.pricing === 'samid' ? html`${kr(a.net)}<small>án VSK</small>
          ${inv && (inv.status === 'sent' || inv.status === 'osent') && html`<div class="row end"><button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('paid', { id: inv.id }); }}><${Icon} name="check" size=${14} /> Merkja greitt</button></div>`}
          ${!inv && g.status !== 'haett' && html`<div class="row end"><button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('invoice', { gigId: g.id }); }}>Skrá reikning</button></div>`}`
        : g.pricing === 'osamid' ? html`<span class="red strong">Ósamið</span>
          <button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('suggest', { category: g.category, estHours: Number(g.estHours) || 0, excludeId: g.id, onUse: (price) => store.upsert('gigs', { ...store.find('gigs', g.id), price, priceInclVat: false, pricing: 'samid' }) }); }}>Stinga upp á verði</button>`
        : html`<span class="muted">${PRICING[g.pricing]}</span>`}
    </div>
  </div>`;
}

export function Gigs() {
  const data = useStore();
  const { year } = useUI();
  const [tab, setTab] = useState('virk');
  const [q, setQ] = useState('');
  let gigs = data.gigs;
  if (tab === 'virk') gigs = gigs.filter((g) => ['bokad', 'vinnsla', 'afhent'].includes(g.status));
  if (tab === 'ar') gigs = gigs.filter((g) => yearOf(g.date) === year);
  if (q) {
    const s = q.toLowerCase();
    gigs = gigs.filter((g) => (g.title + ' ' + clientName(data, g.clientId) + ' ' + g.category + ' ' + (g.notes || '')).toLowerCase().includes(s));
  }
  gigs = [...gigs].sort((a, b) => (tab === 'virk' ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '')));
  const yearGigs = data.gigs.filter((g) => yearOf(g.date) === year && g.status !== 'haett');
  const agreed = yearGigs.filter((g) => g.pricing === 'samid');
  return html`
    <${PageHead} title="Gigg"><button class="primary" onClick=${() => openModal('gig')}><${Icon} name="plus" size=${18} /> Nýtt gigg</button></${PageHead}>
    <div class="toolbar">
      <${Segmented} options=${{ virk: 'Virk', ar: `Árið ${year}`, allt: 'Öll' }} value=${tab} onChange=${setTab} />
      <div class="search"><${Icon} name="search" size=${16} /><input type="search" placeholder="Leita…" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    </div>
    <p class="muted small">${yearGigs.length} gigg ${year} · samið alls ${kr(sum(agreed, (g) => gigAmounts(g, data.settings).net))} án VSK${data.gigs.some((g) => g.pricing === 'osamid' && g.status !== 'haett') ? ' · ' : ''}${data.gigs.filter((g) => g.pricing === 'osamid' && g.status !== 'haett').length ? html`<span class="red">${data.gigs.filter((g) => g.pricing === 'osamid' && g.status !== 'haett').length} ósamin</span>` : ''}</p>
    ${gigs.length ? html`<div class="list card">${gigs.map((g) => html`<${GigRow} g=${g} data=${data} key=${g.id} />`)}</div>`
      : html`<${Empty}>${tab === 'virk' ? 'Engin virk gigg. ' : 'Engin gigg. '}<button class="link-btn" onClick=${() => openModal('gig')}>Skrá gigg</button></${Empty}>`}`;
}

// ======================= REIKNINGAR =======================
function Totals({ list }) {
  return html`<div class="totals">
    <span>Án VSK <strong>${kr(sum(list, (x) => x.net))}</strong></span>
    <span>VSK <strong>${kr(sum(list, (x) => x.vat))}</strong></span>
    <span>Með VSK <strong>${kr(sum(list, (x) => x.gross))}</strong></span>
  </div>`;
}

function InvoiceRow({ i, data, year }) {
  const overdue = isOverdue(i);
  const older = yearOf(i.issueDate) < year;
  return html`<div class="item" role="button" tabindex="0" onClick=${() => openModal('invoice', { id: i.id })}>
    <div class="item-main">
      <strong>${i.description || 'Reikningur'} ${i.number ? html`<span class="muted">· nr. ${i.number}</span>` : ''}</strong>
      <span class="muted">${clientName(data, i.clientId) || 'Án viðskiptavinar'} · ${fmtDate(i.issueDate)}
        ${i.status === 'sent' && i.dueDate ? ` · eindagi ${fmtDate(i.dueDate)}` : ''}${i.status === 'greitt' ? ` · greitt ${fmtDate(i.paidDate)}` : ''}</span>
      <span class="badges">
        ${overdue && html`<${Badge} tone="red">Komið fram yfir eindaga</${Badge}>`}
        ${older && i.status !== 'greitt' && html`<${Badge} tone="purple">Frá ${yearOf(i.issueDate)}</${Badge}>`}
        ${i.attachment && html`<${Badge}><${Icon} name="clip" size=${12} /> PDF</${Badge}>`}
        ${i.vatRate === 0 && html`<${Badge}>Án VSK</${Badge}>`}
        ${i.status === 'nidurfellt' && html`<${Badge} tone="purple">Breytt í ${(CONV_TYPE[i.convType] || '').toLowerCase()}</${Badge}>`}
        ${i.status === 'nidurfellt' && !i.creditDone && html`<${Badge} tone="amber">Á eftir að fella niður í Konto</${Badge}>`}
      </span>
    </div>
    <div class="item-amount">${kr(i.gross)}<small>${kr(i.net)} án VSK</small>
      <div class="row end">
        ${i.status === 'osent' && html`<button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); store.upsert('invoices', { ...i, status: 'sent', sentDate: todayISO() }); }}>Merkja sent</button>`}
        ${i.status === 'sent' && html`<button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('paid', { id: i.id }); }}>Merkja greitt</button>`}
      </div>
    </div>
  </div>`;
}

export function Invoices() {
  const data = useStore();
  const { year } = useUI();
  const [tab, setTab] = useState('osent');
  const need = gigsNeedingInvoice(data);
  const unsent = data.invoices.filter((i) => i.status === 'osent').sort((a, b) => (a.issueDate || '').localeCompare(b.issueDate || ''));
  const outstanding = data.invoices.filter((i) => i.status === 'sent').sort((a, b) => (a.issueDate || '').localeCompare(b.issueDate || ''));
  const paid = data.invoices.filter((i) => i.status === 'greitt' && yearOf(i.issueDate) === year).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  const converted = data.invoices.filter((i) => i.status === 'nidurfellt' && (yearOf(i.issueDate) === year || !i.creditDone));
  const needAmounts = need.map((g) => ({ g, ...gigAmounts(g, data.settings) }));
  const unsentAll = [...unsent, ...needAmounts];

  const cats = {
    osent: { label: 'Ósent', list: unsentAll, sub: `${unsentAll.length} atriði` },
    sent: { label: 'Sent / ógreitt', list: outstanding, sub: `${outstanding.length} reikn. · öll ár` },
    greitt: { label: 'Greitt', list: paid, sub: `${paid.length} reikn. · útgefnir ${year}` },
  };
  return html`
    <${PageHead} title="Reikningar"><button class="primary" onClick=${() => openModal('invoice')}><${Icon} name="plus" size=${18} /> Skrá reikning</button></${PageHead}>
    <p class="muted small">Reikningar eru gefnir út í öðru kerfi – hér er haldið utan um þá.</p>
    <div class="stats three">
      ${Object.entries(cats).map(([k, c]) => html`<button type="button" class=${'stat clickable' + (tab === k ? ' selected' : '')} onClick=${() => setTab(k)}>
        <span class="stat-label">${c.label}</span><span class="stat-value">${kr(sum(c.list, (x) => x.gross))}</span><span class="stat-sub">${c.sub}</span>
      </button>`)}
    </div>
    <section class="card">
      <div class="section-head"><h2>${cats[tab].label}</h2><${Totals} list=${cats[tab].list} /></div>
      ${tab === 'osent' && html`
        ${needAmounts.length > 0 && html`<h3 class="subhead">Gigg sem vantar reikning <span class="muted">(${needAmounts.length})</span></h3>
          <div class="list">${needAmounts.map(({ g, net, gross }) => html`<div class="item" role="button" tabindex="0" onClick=${() => openModal('gig', { id: g.id })}>
            <div class="item-main"><strong>${g.title}</strong><span class="muted">${clientName(data, g.clientId)} · ${fmtDate(g.date)}</span>
              <span class="badges"><${Badge} tone=${STATUS_TONE[g.status]}>${GIG_STATUS[g.status]}</${Badge}></span></div>
            <div class="item-amount">${kr(gross)}<small>${kr(net)} án VSK</small>
              <div class="row end"><button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('invoice', { gigId: g.id }); }}>Skrá reikning</button></div></div>
          </div>`)}</div>`}
        ${unsent.length > 0 && html`<h3 class="subhead">Skráðir, ósendir reikningar</h3>
          <div class="list">${unsent.map((i) => html`<${InvoiceRow} i=${i} data=${data} year=${year} key=${i.id} />`)}</div>`}
        ${!unsentAll.length && html`<${Empty}>Engir ósendir reikningar.</${Empty}>`}`}
      ${tab === 'sent' && (outstanding.length ? html`<div class="list">${outstanding.map((i) => html`<${InvoiceRow} i=${i} data=${data} year=${year} key=${i.id} />`)}</div>` : html`<${Empty}>Ekkert útistandandi.</${Empty}>`)}
      ${tab === 'greitt' && converted.length > 0 && html`<h3 class="subhead">Breytt í greiða / inneign <span class="muted">(telst ekki til tekna)</span></h3>
        <div class="list">${converted.map((i) => html`<${InvoiceRow} i=${i} data=${data} year=${year} key=${i.id} />`)}</div>`}
      ${tab === 'greitt' && paid.length > 0 && converted.length > 0 && html`<h3 class="subhead">Greiddir reikningar</h3>`}
      ${tab === 'greitt' && (paid.length ? html`<div class="list">${paid.map((i) => html`<${InvoiceRow} i=${i} data=${data} year=${year} key=${i.id} />`)}</div>` : html`<${Empty}>Engir greiddir reikningar útgefnir ${year}.</${Empty}>`)}
    </section>`;
}

// ======================= KOSTNAÐUR =======================
export function PurchaseCalculator() {
  const s = store.getData().settings;
  const [c, setC] = useState({ amount: 0, inclVat: true, vatRate: s.vatRate, deductible: true });
  const v = calcVat(c.amount, c.vatRate, c.inclVat);
  const ded = c.deductible ? v.vat : 0;
  return html`<section class="card">
    <h2>Reiknivél fyrir innkaup</h2>
    <div class="grid">
      <${Field} label="Verð"><${MoneyInput} value=${c.amount} onChange=${(a) => setC({ ...c, amount: a })} /></${Field}>
      <${Field} label="Verð er"><${Segmented} small options=${{ excl: 'án VSK', incl: 'með VSK' }} value=${c.inclVat ? 'incl' : 'excl'} onChange=${(k) => setC({ ...c, inclVat: k === 'incl' })} /></${Field}>
      <${Field} label="VSK"><${Segmented} small options=${{ 24: '24%', 11: '11%', 0: 'Enginn' }} value=${String(c.vatRate)} onChange=${(k) => setC({ ...c, vatRate: Number(k) })} /></${Field}>
      <label class="check"><input type="checkbox" checked=${c.deductible} onChange=${(e) => setC({ ...c, deductible: e.target.checked })} /> Innskattur frádráttarbær</label>
    </div>
    <${VatSummary} ...${v} extra=${html`<div class="hl"><span>Raunkostnaður eftir frádrátt</span><strong>${kr(v.gross - ded)}</strong></div>`} />
  </section>`;
}

export function Expenses() {
  const data = useStore();
  const { year } = useUI();
  const [cat, setCat] = useState('');
  const all = data.expenses.filter((e) => yearOf(e.date) === year);
  const list = (cat ? all.filter((e) => e.category === cat) : all).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byCat = {};
  all.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + expenseCost(e)));
  return html`
    <${PageHead} title="Kostnaður"><button class="primary" onClick=${() => openModal('expense')}><${Icon} name="plus" size=${18} /> Skrá kostnað</button></${PageHead}>
    <div class="stats">
      <${Stat} label="Kostnaður án VSK" value=${kr(sum(all, (e) => e.net))} />
      <${Stat} label="Frádráttarbær innskattur" value=${kr(sum(all, (e) => e.deductibleVat))} />
      <${Stat} label="Raunkostnaður" value=${kr(sum(all, expenseCost))} sub="greitt alls − frádráttarbær VSK" />
    </div>
    <div class="two-col wide-left">
      <section class="card">
        <div class="section-head"><h2>Færslur ${year}</h2>
          <select value=${cat} onChange=${(e) => setCat(e.target.value)} class="compact-select"><option value="">Allir flokkar</option>${Object.keys(byCat).map((c) => html`<option value=${c}>${c}</option>`)}</select>
        </div>
        ${list.length ? html`<div class="list">${list.map((e) => html`<div class="item" role="button" tabindex="0" key=${e.id} onClick=${() => openModal('expense', { id: e.id })}>
          <div class="item-main"><strong>${e.name}</strong>
            <span class="muted">${[fmtDate(e.date), e.supplier, e.category].filter(Boolean).join(' · ')}</span>
            <span class="badges">
              ${!e.attachment && html`<${Badge} tone="amber">Vantar kvittun</${Badge}>`}
              ${e.foreign && html`<${Badge} tone="purple">Erlend þjónusta</${Badge}>`}
              ${e.asset && html`<${Badge} tone="blue">Eign</${Badge}>`}
            </span></div>
          <div class="item-amount">${kr(e.gross)}<small>VSK ${kr(e.vat)}${e.deductibleVat ? '' : ' · ekki frádr.'}</small></div>
        </div>`)}</div>` : html`<${Empty}>Enginn kostnaður skráður ${year}.</${Empty}>`}
      </section>
      <div class="stack">
        <section class="card">
          <h2>Eftir flokkum</h2>
          ${Object.keys(byCat).length ? html`<${Bars} rows=${Object.entries(byCat).sort((a, b) => b[1] - a[1])} />` : html`<p class="muted">–</p>`}
        </section>
        <${PurchaseCalculator} />
      </div>
    </div>`;
}

function Bars({ rows }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return html`<div class="bars">${rows.map(([label, v]) => html`<div class="bar-row">
    <span class="bar-label">${label}</span><span class="bar"><span style=${{ width: (v / max) * 100 + '%' }}></span></span><span class="bar-val">${kr(v)}</span>
  </div>`)}</div>`;
}

// ======================= INNKAUP =======================
export function Purchases() {
  const data = useStore();
  const { year } = useUI();
  const [tab, setTab] = useState('virkt');
  const items = data.purchases;
  const active = items.filter((p) => ACTIVE_PURCHASE.includes(p.status));
  const amt = (p) => calcVat(p.estPrice, p.vatRate, p.inclVat);
  const shown = (tab === 'virkt' ? active : tab === 'listi' ? items.filter((p) => p.status === 'listi') : items.filter((p) => !ACTIVE_PURCHASE.includes(p.status)))
    .sort((a, b) => Object.keys(PRIORITY).indexOf(a.priority) - Object.keys(PRIORITY).indexOf(b.priority) || (a.plannedDate || '9').localeCompare(b.plannedDate || '9'));
  const byPrio = Object.keys(PRIORITY).map((k) => [PRIORITY[k], sum(active.filter((p) => p.priority === k), (p) => amt(p).gross)]);
  const byCatMap = {};
  active.forEach((p) => (byCatMap[p.category] = (byCatMap[p.category] || 0) + amt(p).gross));
  const list = items.filter((p) => p.status === 'listi');
  const r = summarize(data, periodRange({ year, kind: 'year' }));
  const thisYear = new Date().getFullYear();
  const fx = (ps) => purchaseTaxEffect(data, thisYear, ps.map((p) => ({ amount: p.estPrice, inclVat: p.inclVat, vatRate: p.vatRate })));
  const listFx = fx(list);
  const listCost = listFx.gross - listFx.vatBack; // cost excl. deductible VAT
  const activeCost = sum(active, (p) => amt(p).net);

  return html`
    <${PageHead} title="Innkaup"><button class="primary" onClick=${() => openModal('purchase')}><${Icon} name="plus" size=${18} /> Bæta við</button></${PageHead}>
    <p class="muted small">Óskalisti og innkaupaplan – telst ekki til kostnaðar fyrr en merkt „Keypt“.</p>
    <div class="stats">
      <${Stat} label="Á innkaupalista" value=${kr(sum(list, (p) => amt(p).gross))} sub=${`${list.length} vörur · ${kr(sum(list, (p) => amt(p).net))} án VSK`} />
      <${Stat} label="Allar virkar hugmyndir" value=${kr(sum(active, (p) => amt(p).gross))} sub=${`${active.length} vörur · ${kr(activeCost)} án VSK`} />
    </div>
    <div class="two-col wide-left">
      <section class="card">
        <div class="section-head"><${Segmented} small options=${{ virkt: 'Virkt', listi: 'Á lista', lokid: 'Keypt / fallið frá' }} value=${tab} onChange=${setTab} /></div>
        ${shown.length ? html`<div class="list">${shown.map((p) => { const v = amt(p); return html`<div class="item" role="button" tabindex="0" key=${p.id} onClick=${() => openModal('purchase', { id: p.id })}>
          <div class="item-main"><strong>${p.name}</strong>
            <span class="muted">${[p.category, p.reason, p.plannedDate ? 'áætl. ' + fmtDate(p.plannedDate) : ''].filter(Boolean).join(' · ')}</span>
            <span class="badges">
              <${Badge} tone=${PRIO_TONE[p.priority]}>${PRIORITY[p.priority]}</${Badge}>
              <${Badge} tone=${p.status === 'listi' ? 'blue' : p.status === 'keypt' ? 'green' : 'grey'}>${PURCHASE_STATUS[p.status]}</${Badge}>
              ${p.link && html`<a class="badge link" href=${p.link} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}><${Icon} name="link" size=${12} /> Hlekkur</a>`}
            </span></div>
          <div class="item-amount">${kr(v.gross)}<small>${v.vat ? kr(v.net) + ' án VSK' : 'enginn VSK'}</small>
            ${ACTIVE_PURCHASE.includes(p.status) && html`<small class="after-tax" title="Verð að frádregnum VSK sem fæst til baka og lægri tekjuskatti">≈ ${kr(fx([p]).realCost)} eftir skatta</small>`}
            ${ACTIVE_PURCHASE.includes(p.status) && html`<div class="row end"><button type="button" class="ghost small" onClick=${(e) => { e.stopPropagation(); openModal('buy', { id: p.id }); }}><${Icon} name="check" size=${14} /> Keypt</button></div>`}
            ${p.status === 'keypt' && p.expenseId && html`<div class="row end"><button type="button" class="link-btn small" onClick=${(e) => { e.stopPropagation(); openModal('expense', { id: p.expenseId }); }}>Sjá kostnað</button></div>`}
          </div>
        </div>`; })}</div>` : html`<${Empty}>Ekkert hér. <button class="link-btn" onClick=${() => openModal('purchase')}>Bæta við hugmynd</button></${Empty}>`}
      </section>
      <div class="stack">
        <section class="card"><h2>Eftir forgangi <small class="muted">(virkt, m. VSK)</small></h2><${Bars} rows=${byPrio} /></section>
        ${Object.keys(byCatMap).length > 0 && html`<section class="card"><h2>Eftir flokkum</h2><${Bars} rows=${Object.entries(byCatMap).sort((a, b) => b[1] - a[1])} /></section>`}
        <section class="card">
          <h2>Samanburður við árið ${year}</h2>
          <div class="kv">
            <div><span>Tekjur án VSK</span><strong>${kr(r.revenueNet)}</strong></div>
            <div><span>Greiðslur mótteknar</span><strong>${kr(r.received)}</strong></div>
            <div><span>Kostnaður</span><strong>${kr(r.cost)}</strong></div>
            <div><span>Tekjur umfram kostnað</span><strong>${kr(r.result)}</strong></div>
            <div class="sep"><span>Innkaupalisti án VSK</span><strong>${kr(listCost)}</strong></div>
            <div><span>Sem hlutfall af tekjum</span><strong>${r.revenueNet ? Math.round((listCost / r.revenueNet) * 100) + '%' : '–'}</strong></div>
            <div class="hl"><span>Niðurstaða ef allt á lista er keypt</span><strong class=${r.result - listCost < 0 ? 'red' : ''}>${kr(r.result - listCost)}</strong></div>
          </div>
        </section>
        <section class="card">
          <h2>Skattaáhrif ef allt á listanum er keypt í dag</h2>
          ${list.length ? html`<div class="kv">
            <div><span>Verð með VSK</span><strong>${kr(listFx.gross)}</strong></div>
            <div><span>VSK sem fæst til baka</span><strong>−${kr(listFx.vatBack)}</strong></div>
            <div><span>Lægri tekjuskattur${data.settings.ownPayMonthly ? '' : ' og tryggingagjald'}</span><strong>−${kr(listFx.incomeTax)}</strong></div>
            <div class="hl"><span>Raunkostnaður eftir skatta</span><strong>${kr(listFx.realCost)}</strong></div>
            <div class="sep"><span>Til hliðar fyrir skatta núna</span><strong>${kr(listFx.before)}</strong></div>
            <div class="hl"><span>Til hliðar eftir kaupin</span><strong>${kr(listFx.after)}</strong></div>
          </div>
          <${SpendNote} amount=${listFx.realCost} />
          <p class="hint">Miðað við skattaáætlunina í Bókhaldi (${thisYear}). Dýr búnaður er stundum fyrndur yfir nokkur ár, og þá dreifist lækkunin á tekjuskattinum á þau ár. Bókarinn veit hvað á við.</p>`
          : html`<p class="muted">Ekkert á innkaupalista. Settu vöru á „Á innkaupalista“ til að sjá áhrifin.</p>`}
        </section>
      </div>
    </div>`;
}

// ======================= BÓKHALD =======================
export function Accounting() {
  const data = useStore();
  const { year } = useUI();
  const [kind, setKind] = useState('year');
  const [n, setN] = useState(() => (kind === 'month' ? new Date().getMonth() + 1 : Math.ceil((new Date().getMonth() + 1) / 2)));
  const [busy, setBusy] = useState('');
  const period = { year, kind, n };
  const range = periodRange(period);
  const r = summarize(data, range);
  const vatRows = VAT_PERIODS.map((label, idx) => {
    const x = summarize(data, periodRange({ year, kind: 'vat', n: idx + 1 }));
    return { label, ...x };
  });
  const doExport = async () => {
    setBusy('Undirbý…');
    try { await exportForAccountant(data, period, setBusy); } catch (e) { notify('Útflutningur mistókst: ' + e.message, 'error'); }
    setBusy('');
  };
  return html`
    <${PageHead} title="Bókhald" />
    <p class="muted small">Yfirlit til að halda utan um fjármálin og undirbúa gögn fyrir bókara – ekki formlegt bókhald.</p>
    <div class="toolbar">
      <${Segmented} options=${{ year: 'Allt árið', vat: 'VSK-tímabil', month: 'Mánuður' }} value=${kind} onChange=${(k) => { setKind(k); setN(k === 'month' ? new Date().getMonth() + 1 : Math.ceil((new Date().getMonth() + 1) / 2)); }} />
      ${kind === 'month' && html`<select value=${n} onChange=${(e) => setN(Number(e.target.value))}>${MONTHS.map((m, i) => html`<option value=${i + 1}>${m}</option>`)}</select>`}
      ${kind === 'vat' && html`<select value=${n} onChange=${(e) => setN(Number(e.target.value))}>${VAT_PERIODS.map((m, i) => html`<option value=${i + 1}>${m}</option>`)}</select>`}
    </div>
    <div class="two-col wide-left">
      <section class="card">
        <h2>${periodLabel(period)}</h2>
        <div class="kv big">
          <div><span>Tekjur án VSK</span><strong>${kr(r.revenueNet)}</strong></div>
          <div><span>Greiðslur mótteknar</span><strong>${kr(r.received)}</strong></div>
          <div><span>Útistandandi <small class="muted">(útgefið til loka tímabils)</small></span><strong>${kr(r.outstandingGross)}</strong></div>
          <div><span>Rekstrarkostnaður <small class="muted">(eftir frádrátt innskatts)</small></span><strong>${kr(r.cost)}</strong></div>
          <div class="hl"><span>Áætluð rekstrarniðurstaða</span><strong class=${r.result < 0 ? 'red' : ''}>${kr(r.result)}</strong></div>
          <div class="sep"><span>Útskattur</span><strong>${kr(r.outputVat)}</strong></div>
          <div><span>Frádráttarbær innskattur</span><strong>${kr(r.deductibleVat)}</strong></div>
          <div class="hl"><span>Áætlaður VSK til greiðslu</span><strong>${kr(r.vatPayable)}</strong></div>
        </div>
        ${r.foreignCount > 0 && html`<p class="hint">${r.foreignCount} færslur merktar „Erlend þjónusta“ – VSK af þeim er ekki reiknaður hér; bókari fer yfir.</p>`}
        <p class="hint">Tekjur og útskattur miðast við dagsetningu reiknings (send og greidd). Greiðslur miðast við greiðsludag.</p>
      </section>
      <div class="stack">
        <section class="card export">
          <h2>Gögn fyrir bókara</h2>
          <p class="muted">ZIP-skrá fyrir ${periodLabel(period).toLowerCase()} með CSV-yfirlitum, reikningum og kvittunum.</p>
          <div class="kv">
            <div><span>Reikningar</span><strong>${r.issued.length}</strong></div>
            <div><span>Kostnaðarliðir</span><strong>${r.exps.length}</strong></div>
            <div><span>Fylgiskjöl</span><strong>${r.issued.filter((i) => i.attachment).length + r.exps.filter((e) => e.attachment).length}</strong></div>
          </div>
          <button class="primary full-btn" onClick=${doExport} disabled=${!!busy}><${Icon} name="download" size=${18} /> ${busy || 'Sækja gögn fyrir bókara'}</button>
        </section>
      </div>
    </div>
    <${Taxes} data=${data} year=${year} />
    <section class="card">
      <h2>VSK-tímabil ${year}</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Tímabil</th><th>Tekjur án VSK</th><th>Útskattur</th><th>Innskattur</th><th>VSK til greiðslu</th><th>Kostnaður</th><th>Niðurstaða</th></tr></thead>
        <tbody>${vatRows.map((x) => html`<tr>
          <td>${x.label}</td><td>${kr(x.revenueNet)}</td><td>${kr(x.outputVat)}</td><td>${kr(x.deductibleVat)}</td><td><strong>${kr(x.vatPayable)}</strong></td><td>${kr(x.cost)}</td><td>${kr(x.result)}</td>
        </tr>`)}</tbody>
        <tfoot><tr><td>Samtals</td><td>${kr(sum(vatRows, (x) => x.revenueNet))}</td><td>${kr(sum(vatRows, (x) => x.outputVat))}</td><td>${kr(sum(vatRows, (x) => x.deductibleVat))}</td><td>${kr(sum(vatRows, (x) => x.vatPayable))}</td><td>${kr(sum(vatRows, (x) => x.cost))}</td><td>${kr(sum(vatRows, (x) => x.result))}</td></tr></tfoot>
      </table></div>
    </section>`;
}

export { inRange };

// ======================= SKATTAR =======================
const pct = (x) => String(Math.round(x * 1000) / 10).replace('.', ',') + '%';
function Taxes({ data, year }) {
  const t = taxEstimate(data, year);
  const s = data.settings;
  const current = year === new Date().getFullYear();
  const row = (label, a, b, cls) => html`<tr class=${cls || ''}><td>${label}</td><td>${kr(a)}</td>${current && html`<td>${kr(b)}</td>`}</tr>`;
  return html`<section class="card taxes">
    <div class="section-head"><h2>Skattar og gjöld – áætlun ${year}</h2><a class="link-btn small" href="#stillingar">Forsendur</a></div>
    <div class="set-aside">
      <span>Taktu til hliðar</span>
      <strong>${kr(t.setAside)}</strong>
      <small>miðað við skráðar tekjur og kostnað${current ? ' í dag' : ''}: tekjuskattur, útsvar, tryggingagjald${s.pensionOn === false ? '' : ', lífeyrissjóður'} og ógreiddur VSK${t.prepaid ? ', að frádregnu því sem er þegar greitt' : ''}</small>
    </div>
    ${t.monthly && html`<div class="monthly-claim">
      <div><strong>Mánaðarleg krafa frá Skattinum: ${kr(t.monthly.tax + t.monthly.tg)}</strong>
        <span class="muted">Staðgreiðsla ${kr(t.monthly.tax)} + tryggingagjald ${kr(t.monthly.tg)} af ${kr(t.monthly.amount)} reiknuðu endurgjaldi. Gjalddagi 15. næsta mánaðar.${s.pensionOn === false ? '' : ` Auk þess ${kr(t.monthly.pension)} í lífeyrissjóð.`}</span></div>
      <span class="hint">Skráðu greiddar kröfur í Stillingum („Skattur þegar greiddur“), þá lækkar talan hér að ofan.</span>
    </div>`}
    <div class="two-col tight">
      <div>
        <h3>Tekjuskattur og gjöld</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th></th><th>${current ? 'Hingað til' : 'Árið'}</th>${current && html`<th>Áætlun fyrir árið</th>`}</tr></thead>
          <tbody>
            ${row('Hagnaður (tekjur − kostnaður)', t.profit, t.projected)}
            ${row(t.monthly ? `Reiknað endurgjald (${t.monthly.months.year} mán. × ${kr(t.monthly.amount)})` : 'Reiknað endurgjald', t.now.R, t.full.R)}
            ${row(`Tryggingagjald ${String(t.params.tryggingagjald).replace('.', ',')}%`, t.now.tg, t.full.tg)}
            ${s.pensionOn !== false && row(`Lífeyrissjóður ${String(t.params.pension).replace('.', ',')}%`, t.now.pension, t.full.pension)}
            ${row(`Tekjuskattur og útsvar (${pct(t.effRate)})`, t.now.incomeTax, t.full.incomeTax)}
            ${t.prepaid > 0 && html`<tr><td>Þegar greitt fyrirfram</td><td>−${kr(t.prepaid)}</td>${current && html`<td></td>`}</tr>`}
          </tbody>
          <tfoot>${row('Samtals', Math.max(0, t.now.tg + t.now.pension + t.now.incomeTax - t.prepaid), t.full.tg + t.full.pension + t.full.incomeTax)}</tfoot>
        </table></div>
        <p class="hint">Skattlagt í álagningu næsta sumar. Hlutfallið er jaðarskattur ofan á ${s.otherIncome ? `aðrar launatekjur (${kr(s.otherIncome)})` : 'engar aðrar tekjur'} með útsvari ${String(s.utsvar || 14.97).replace('.', ',')}%. ${t.monthly ? 'Tryggingagjald og lífeyrir reiknast af reiknuðu endurgjaldi, tekjuskattur af öllum hagnaði.' : 'Allur hagnaður reiknaður sem reiknað endurgjald (varfærið).'}</p>
      </div>
      <div>
        <h3>Virðisaukaskattur</h3>
        ${t.vat.periods.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Tímabil</th><th>Gjalddagi</th><th>Upphæð</th></tr></thead>
          <tbody>${t.vat.periods.map((v) => html`<tr class=${v === t.vat.next ? 'next' : ''}>
            <td>${VAT_PERIODS[v.n - 1]}</td><td>${fmtDate(v.due)}</td><td>${kr(v.amount)} ${v.paid ? html`<${Badge}>liðinn</${Badge}>` : v === t.vat.next ? html`<${Badge} tone="amber">næst</${Badge}>` : ''}</td></tr>`)}</tbody>
          <tfoot><tr><td>Ógreitt</td><td></td><td>${kr(t.vat.toPay)}</td></tr></tfoot>
        </table></div>` : html`<p class="muted">Enginn VSK á árinu.</p>`}
        <p class="hint">${(s.vatExemptCategories || []).length ? `Undanþegið VSK: ${(s.vatExemptCategories || []).join(', ')}. ` : ''}Tímabil með liðnum gjalddaga eru talin greidd.</p>
      </div>
    </div>
    <p class="hint">Þetta er áætlun til að vita hvað á að leggja til hliðar, ekki álagning. Bókarinn fer yfir endanlega útreikninga.</p>
  </section>`;
}
