import { html, render, useState, useEffect } from '../vendor/preact-htm.js';
import * as store from './store.js';
import * as dbx from './dropbox.js';
import { useStore, useUI, openModal, Icon, Field, Segmented, Empty, Toasts, confirmAction, notify } from './components.js';
import { MODALS } from './forms.js';
import { Dashboard, Gigs, Invoices, Expenses, Purchases, Accounting, YearSelect } from './views.js';

const ROUTES = [
  { id: 'yfirlit', label: 'Yfirlit', icon: 'home', view: Dashboard },
  { id: 'gigg', label: 'Gigg', icon: 'camera', view: Gigs },
  { id: 'reikningar', label: 'Reikningar', icon: 'invoice', view: Invoices },
  { id: 'kostnadur', label: 'Kostnaður', icon: 'receipt', view: Expenses },
  { id: 'innkaup', label: 'Innkaup', icon: 'cart', view: Purchases },
  { id: 'bokhald', label: 'Bókhald', icon: 'chart', view: Accounting },
];

function useRoute() {
  const get = () => location.hash.replace(/^#\/?/, '') || 'yfirlit';
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => { setR(get()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

// ---------- theme ----------
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme(localStorage.getItem('theme'));

export const PALETTES = [
  { id: 'rokkur', name: 'Rökkur', desc: 'Blár, fjólublár og appelsínugulur', colors: ['#2f5fd0', '#5b45c2', '#e8682a', '#f6f5fa'] },
  { id: 'sjor', name: 'Sjór', desc: 'Dökkgrænblár', colors: ['#1f5f5b', '#e3efed', '#f6f6f4', '#ffffff'] },
  { id: 'blar', name: 'Blár', desc: 'Dökkblár og svalur', colors: ['#2d4f86', '#e3eaf5', '#f4f6f9', '#ffffff'] },
  { id: 'ploma', name: 'Plóma', desc: 'Djúpur fjólublár', colors: ['#6b3a6e', '#f0e5f0', '#f7f5f7', '#ffffff'] },
  { id: 'sandur', name: 'Sandur', desc: 'Hlýr, terrakotta', colors: ['#b0552f', '#f6e6dc', '#f7f3ee', '#fffdfa'] },
  { id: 'grafit', name: 'Grafít', desc: 'Svart, hvítt og grátt', colors: ['#1a1a1a', '#6e6e6e', '#efefef', '#ffffff'] },
];
function applyPalette(id) {
  document.documentElement.dataset.palette = id;
  try { localStorage.setItem('palette', id); } catch { /* ignore */ }
}

function SyncIndicator() {
  useStore();
  const s = store.getSync();
  if (store.getMode() !== 'dropbox') return null;
  const map = { idle: ['ok', 'Vistað í Dropbox'], saving: ['busy', s.message || 'Vistar…'], error: ['err', s.message], offline: ['warn', s.message], auth: ['err', s.message] };
  const [cls, text] = map[s.status] || map.idle;
  return html`<a class=${'sync ' + cls} href="#stillingar" title=${text}><${Icon} name="cloud" size=${16} /><span>${text}</span></a>`;
}

// ---------- settings ----------
function Settings() {
  const data = useStore();
  const s = data.settings;
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'auto');
  const [cats, setCats] = useState(s.categories.join('\n'));
  const [ecats, setEcats] = useState(s.expenseCategories.join('\n'));
  const [name, setName] = useState('');
  useEffect(() => { if (store.getMode() === 'dropbox' && dbx.isConnected()) dbx.accountName().then(setName).catch(() => {}); }, []);
  const lines = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);
  const sync = store.getSync();
  return html`
    <div class="page-head"><h1>Stillingar</h1></div>
    <div class="two-col">
      <div class="stack">
        <section class="card">
          <h2>Gagnageymsla</h2>
          ${store.isDemo() ? html`<p>Þetta er prufuútgáfa. Gögnin eru aðeins vistuð í þessum vafra og Dropbox er ekki í boði hér.</p><${DemoActions} />` : store.getMode() === 'dropbox' ? html`
            ${dbx.isConnected() && sync.status !== 'auth' ? html`<p>Tengt við Dropbox${name ? ' sem ' + name : ''}. Gögn og skjöl eru í möppunni <strong>Dropbox/Apps/…</strong> sem appið á.</p>
              <div class="row"><button onClick=${() => store.refresh()}>Samstilla núna</button>
              <button class="ghost danger" onClick=${() => confirmAction('Aftengja Dropbox á þessu tæki?', () => store.disconnectDropbox(), 'Aftengja')}>Aftengja</button></div>`
              : html`<p class="red">Ekki tengt – skráðu þig inn aftur.</p><button class="primary" onClick=${() => store.connectDropbox()}>Tengjast Dropbox</button>`}
          ` : html`<p>Gögnin eru aðeins vistuð í <strong>þessum vafra</strong>. Tengdu Dropbox til að fá öryggisafrit og aðgang úr símanum.</p>
            <${DropboxConnect} />`}
        </section>
        <section class="card">
          <h2>Litaþema</h2>
          <div class="palettes">${PALETTES.map((p) => html`
            <button type="button" class=${'palette' + ((s.palette || 'rokkur') === p.id ? ' on' : '')} onClick=${() => { applyPalette(p.id); store.updateSettings({ palette: p.id }); }}>
              <span class="swatch">${p.colors.map((c) => html`<span style=${{ background: c }}></span>`)}</span>
              <strong>${p.name}</strong><small>${p.desc}</small>
            </button>`)}</div>
          <h3>Birta</h3>
          <${Segmented} options=${{ auto: 'Sjálfvirkt', light: 'Ljóst', dark: 'Dökkt' }} value=${theme} onChange=${(t) => { setTheme(t); localStorage.setItem('theme', t); applyTheme(t); }} />
          <p class="hint">Litaþemað fylgir gögnunum (sama í síma og tölvu). Birtan er stillt fyrir hvert tæki.</p>
        </section>
        <section class="card">
          <h2>Sjálfgefin gildi</h2>
          <div class="grid">
            <${Field} label="VSK-hlutfall (%)"><input type="number" value=${s.vatRate} onChange=${(e) => store.updateSettings({ vatRate: Number(e.target.value) || 0 })} /></${Field}>
            <${Field} label="VSK-skráður frá" hint="Fyrir þennan dag: enginn VSK á sölu og enginn frádráttur innskatts. Autt = alltaf VSK-skráður."><input type="date" value=${s.vatFrom || ''} onChange=${(e) => store.updateSettings({ vatFrom: e.target.value })} /></${Field}>
            <${Field} label="Greiðslufrestur (dagar)"><input type="number" value=${s.dueDays} onChange=${(e) => store.updateSettings({ dueDays: Number(e.target.value) || 0 })} /></${Field}>
            <${Field} label="Tímagjald í reiknivél (kr.)"><input type="number" value=${s.hourlyRate} onChange=${(e) => store.updateSettings({ hourlyRate: Number(e.target.value) || 0 })} /></${Field}>
          </div>
        </section>
        <section class="card">
          <h2>Skattaáætlun</h2>
          <p class="hint">Forsendur fyrir „Til hliðar fyrir skatta“. Tölur 2026 frá Skattinum.</p>
          <div class="grid">
            <${Field} label="Útsvar (%)" hint="Útsvar sveitarfélagsins þíns. Meðaltal 14,94%"><input type="number" step="0.01" value=${s.utsvar ?? 14.94} onChange=${(e) => store.updateSettings({ utsvar: Number(String(e.target.value).replace(',', '.')) || 14.94 })} /></${Field}>
            <${Field} label="Aðrar launatekjur á ári (kr.)" hint="Laun frá vinnuveitanda, fyrir skatt. Hefur áhrif á skattþrep"><input type="number" value=${s.otherIncome || ''} placeholder="0" onChange=${(e) => store.updateSettings({ otherIncome: Number(e.target.value) || 0 })} /></${Field}>
            <${Field} label="Reiknað endurgjald á ári (kr.)" hint="Autt = allur hagnaður (varfærið). Bókarinn ákveður þessa tölu"><input type="number" value=${s.ownPay ?? ''} placeholder="Allur hagnaður" onChange=${(e) => store.updateSettings({ ownPay: e.target.value === '' ? '' : Number(e.target.value) })} /></${Field}>
            <${Field} label="Skattur þegar greiddur á árinu (kr.)" hint="T.d. staðgreiðsla af reiknuðu endurgjaldi"><input type="number" value=${s.taxPrepaid || ''} placeholder="0" onChange=${(e) => store.updateSettings({ taxPrepaid: Number(e.target.value) || 0 })} /></${Field}>
          </div>
          <label class="check"><input type="checkbox" checked=${s.pensionOn !== false} onChange=${(e) => store.updateSettings({ pensionOn: e.target.checked })} /> Reikna lífeyrissjóð (15,5%) af reiknuðu endurgjaldi</label>
          <h3>Undanþegið VSK</h3>
          <div class="checks">${s.categories.map((c) => html`<label class="check"><input type="checkbox" checked=${(s.vatExemptCategories || []).includes(c)} onChange=${(e) => store.updateSettings({ vatExemptCategories: e.target.checked ? [...new Set([...(s.vatExemptCategories || []), c])] : (s.vatExemptCategories || []).filter((x) => x !== c) })} /> ${c}</label>`)}</div>
          <p class="hint">Gigg og reikningar í þessum flokkum fá sjálfkrafa 0% VSK, t.d. tónlistarflutningur.</p>
        </section>
        <section class="card">
          <h2>Afrit</h2>
          <p class="muted">Sæktu öll gögn sem JSON-skrá, eða lestu inn afrit (sameinað við núverandi gögn).</p>
          <div class="row">
            <button onClick=${() => store.exportJSON()}><${Icon} name="download" size=${16} /> Sækja afrit</button>
            <label class="btn ghost">Lesa inn afrit<input type="file" accept="application/json,.json" hidden onChange=${async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) { try { const r = await store.importJSON(f); notify(r.invoices + r.gigs + r.clients ? `Lesið inn: ${r.invoices} reikningar, ${r.gigs} gigg, ${r.clients} nýir viðskiptavinir${r.skipped ? ` · ${r.skipped} reikningum var sleppt (þegar skráðir)` : ''}.` : 'Ekkert nýtt – allt í skránni var þegar skráð.'); } catch (err) { notify('Ógild skrá: ' + err.message, 'error'); } } }} /></label>
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="card">
          <div class="section-head"><h2>Viðskiptavinir</h2><button class="ghost small" onClick=${() => openModal('client')}><${Icon} name="plus" size=${14} /> Nýr</button></div>
          ${data.clients.length ? html`<div class="list compact">${data.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'is')).map((c) => html`
            <button type="button" class="item" onClick=${() => openModal('client', { id: c.id })}>
              <div class="item-main"><strong>${c.name}</strong><span class="muted">${[c.kennitala, c.email, c.phone, c.paymentDays ? `${c.paymentDays} daga greiðslufrestur` : ''].filter(Boolean).join(' · ') || 'Engar nánari upplýsingar'}</span></div>
              <span class="muted small">${data.gigs.filter((g) => g.clientId === c.id).length} gigg</span>
            </button>`)}</div>` : html`<${Empty}>Viðskiptavinir verða til sjálfkrafa þegar þú skráir gigg eða reikninga.</${Empty}>`}
        </section>
        <section class="card">
          <h2>Flokkar</h2>
          <div class="grid">
            <${Field} label="Ljósmyndaflokkar (einn í línu)"><textarea rows="9" value=${cats} onInput=${(e) => setCats(e.target.value)} onBlur=${() => store.updateSettings({ categories: lines(cats) })}></textarea></${Field}>
            <${Field} label="Kostnaðarflokkar (einn í línu)"><textarea rows="9" value=${ecats} onInput=${(e) => setEcats(e.target.value)} onBlur=${() => store.updateSettings({ expenseCategories: lines(ecats) })}></textarea></${Field}>
          </div>
        </section>
      </div>
    </div>`;
}

function DropboxConnect() {
  const [key, setKey] = useState(dbx.appKey());
  const preset = !!(window.APP_CONFIG && window.APP_CONFIG.dropboxAppKey);
  if (!location.protocol.startsWith('http')) return html`<p class="hint">Dropbox virkar aðeins þegar appið er opnað af vefslóð (ekki skrá).</p>`;
  return html`<div class="stack-sm">
    ${!preset && html`<${Field} label="Dropbox App key" hint="Úr Dropbox App Console (sjá leiðbeiningar)"><input type="text" value=${key} onInput=${(e) => setKey(e.target.value)} /></${Field}>`}
    <button class="primary" disabled=${!key} onClick=${() => store.connectDropbox(key)}><${Icon} name="cloud" size=${18} /> Tengjast Dropbox</button>
  </div>`;
}

function DemoActions() {
  return html`<div class="row">
    <button type="button" class="small" onClick=${() => confirmAction('Eyða öllum gögnum og byrja með autt app?', () => { store.replaceAll({}); notify('Öllum gögnum eytt. Þú getur byrjað að skrá.'); }, 'Eyða öllu')}>Byrja með autt</button>
    <button type="button" class="small ghost" onClick=${() => confirmAction('Setja sýnigögnin inn aftur? Það sem þú hefur skráð hverfur.', async () => { const { sampleData } = await import('./sample.js'); store.replaceAll(sampleData()); notify('Sýnigögn sett inn.'); }, 'Setja inn')}>Setja inn sýnigögn</button>
  </div>`;
}
function DemoBanner() {
  if (!store.isDemo()) return null;
  return html`<div class="demo-banner"><div><strong>Prufuútgáfa</strong> · Hér eru sýnigögn til að skoða. Allt sem þú skráir vistast aðeins í þessum vafra.</div><${DemoActions} /></div>`;
}

// ---------- first run ----------
function Welcome() {
  return html`<div class="welcome">
    <div class="welcome-card card">
      <div class="logo big"><${Icon} name="camera" size=${28} /></div>
      <h1>Velkomin(n)</h1>
      <p class="muted">Einfalt utanumhald fyrir ljósmyndareksturinn – gigg, reikningar, kostnaður og innkaup.</p>
      <h2>Hvar á að geyma gögnin?</h2>
      <div class="choice">
        <div>
          <h3>Dropbox <span class="badge green">Mælt með</span></h3>
          <p class="muted small">Aðgangur úr tölvu og síma, öryggisafrit og skjöl í Dropbox-möppu. Innskráning með Dropbox-aðgangi.</p>
          <${DropboxConnect} />
        </div>
        <div>
          <h3>Bara í þessum vafra</h3>
          <p class="muted small">Til að prófa. Hægt að tengja Dropbox síðar og færa gögnin yfir.</p>
          <button onClick=${() => store.useLocalMode()}>Byrja án Dropbox</button>
        </div>
      </div>
    </div>
  </div>`;
}

function App() {
  const data = useStore();
  const palette = data.settings.palette || 'rokkur';
  useEffect(() => applyPalette(palette), [palette]);
  const { modals } = useUI();
  const route = useRoute();
  if (!store.getMode()) return html`<${Welcome} />`;
  const current = ROUTES.find((r) => r.id === route);
  const View = route === 'stillingar' ? Settings : (current || ROUTES[0]).view;
  return html`
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><div class="logo"><${Icon} name="camera" size=${18} /></div><span>Ljósmyndabókhald</span></div>
        <label class="year-pick"><span>Ár</span><${YearSelect} /></label>
        <nav>${ROUTES.map((r) => html`<a href=${'#' + r.id} class=${route === r.id || (!current && route !== 'stillingar' && r.id === 'yfirlit') ? 'active' : ''}><${Icon} name=${r.icon} /><span>${r.label}</span></a>`)}</nav>
        <div class="sidebar-foot">
          <${SyncIndicator} />
          <a href="#stillingar" class=${route === 'stillingar' ? 'active' : ''}><${Icon} name="gear" /><span>Stillingar</span></a>
        </div>
      </aside>
      <header class="topbar">
        <div class="brand"><div class="logo"><${Icon} name="camera" size=${16} /></div><span>${route === 'stillingar' ? 'Stillingar' : (current || ROUTES[0]).label}</span></div>
        <div class="row"><${SyncIndicator} /><${YearSelect} /><a class="icon-btn" href="#stillingar" aria-label="Stillingar"><${Icon} name="gear" /></a></div>
      </header>
      <main class="main"><${DemoBanner} /><${View} /></main>
      <nav class="bottomnav">${ROUTES.map((r) => html`<a href=${'#' + r.id} class=${route === r.id || (!current && route !== 'stillingar' && r.id === 'yfirlit') ? 'active' : ''}><${Icon} name=${r.icon} size=${22} /><span>${r.label}</span></a>`)}</nav>
      ${modals.map((m) => { const M = MODALS[m.type]; return html`<${M} key=${m.key} ...${m.props} />`; })}
      <${Toasts} />
    </div>`;
}

store.init().finally(() => render(html`<${App} />`, document.getElementById('app')));
