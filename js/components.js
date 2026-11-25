import { notify, onToasts, getToasts } from './notify.js';
// Shared UI pieces
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import * as store from './store.js';
import { kr, fmtNum, parseAmount, calcVat } from './util.js';

export { html };

// ---------- store hook ----------
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
  return store.getData();
}

// ---------- global UI state (modals, year) ----------
let modalStack = [];
let year = Number(localStorage.getItem('year')) || new Date().getFullYear();
const uiListeners = new Set();
const uiNotify = () => uiListeners.forEach((f) => f());
export function useUI() {
  const [, force] = useState(0);
  useEffect(() => { uiListeners.add(force2); return () => uiListeners.delete(force2); function force2() { force((n) => n + 1); } }, []);
  return { modals: modalStack, year };
}
export function openModal(type, props = {}) { modalStack = [...modalStack, { type, props, key: Date.now() + Math.random() }]; uiNotify(); }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalStack.length) closeModal(); });
export function closeModal() { modalStack = modalStack.slice(0, -1); uiNotify(); }
export function setYear(y) { year = y; localStorage.setItem('year', y); uiNotify(); }
export const getYear = () => year;

// ---------- icons ----------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  camera: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  invoice: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8',
  receipt: 'M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2zM9 7h6M9 11h6M9 15h4',
  cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  clip: 'M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L15 7.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  check: 'M4 12l5 5L20 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  cloud: 'M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
};
export function Icon({ name, size = 20 }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICONS[name]} /></svg>`;
}

// ---------- layout bits ----------
export function Modal({ title, children, footer, wide }) {
  return html`
    <div class="modal-backdrop" onClick=${(e) => e.target === e.currentTarget && closeModal()}>
      <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
        <header class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${closeModal} aria-label="Loka"><${Icon} name="x" /></button>
        </header>
        <div class="modal-body">${children}</div>
        ${footer && html`<footer class="modal-foot">${footer}</footer>`}
      </div>
    </div>`;
}

export function Field({ label, children, hint, full }) {
  return html`<label class=${'field' + (full ? ' full' : '')}><span class="field-label">${label}</span>${children}${hint && html`<span class="hint">${hint}</span>`}</label>`;
}

export function Segmented({ options, value, onChange, small }) {
  return html`<div class=${'seg' + (small ? ' small' : '')} role="radiogroup">
    ${Object.entries(options).map(([k, label]) => html`
      <button type="button" role="radio" aria-checked=${value === k} class=${value === k ? 'on' : ''} onClick=${() => onChange(k)}>${label}</button>`)}
  </div>`;
}

// Amount in krónur with thousand separators while typing (12.500).
// step: arrow keys and the ▲▼ buttons change the amount by this much. allowEmpty: empty field gives ''.
export function MoneyInput({ value, onChange, placeholder, autofocus, step, allowEmpty }) {
  const show = (v) => (v === '' || v == null || (!v && !allowEmpty) ? '' : fmtNum(v));
  const [text, setText] = useState(show(value));
  const ref = useRef();
  useEffect(() => {
    const cur = text === '' ? (allowEmpty ? '' : 0) : Math.round(parseAmount(text));
    if (cur !== (value ?? (allowEmpty ? '' : 0))) setText(show(value));
  }, [value]);
  useEffect(() => { if (autofocus && ref.current) ref.current.focus(); }, []);
  const emit = (t) => onChange(t === '' && allowEmpty ? '' : Math.round(parseAmount(t)));
  const onInput = (e) => {
    const el = e.target;
    const raw = el.value;
    const digitsRight = raw.slice(el.selectionStart).replace(/\D/g, '').length;
    const neg = raw.trim().startsWith('-') || raw.trim().startsWith('−');
    const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const t = digits ? (neg ? '−' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
    setText(t); emit(t);
    // keep the caret at the same digit after dots are added
    requestAnimationFrame(() => {
      let pos = t.length, seen = 0;
      while (pos > 0 && seen < digitsRight) { pos--; if (/\d/.test(t[pos])) seen++; }
      try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };
  const bump = (dir) => {
    const cur = Math.round(parseAmount(text)) || 0;
    const next = Math.max(0, cur + dir * step);
    setText(show(next)); onChange(next);
  };
  return html`<div class=${'money' + (step ? ' stepper' : '')}><input ref=${ref} type="text" inputmode="numeric" value=${text} placeholder=${placeholder || '0'}
    onInput=${onInput}
    onKeyDown=${(e) => { if (step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); } }}
    onBlur=${() => setText(show(value))} /><span>kr.</span>
    ${step && html`<div class="steps"><button type="button" tabindex="-1" aria-label=${'Hækka um ' + fmtNum(step)} onClick=${() => bump(1)}>▲</button><button type="button" tabindex="-1" aria-label=${'Lækka um ' + fmtNum(step)} onClick=${() => bump(-1)}>▼</button></div>`}
  </div>`;
}

export function VatSummary({ net, vat, gross, extra }) {
  return html`<div class="vatsum">
    <div><span>Upphæð án VSK</span><strong>${kr(net)}</strong></div>
    <div><span>VSK</span><strong>${kr(vat)}</strong></div>
    <div><span>Upphæð með VSK</span><strong>${kr(gross)}</strong></div>
    ${extra}
  </div>`;
}

// Amount + incl/excl VAT + rate, emits {amount, inclVat, vatRate}
export function PriceFields({ amount, inclVat, vatRate, rates = [24, 11, 0], onChange, label = 'Upphæð', autofocus }) {
  return html`
    <${Field} label=${label}><${MoneyInput} value=${amount} autofocus=${autofocus} onChange=${(v) => onChange({ amount: v })} /></${Field}>
    <${Field} label="Upphæð er">
      <${Segmented} small options=${{ excl: 'án VSK', incl: 'með VSK' }} value=${inclVat ? 'incl' : 'excl'} onChange=${(k) => onChange({ inclVat: k === 'incl' })} />
    </${Field}>
    <${Field} label="VSK-hlutfall">
      <${Segmented} small options=${Object.fromEntries(rates.map((r) => [String(r), r ? r + '%' : 'Enginn']))} value=${String(vatRate)} onChange=${(k) => onChange({ vatRate: Number(k) })} />
    </${Field}>`;
}

export function AttachmentField({ value, onChange, folder, baseName, accept = 'application/pdf,image/*' }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { onChange(await store.putFile(folder, file, baseName)); } catch (err) { notify('Tókst ekki að hlaða upp: ' + err.message, 'error'); }
    setBusy(false);
  };
  return html`<div class="attach">
    ${value ? html`
      <button type="button" class="link-btn" onClick=${() => store.openFile(value)}><${Icon} name="clip" size=${16} /> ${value.name}</button>
      <button type="button" class="ghost small" onClick=${() => onChange(null)}>Fjarlægja</button>` : ''}
    <label class="btn ghost small file-btn">
      ${busy ? 'Hleð upp…' : value ? 'Skipta um skjal' : html`<${Icon} name="clip" size=${16} /> Hengja við skjal`}
      <input type="file" accept=${accept} onChange=${pick} disabled=${busy} hidden />
    </label>
  </div>`;
}

export function Badge({ tone = 'grey', children }) {
  return html`<span class=${'badge ' + tone}>${children}</span>`;
}

export function Empty({ children }) {
  return html`<div class="empty">${children}</div>`;
}

// In-page confirmation: opens a small dialog, runs onYes if confirmed
export function confirmAction(text, onYes, yesLabel = 'Já') { openModal('confirm', { text, onYes, yesLabel }); }
export function confirmDelete(what, onYes) { confirmAction(`Eyða ${what}? Ekki er hægt að afturkalla.`, onYes, 'Eyða'); }
export function ConfirmModal({ text, onYes, yesLabel }) {
  return html`<${Modal} title="Staðfesta" footer=${html`<span></span><div class="row">
      <button type="button" class="ghost" onClick=${closeModal}>Hætta við</button>
      <button type="button" class=${yesLabel === 'Eyða' ? 'primary danger-fill' : 'primary'} onClick=${() => { closeModal(); onYes(); }}>${yesLabel}</button></div>`}>
    <p>${text}</p>
  </${Modal}>`;
}
export function Toasts() {
  const [list, setList] = useState(getToasts());
  useEffect(() => onToasts(setList), []);
  return html`<div class="toasts" role="status" aria-live="polite">${list.map((t) => html`<div class=${'toast ' + t.tone} key=${t.id}>${t.text}</div>`)}</div>`;
}

// Typeable client name with suggestions; new names create a client on save
export function ClientInput({ value, onChange }) {
  const data = store.getData();
  return html`<input type="text" list="client-list" value=${value} placeholder="Nafn viðskiptavinar" onInput=${(e) => onChange(e.target.value)} />
    <datalist id="client-list">${data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'is')).map((c) => html`<option value=${c.name} />`)}</datalist>`;
}
export function resolveClient(name) {
  name = (name || '').trim();
  if (!name) return null;
  const data = store.getData();
  const existing = data.clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return store.upsert('clients', { name }).id;
}

export { calcVat, notify };
