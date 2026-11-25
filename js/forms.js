// Registration forms (modals)
import { html, useState } from '../vendor/preact-htm.js';
import * as store from './store.js';
import {
  Modal, Field, Segmented, MoneyInput, VatSummary, PriceFields, AttachmentField, ClientInput, resolveClient,
  closeModal, openModal, confirmDelete, Badge, Icon, notify, ConfirmModal,
} from './components.js';
import { calcVat, kr, todayISO, addDays, fmtDate, yearOf } from './util.js';
import { GIG_STATUS, PRICING, INV_STATUS, INV_LABEL, CONV_TYPE, PURCHASE_STATUS, PRIORITY, clientName, invoiceForGig, suggestPrice, gigAmounts, vatRateOn, isVatRegistered } from './calc.js';

const num = (v) => (v === '' || v == null ? '' : Number(v));
// Payment terms: the client's own, else the default from settings
export function dueDaysFor(name) {
  const d = store.getData();
  const c = d.clients.find((x) => x.name.toLowerCase() === (name || '').trim().toLowerCase());
  return c && Number(c.paymentDays) > 0 ? Number(c.paymentDays) : d.settings.dueDays;
}
const dueHint = (name) => {
  const days = dueDaysFor(name);
  const own = days !== store.getData().settings.dueDays;
  return `${days} dögum eftir útgáfudag${own ? ' (frestur viðskiptavinar)' : ''}`;
};

function Footer({ onSave, onDelete, saveLabel = 'Vista' }) {
  return html`
    ${onDelete ? html`<button type="button" class="ghost danger" onClick=${onDelete}>Eyða</button>` : html`<span></span>`}
    <div class="row">
      <button type="button" class="ghost" onClick=${closeModal}>Hætta við</button>
      <button type="button" class="primary" onClick=${onSave}>${saveLabel}</button>
    </div>`;
}

// ================= GIG =================
export function GigForm({ id }) {
  const data = store.getData();
  const s = data.settings;
  const existing = store.find('gigs', id);
  const [f, setF] = useState(() => existing
    ? { ...existing, clientName: clientName(data, existing.clientId) }
    : { title: '', clientName: '', date: todayISO(), category: s.categories[0], pricing: 'osamid', price: 0, priceInclVat: false, status: 'bokad', notes: '', estHours: '', actualHours: '', estValue: 0 });
  const [inv, setInv] = useState({ mode: 'none', number: '', date: '', due: '', paidDate: '', attachment: null });
  const invDate = inv.date || f.date || todayISO();
  const invDue = inv.due || addDays(invDate, dueDaysFor(f.clientName));
  const set = (patch) => setF((o) => ({ ...o, ...patch }));
  const linked = existing && invoiceForGig(data, existing.id);
  const amounts = calcVat(f.price, vatRateOn(s, f.date), f.priceInclVat);

  const save = () => {
    if (!f.title.trim()) { notify('Vantar heiti á gigg.', 'error'); return; }
    const { clientName: cn, ...rest } = f;
    const gig = store.upsert('gigs', { ...rest, title: f.title.trim(), clientId: resolveClient(cn), estHours: num(f.estHours), actualHours: num(f.actualHours) });
    if (inv.mode !== 'none' && gig.pricing === 'samid' && !linked) {
      const invRate = vatRateOn(s, invDate);
      const v = calcVat(gig.price, invRate, gig.priceInclVat);
      store.upsert('invoices', {
        gigId: gig.id, clientId: gig.clientId, description: gig.title, number: inv.number.trim(),
        issueDate: invDate, dueDate: invDue, amount: gig.price, inclVat: !!gig.priceInclVat, vatRate: invRate, ...v,
        status: inv.mode, attachment: inv.attachment, sentDate: inv.mode === 'osent' ? '' : invDate, paidDate: inv.mode === 'greitt' ? inv.paidDate || invDate : '', notes: '',
      });
    }
    closeModal();
  };
  const del = () => confirmDelete('þessu giggi', () => { store.remove('gigs', id); closeModal(); });

  const suggest = () => openModal('suggest', {
    category: f.category, estHours: Number(f.estHours) || 0, excludeId: id,
    onUse: (price) => set({ price, priceInclVat: false, pricing: 'samid' }),
  });

  return html`<${Modal} title=${existing ? 'Breyta giggi' : 'Nýtt gigg'} footer=${html`<${Footer} onSave=${save} onDelete=${existing && del} />`}>
    <div class="grid">
      <${Field} label="Heiti" full><input type="text" value=${f.title} autofocus placeholder="t.d. Brúðkaup Önnu og Jóns" onInput=${(e) => set({ title: e.target.value })} /></${Field}>
      <${Field} label="Viðskiptavinur"><${ClientInput} value=${f.clientName} onChange=${(v) => set({ clientName: v })} /></${Field}>
      <${Field} label="Dagsetning"><input type="date" value=${f.date} onInput=${(e) => set({ date: e.target.value })} /></${Field}>
      <${Field} label="Flokkur">
        <select value=${f.category} onChange=${(e) => set({ category: e.target.value })}>
          ${[...new Set([...s.categories, f.category])].filter(Boolean).map((c) => html`<option value=${c}>${c}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Staða verkefnis">
        <select value=${f.status} onChange=${(e) => set({ status: e.target.value })}>
          ${Object.entries(GIG_STATUS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Verð" full><${Segmented} options=${PRICING} value=${f.pricing} onChange=${(k) => set({ pricing: k })} /></${Field}>

      ${f.pricing === 'osamid' && html`<div class="full unpriced">
        <span class="red strong">Ósamið</span>
        <button type="button" class="ghost small" onClick=${suggest}>Stinga upp á verði</button>
      </div>`}
      ${f.pricing === 'samid' && html`
        <${Field} label="Samið verð"><${MoneyInput} value=${f.price} onChange=${(v) => set({ price: v })} /></${Field}>
        <${Field} label="Verðið er">
          <${Segmented} small options=${{ excl: 'án VSK', incl: 'með VSK' }} value=${f.priceInclVat ? 'incl' : 'excl'} onChange=${(k) => set({ priceInclVat: k === 'incl' })} />
        </${Field}>
        <div class="full"><${VatSummary} ...${amounts} /></div>
        <div class="full"><button type="button" class="link-btn" onClick=${suggest}>Bera saman við fyrri verkefni</button></div>`}
      ${(f.pricing === 'probono' || f.pricing === 'greidi' || f.pricing === 'inneign') && html`
        <${Field} label=${f.pricing === 'inneign' ? 'Virði inneignar' : 'Áætlað virði (valfrjálst)'} hint="Aðeins til viðmiðunar – telst ekki til tekna"><${MoneyInput} value=${f.estValue} onChange=${(v) => set({ estValue: v })} /></${Field}>`}

      <${Field} label="Áætlaðir tímar"><input type="number" min="0" step="0.5" inputmode="decimal" value=${f.estHours} onInput=${(e) => set({ estHours: e.target.value })} /></${Field}>
      <${Field} label="Raunverulegir tímar"><input type="number" min="0" step="0.5" inputmode="decimal" value=${f.actualHours} onInput=${(e) => set({ actualHours: e.target.value })} /></${Field}>
      <${Field} label="Athugasemdir" full><textarea rows="3" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></${Field}>

      ${linked && html`<div class="full info-row">
        <span>Reikningur ${linked.number || ''} · ${fmtDate(linked.issueDate)}</span>
        <${Badge} tone=${linked.status === 'greitt' ? 'green' : linked.status === 'sent' ? 'blue' : linked.status === 'nidurfellt' ? 'grey' : 'amber'}>${INV_LABEL[linked.status]}</${Badge}>
        <button type="button" class="link-btn" onClick=${() => openModal('invoice', { id: linked.id })}>Opna</button>
        ${(linked.status === 'osent' || linked.status === 'sent') && html`<button type="button" class="ghost small" onClick=${() => openModal('convert', { id: linked.id })}>Breyta í greiða eða inneign</button>`}
      </div>`}
      ${!linked && f.pricing === 'samid' && f.price > 0 && html`<fieldset class="full sub">
        <legend>Reikningur</legend>
        <p class="hint">Fyrir eldri verkefni: skráðu reikninginn um leið.</p>
        <${Segmented} small options=${{ none: 'Enginn enn', osent: 'Ósent', sent: 'Sent', greitt: 'Greitt' }} value=${inv.mode} onChange=${(k) => setInv({ ...inv, mode: k })} />
        ${inv.mode !== 'none' && html`<div class="grid">
          <${Field} label="Reikningsnúmer" hint="Númerið úr reikningakerfinu" full><input type="text" value=${inv.number} onInput=${(e) => setInv({ ...inv, number: e.target.value })} /></${Field}>
          <${Field} label="Útgáfudagur" hint="Dagsetningin á reikningnum"><input type="date" value=${invDate} onInput=${(e) => setInv({ ...inv, date: e.target.value })} /></${Field}>
          <${Field} label="Eindagi" hint=${dueHint(f.clientName)}><input type="date" value=${invDue} onInput=${(e) => setInv({ ...inv, due: e.target.value })} /></${Field}>
          <${Field} label="Reikningur (PDF)" full>
            <${AttachmentField} value=${inv.attachment} onChange=${(a) => setInv({ ...inv, attachment: a })} folder=${'Reikningar/' + (yearOf(invDate) || '')} baseName=${`${invDate} ${inv.number || ''} ${f.clientName || ''}`} />
          </${Field}>
          ${inv.mode === 'greitt' && html`<${Field} label="Greitt dags."><input type="date" value=${inv.paidDate || invDate} onInput=${(e) => setInv({ ...inv, paidDate: e.target.value })} /></${Field}>`}
        </div>`}
      </fieldset>`}
    </div>
  </${Modal}>`;
}

// ================= PRICE SUGGESTION =================
export function SuggestModal({ category, estHours, excludeId, onUse }) {
  const data = store.getData();
  const r = suggestPrice(data, { category, estHours, excludeId });
  const use = (p) => { onUse(p); closeModal(); };
  return html`<${Modal} title="Tillaga að verði" wide>
    ${r.enough ? html`
      <div class="suggestion">
        <div class="big">${kr(r.suggestion)} <small>án VSK</small></div>
        <p class="muted">${r.basis}. Bil: ${kr(r.min)} – ${kr(r.max)}</p>
        <button type="button" class="primary" onClick=${() => use(r.suggestion)}>Nota þetta verð</button>
      </div>
      <h3>Byggt á þessum verkefnum</h3>
      <div class="list compact">
        ${r.comps.map((c) => html`<div class="item">
          <div class="item-main"><strong>${c.g.title}</strong><span class="muted">${[clientName(data, c.g.clientId), fmtDate(c.g.date), c.hours ? `${c.hours} klst.` : ''].filter(Boolean).join(' · ')}</span></div>
          <div class="item-amount">${kr(c.net)}</div>
        </div>`)}
      </div>
      <details><summary>Reikna handvirkt</summary><${PriceCalculator} rate=${r.generalRate} onUse=${use} /></details>
    ` : html`
      <p class="muted">${r.comps.length ? `Aðeins ${r.comps.length} fyrra verkefni` : 'Engin fyrri verkefni'} með samið verð í flokknum „${category}“ – of lítið til að byggja tillögu á. Notaðu reiknivélina:</p>
      ${r.comps.map((c) => html`<p class="muted small">Til viðmiðunar: ${c.g.title} (${fmtDate(c.g.date)}) – ${kr(c.net)}</p>`)}
      <${PriceCalculator} rate=${r.generalRate} hours=${estHours} onUse=${use} />
    `}
  </${Modal}>`;
}

function PriceCalculator({ rate, hours, onUse }) {
  const [c, setC] = useState({ shoot: hours || 2, edit: hours ? Math.round(hours) : 2, rate: rate || 15000, travel: 0, extra: 0 });
  const set = (p) => setC((o) => ({ ...o, ...p }));
  const total = Math.round((Number(c.shoot) + Number(c.edit)) * c.rate + c.travel + c.extra);
  const v = calcVat(total, store.getData().settings.vatRate, false);
  return html`<div class="calc">
    <div class="grid">
      <${Field} label="Myndataka (klst.)"><input type="number" min="0" step="0.5" value=${c.shoot} onInput=${(e) => set({ shoot: e.target.value || 0 })} /></${Field}>
      <${Field} label="Eftirvinnsla (klst.)"><input type="number" min="0" step="0.5" value=${c.edit} onInput=${(e) => set({ edit: e.target.value || 0 })} /></${Field}>
      <${Field} label="Tímagjald"><${MoneyInput} value=${c.rate} onChange=${(v) => set({ rate: v })} /></${Field}>
      <${Field} label="Akstur / ferðir"><${MoneyInput} value=${c.travel} onChange=${(v) => set({ travel: v })} /></${Field}>
      <${Field} label="Annað (leyfi, prentun…)"><${MoneyInput} value=${c.extra} onChange=${(v) => set({ extra: v })} /></${Field}>
    </div>
    <${VatSummary} ...${v} />
    <button type="button" class="primary" onClick=${() => onUse(total)} disabled=${!total}>Nota þetta verð</button>
  </div>`;
}

// ================= INVOICE =================
export function InvoiceForm({ id, gigId }) {
  const data = store.getData();
  const s = data.settings;
  const existing = store.find('invoices', id);
  const fromGig = (gid, base) => {
    const g = store.find('gigs', gid);
    if (!g) return base;
    const cn = clientName(data, g.clientId);
    return { ...base, gigId: gid, clientName: cn, description: g.title, amount: g.price || 0, inclVat: !!g.priceInclVat,
      ...(base.dueTouched ? {} : { dueDate: addDays(base.issueDate, dueDaysFor(cn)) }) };
  };
  const [f, setF] = useState(() => {
    if (existing) return { ...existing, clientName: clientName(data, existing.clientId), dueTouched: true };
    const t = todayISO();
    return fromGig(gigId, {
      gigId: '', clientName: '', description: '', number: '', issueDate: t, dueDate: addDays(t, s.dueDays), dueTouched: false,
      amount: 0, inclVat: false, vatRate: vatRateOn(s, t), vatTouched: false, status: 'sent', sentDate: t, paidDate: '', attachment: null, notes: '',
    });
  });
  const set = (patch) => setF((o) => {
    const n = { ...o, ...patch };
    if ((patch.issueDate || patch.clientName !== undefined) && !o.dueTouched) n.dueDate = addDays(n.issueDate, dueDaysFor(n.clientName));
    if (patch.issueDate && (o.sentDate === o.issueDate || !o.sentDate)) n.sentDate = patch.issueDate;
    if (patch.vatRate !== undefined) n.vatTouched = true;
    else if (patch.issueDate && !o.vatTouched && !existing) n.vatRate = vatRateOn(s, patch.issueDate);
    if (patch.status === 'greitt' && !n.paidDate) n.paidDate = todayISO();
    return n;
  });
  const v = calcVat(f.amount, f.vatRate, f.inclVat);
  const invoicedGigs = new Set(data.invoices.filter((i) => i.id !== id).map((i) => i.gigId));
  const gigOptions = data.gigs.filter((g) => !invoicedGigs.has(g.id) && g.status !== 'haett').sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const save = () => {
    if (!f.amount) { notify('Vantar upphæð.', 'error'); return; }
    const { clientName: cn, dueTouched, vatTouched, ...rest } = f;
    store.upsert('invoices', {
      ...rest, ...v, clientId: resolveClient(cn), number: (f.number || '').trim(),
      sentDate: f.status === 'osent' ? '' : f.sentDate || f.issueDate,
      paidDate: f.status === 'greitt' ? f.paidDate || todayISO() : '',
    });
    closeModal();
  };
  const del = () => confirmDelete('þessum reikningi', () => { store.remove('invoices', id); closeModal(); });

  return html`<${Modal} title=${existing ? 'Reikningur' : 'Skrá reikning'} footer=${html`<${Footer} onSave=${save} onDelete=${existing && del} />`}>
    <div class="grid">
      <${Field} label="Tengt gigg" full>
        <select value=${f.gigId || ''} onChange=${(e) => setF((o) => (e.target.value ? fromGig(e.target.value, o) : { ...o, gigId: '' }))}>
          <option value="">— Ekkert gigg (handvirkur reikningur) —</option>
          ${gigOptions.map((g) => html`<option value=${g.id}>${fmtDate(g.date)} – ${g.title}${g.clientId ? ' (' + clientName(data, g.clientId) + ')' : ''}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Viðskiptavinur"><${ClientInput} value=${f.clientName} onChange=${(val) => set({ clientName: val })} /></${Field}>
      <${Field} label="Reikningsnúmer" hint="Númerið úr reikningakerfinu"><input type="text" value=${f.number} onInput=${(e) => set({ number: e.target.value })} /></${Field}>
      <${Field} label="Lýsing" full><input type="text" value=${f.description} onInput=${(e) => set({ description: e.target.value })} /></${Field}>
      <${Field} label="Útgáfudagur" hint="Dagsetningin á reikningnum"><input type="date" value=${f.issueDate} onInput=${(e) => set({ issueDate: e.target.value })} /></${Field}>
      <${Field} label="Eindagi" hint=${f.dueTouched && existing ? '' : dueHint(f.clientName)}><input type="date" value=${f.dueDate} onInput=${(e) => set({ dueDate: e.target.value, dueTouched: true })} /></${Field}>
      <${PriceFields} amount=${f.amount} inclVat=${f.inclVat} vatRate=${f.vatRate} rates=${[s.vatRate, 0]} onChange=${set} />
      <div class="full"><${VatSummary} ...${v} /></div>
      ${f.status === 'nidurfellt' ? html`<${ConvertedBox} f=${f} set=${set} id=${id} />` : html`
      <${Field} label="Staða" full><${Segmented} options=${INV_STATUS} value=${f.status} onChange=${(k) => set({ status: k })} /></${Field}>
      ${existing && f.status !== 'greitt' && html`<div class="full"><button type="button" class="ghost small" onClick=${() => openModal('convert', { id })}>Breyta í greiða eða inneign</button></div>`}`}
      ${f.status !== 'osent' && f.status !== 'nidurfellt' && html`<${Field} label="Sent dags."><input type="date" value=${f.sentDate} onInput=${(e) => set({ sentDate: e.target.value })} /></${Field}>`}
      ${f.status === 'greitt' && html`<${Field} label="Greitt dags."><input type="date" value=${f.paidDate} onInput=${(e) => set({ paidDate: e.target.value })} /></${Field}>`}
      <${Field} label="Reikningur (PDF)" full>
        <${AttachmentField} value=${f.attachment} onChange=${(a) => set({ attachment: a })} folder=${'Reikningar/' + (yearOf(f.issueDate) || '')} baseName=${`${f.issueDate} ${f.number || ''} ${f.clientName || ''}`} />
      </${Field}>
      <${Field} label="Athugasemdir" full><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

function ConvertedBox({ f, set, id }) {
  const undo = () => {
    const inv = store.find('invoices', id);
    store.upsert('invoices', { ...inv, status: inv.prevStatus || 'sent', convType: '', creditDone: false });
    const g = store.find('gigs', inv.gigId);
    if (g && (g.pricing === 'greidi' || g.pricing === 'inneign')) store.upsert('gigs', { ...g, pricing: 'samid' });
    closeModal();
    notify('Breytingin var afturkölluð.');
  };
  return html`<fieldset class="full sub">
    <legend>Breytt í ${(CONV_TYPE[f.convType] || '').toLowerCase()}${f.convDate ? ' · ' + fmtDate(f.convDate) : ''}</legend>
    <p class="hint">Telst ekki til tekna, útistandandi greiðslna eða VSK.</p>
    ${f.convNote && html`<p>${f.convNote}</p>`}
    <label class="check"><input type="checkbox" checked=${!!f.creditDone} onChange=${(e) => set({ creditDone: e.target.checked })} /> Reikningur felldur niður í Konto (kreditreikningur)</label>
    ${f.creditDone && html`<${Field} label="Nr. kreditreiknings (valfrjálst)"><input type="text" value=${f.creditNumber || ''} onInput=${(e) => set({ creditNumber: e.target.value })} /></${Field}>`}
    <div><button type="button" class="link-btn small" onClick=${undo}>Afturkalla breytingu</button></div>
  </fieldset>`;
}

export function ConvertModal({ id }) {
  const inv = store.find('invoices', id);
  const [c, setC] = useState({ convType: 'greidi', convDate: todayISO(), convNote: '', creditDone: false, creditNumber: '' });
  const set = (p) => setC((o) => ({ ...o, ...p }));
  const save = () => {
    store.upsert('invoices', { ...inv, ...c, status: 'nidurfellt', prevStatus: inv.status });
    const g = store.find('gigs', inv.gigId);
    if (g) store.upsert('gigs', { ...g, pricing: c.convType, estValue: inv.net });
    closeModal(); closeModal(); // closes this dialog and the form it was opened from
    notify(c.creditDone ? 'Reikningi breytt.' : `Reikningi breytt. Mundu að fella hann niður í Konto – áminning er á Yfirliti.`);
  };
  return html`<${Modal} title="Breyta í greiða eða inneign" footer=${html`<${Footer} onSave=${save} saveLabel="Breyta" />`}>
    <div class="grid">
      <p class="full">${inv.description || 'Reikningur'} ${inv.number ? '· nr. ' + inv.number : ''} – <strong>${kr(inv.gross)}</strong></p>
      <${Field} label="Breyta í" full><${Segmented} options=${CONV_TYPE} value=${c.convType} onChange=${(k) => set({ convType: k })} /></${Field}>
      <${Field} label="Dagsetning"><input type="date" value=${c.convDate} onInput=${(e) => set({ convDate: e.target.value })} /></${Field}>
      <${Field} label="Athugasemd" full><textarea rows="2" value=${c.convNote} placeholder=${c.convType === 'inneign' ? 't.d. inneign hjá viðskiptavini – í hverju og hve mikið' : 't.d. ástæða'} onInput=${(e) => set({ convNote: e.target.value })}></textarea></${Field}>
      <label class="check full"><input type="checkbox" checked=${c.creditDone} onChange=${(e) => set({ creditDone: e.target.checked })} /> Ég er þegar búin(n) að fella reikninginn niður í Konto</label>
      ${!c.creditDone && html`<p class="hint full">Þú færð áminningu á Yfirliti þar til þú hakar við að reikningurinn hafi verið felldur niður.</p>`}
    </div>
  </${Modal}>`;
}

export function PaidModal({ id }) {
  const inv = store.find('invoices', id);
  const [date, setDate] = useState(todayISO());
  const save = () => { store.upsert('invoices', { ...inv, status: 'greitt', paidDate: date, sentDate: inv.sentDate || inv.issueDate }); closeModal(); };
  return html`<${Modal} title="Merkja greitt" footer=${html`<${Footer} onSave=${save} saveLabel="Merkja greitt" />`}>
    <p>${inv.description || 'Reikningur'} ${inv.number ? '· nr. ' + inv.number : ''} – <strong>${kr(inv.gross)}</strong></p>
    <${Field} label="Greiðsludagur"><input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></${Field}>
  </${Modal}>`;
}

// ================= EXPENSE =================
export function ExpenseForm({ id, preset, onSaved, title }) {
  const data = store.getData();
  const s = data.settings;
  const existing = store.find('expenses', id);
  const [f, setF] = useState(() => existing || {
    name: '', date: todayISO(), supplier: '', category: s.expenseCategories[0], amount: 0, inclVat: true, vatRate: s.vatRate,
    deductible: isVatRegistered(s, (preset && preset.date) || todayISO()), deductPct: 100, foreign: false, asset: false, attachment: null, notes: '', ...(preset || {}),
  });
  const set = (patch) => setF((o) => {
    const n = { ...o, ...patch };
    if (patch.deductible !== undefined) n.dedTouched = true;
    else if (patch.date && !o.dedTouched && !existing) n.deductible = isVatRegistered(s, patch.date);
    return n;
  });
  const v = calcVat(f.amount, f.vatRate, f.inclVat);
  const beforeVat = !isVatRegistered(s, f.date);
  const deductibleVat = f.deductible ? Math.round((v.vat * (Number(f.deductPct) || 0)) / 100) : 0;
  const suppliers = [...new Set(data.expenses.map((e) => e.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'is'));

  const save = () => {
    if (!f.name.trim()) { notify('Vantar heiti.', 'error'); return; }
    if (!f.amount) { notify('Vantar upphæð.', 'error'); return; }
    const { dedTouched, ...rest } = f;
    const rec = store.upsert('expenses', { ...rest, name: f.name.trim(), ...v, deductibleVat });
    closeModal();
    if (onSaved) onSaved(rec);
  };
  const del = () => confirmDelete('þessum kostnaðarlið', () => { store.remove('expenses', id); closeModal(); });

  return html`<${Modal} title=${title || (existing ? 'Breyta kostnaði' : 'Skrá kostnað')} footer=${html`<${Footer} onSave=${save} onDelete=${existing && del} />`}>
    <div class="grid">
      <${Field} label="Heiti" full><input type="text" value=${f.name} autofocus placeholder="t.d. Lightroom áskrift" onInput=${(e) => set({ name: e.target.value })} /></${Field}>
      <${Field} label="Dagsetning"><input type="date" value=${f.date} onInput=${(e) => set({ date: e.target.value })} /></${Field}>
      <${Field} label="Seljandi">
        <input type="text" list="supplier-list" value=${f.supplier} onInput=${(e) => set({ supplier: e.target.value })} />
        <datalist id="supplier-list">${suppliers.map((x) => html`<option value=${x} />`)}</datalist>
      </${Field}>
      <${Field} label="Flokkur">
        <select value=${f.category} onChange=${(e) => set({ category: e.target.value })}>
          ${[...new Set([...s.expenseCategories, f.category])].filter(Boolean).map((c) => html`<option value=${c}>${c}</option>`)}
        </select>
      </${Field}>
      <${PriceFields} amount=${f.amount} inclVat=${f.inclVat} vatRate=${f.vatRate} onChange=${set} label="Verð" />
      <div class="full checks">
        <label class="check"><input type="checkbox" checked=${f.deductible} onChange=${(e) => set({ deductible: e.target.checked })} /> Innskattur frádráttarbær</label>
        ${beforeVat && html`<span class="hint">Fyrir VSK-skráningu: innskattur er almennt ekki frádráttarbær.</span>`}
        ${f.deductible && v.vat > 0 && html`<label class="check inline">Hlutfall <input type="number" min="0" max="100" value=${f.deductPct} onInput=${(e) => set({ deductPct: e.target.value })} class="pct" /> %</label>`}
      </div>
      <div class="full"><${VatSummary} ...${v} extra=${html`
        <div><span>Frádráttarbær innskattur</span><strong>${kr(deductibleVat)}</strong></div>
        <div class="hl"><span>Raunkostnaður</span><strong>${kr(v.gross - deductibleVat)}</strong></div>`} /></div>
      <div class="full checks">
        <label class="check"><input type="checkbox" checked=${f.foreign} onChange=${(e) => set({ foreign: e.target.checked })} /> Erlend þjónusta</label>
        <label class="check"><input type="checkbox" checked=${f.asset} onChange=${(e) => set({ asset: e.target.checked })} /> Eign / búnaður (fyrning)</label>
      </div>
      ${f.foreign && html`<p class="hint full">Af keyptri erlendri þjónustu (t.d. áskriftum) þarf oft að standa skil á VSK sjálf(ur). Merkt fyrir bókarann.</p>`}
      <${Field} label="Kvittun / reikningur" full>
        <${AttachmentField} value=${f.attachment} onChange=${(a) => set({ attachment: a })} folder=${'Kvittanir/' + (yearOf(f.date) || '')} baseName=${`${f.date} ${f.supplier || ''} ${f.name}`} />
      </${Field}>
      <${Field} label="Athugasemdir" full><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

// ================= PURCHASE (shopping list) =================
export function PurchaseForm({ id }) {
  const data = store.getData();
  const s = data.settings;
  const existing = store.find('purchases', id);
  const [f, setF] = useState(() => existing || {
    name: '', category: s.expenseCategories[0], estPrice: 0, inclVat: true, vatRate: s.vatRate, link: '', priority: 'gagnlegt',
    status: 'hugmynd', reason: '', notes: '', plannedDate: '',
  });
  const set = (patch) => setF((o) => ({ ...o, ...patch }));
  const v = calcVat(f.estPrice, f.vatRate, f.inclVat);
  const save = () => {
    if (!f.name.trim()) { notify('Vantar heiti.', 'error'); return; }
    store.upsert('purchases', { ...f, name: f.name.trim() });
    closeModal();
  };
  const del = () => confirmDelete('þessari færslu', () => { store.remove('purchases', id); closeModal(); });
  return html`<${Modal} title=${existing ? 'Breyta innkaupum' : 'Ný innkaupahugmynd'} footer=${html`<${Footer} onSave=${save} onDelete=${existing && del} />`}>
    <div class="grid">
      <${Field} label="Vara" full><input type="text" value=${f.name} autofocus placeholder="t.d. Sony 85mm f/1.4" onInput=${(e) => set({ name: e.target.value })} /></${Field}>
      <${Field} label="Flokkur">
        <select value=${f.category} onChange=${(e) => set({ category: e.target.value })}>
          ${[...new Set([...s.expenseCategories, f.category])].filter(Boolean).map((c) => html`<option value=${c}>${c}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Staða">
        <select value=${f.status} onChange=${(e) => set({ status: e.target.value })}>
          ${Object.entries(PURCHASE_STATUS).filter(([k]) => k !== 'keypt' || f.status === 'keypt').map(([k, l]) => html`<option value=${k}>${l}</option>`)}
        </select>
      </${Field}>
      <${Field} label="Forgangur" full><${Segmented} options=${PRIORITY} value=${f.priority} onChange=${(k) => set({ priority: k })} /></${Field}>
      <${PriceFields} amount=${f.estPrice} inclVat=${f.inclVat} vatRate=${f.vatRate} onChange=${(p) => set(p.amount !== undefined ? { estPrice: p.amount } : p)} label="Áætlað verð" />
      <div class="full"><${VatSummary} ...${v} /></div>
      <${Field} label="Hlekkur á vöru / verslun" full><input type="url" value=${f.link} placeholder="https://" onInput=${(e) => set({ link: e.target.value })} /></${Field}>
      <${Field} label="Af hverju?" full><input type="text" value=${f.reason} placeholder="t.d. betri í lítilli birtu í brúðkaupum" onInput=${(e) => set({ reason: e.target.value })} /></${Field}>
      <${Field} label="Áætluð kaup (valfrjálst)"><input type="date" value=${f.plannedDate} onInput=${(e) => set({ plannedDate: e.target.value })} /></${Field}>
      <${Field} label="Athugasemdir" full><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

// Mark purchase as bought -> creates an expense
export function BuyForm({ id }) {
  const p = store.find('purchases', id);
  return html`<${ExpenseForm} title="Keypt – skrá sem kostnað"
    preset=${{ name: p.name, category: p.category, amount: p.estPrice, inclVat: p.inclVat, vatRate: p.vatRate, notes: p.reason || '', purchaseId: p.id, asset: p.category === 'Búnaður' }}
    onSaved=${(exp) => store.upsert('purchases', { ...store.find('purchases', id), status: 'keypt', expenseId: exp.id, boughtDate: exp.date })} />`;
}

// ================= CLIENT =================
export function ClientForm({ id }) {
  const existing = store.find('clients', id);
  const [f, setF] = useState(() => existing || { name: '', kennitala: '', email: '', phone: '', paymentDays: '', notes: '' });
  const set = (patch) => setF((o) => ({ ...o, ...patch }));
  const data = store.getData();
  const used = id && (data.gigs.some((g) => g.clientId === id) || data.invoices.some((i) => i.clientId === id));
  const save = () => { if (!f.name.trim()) { notify('Vantar nafn.', 'error'); return; } store.upsert('clients', { ...f, name: f.name.trim() }); closeModal(); };
  const del = () => {
    if (used) { notify('Viðskiptavinur er tengdur giggum eða reikningum og verður ekki eytt.', 'error'); return; }
    confirmDelete('viðskiptavini', () => { store.remove('clients', id); closeModal(); });
  };
  return html`<${Modal} title=${existing ? 'Viðskiptavinur' : 'Nýr viðskiptavinur'} footer=${html`<${Footer} onSave=${save} onDelete=${existing && del} />`}>
    <div class="grid">
      <${Field} label="Nafn" full><input type="text" value=${f.name} onInput=${(e) => set({ name: e.target.value })} /></${Field}>
      <${Field} label="Kennitala"><input type="text" inputmode="numeric" value=${f.kennitala} onInput=${(e) => set({ kennitala: e.target.value })} /></${Field}>
      <${Field} label="Sími"><input type="tel" value=${f.phone} onInput=${(e) => set({ phone: e.target.value })} /></${Field}>
      <${Field} label="Greiðslufrestur (dagar)" hint=${`Autt = sjálfgefið (${data.settings.dueDays} dagar)`}><input type="number" min="0" inputmode="numeric" value=${f.paymentDays ?? ''} placeholder=${String(data.settings.dueDays)} onInput=${(e) => set({ paymentDays: e.target.value === '' ? '' : Number(e.target.value) })} /></${Field}>
      <${Field} label="Netfang" full><input type="email" value=${f.email} onInput=${(e) => set({ email: e.target.value })} /></${Field}>
      <${Field} label="Athugasemdir" full><textarea rows="2" value=${f.notes} onInput=${(e) => set({ notes: e.target.value })}></textarea></${Field}>
    </div>
  </${Modal}>`;
}

export const MODALS = {
  gig: GigForm, suggest: SuggestModal, invoice: InvoiceForm, paid: PaidModal, convert: ConvertModal, expense: ExpenseForm,
  purchase: PurchaseForm, buy: BuyForm, client: ClientForm, confirm: ConfirmModal,
};
export { Icon, gigAmounts };
