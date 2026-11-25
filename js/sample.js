// Example data for the trial version (clearly marked as examples in the UI)
import { calcVat } from './util.js';
import { emptyData } from './store.js';

export function sampleData() {
  const d = emptyData();
  let n = 0;
  const t = Date.now();
  const rec = (o) => ({ id: 'synidaemi-' + ++n, createdAt: t, updatedAt: t, ...o });
  const client = (name, extra = {}) => { const c = rec({ name, kennitala: '', email: '', phone: '', notes: '', ...extra }); d.clients.push(c); return c.id; };
  const anna = client('Anna og Jón', { email: 'anna@daemi.is' });
  const hotel = client('Hótel Dæmi ehf.', { kennitala: '5501012340' });
  const studio = client('Hönnunarstofan Dæmi');
  const sigga = client('Sigga Dæmisdóttir');
  const gig = (o) => { const g = rec({ notes: '', estHours: '', actualHours: '', priceInclVat: false, price: 0, estValue: 0, ...o }); d.gigs.push(g); return g; };
  const inv = (g, o) => {
    const v = calcVat(o.amount ?? g.price, 24, false);
    d.invoices.push(rec({ gigId: g ? g.id : '', clientId: g ? g.clientId : o.clientId, description: g ? g.title : o.description, amount: o.amount ?? g.price, inclVat: false, vatRate: 24, ...v, notes: '', attachment: null, sentDate: o.issueDate, paidDate: '', ...o }));
  };
  const w1 = gig({ title: 'Brúðkaup í Hallgrímskirkju', clientId: anna, date: '2025-08-16', category: 'Brúðkaup', pricing: 'samid', price: 290000, status: 'lokid', actualHours: 13 });
  const w2 = gig({ title: 'Brúðkaup á Þingvöllum', clientId: sigga, date: '2026-06-20', category: 'Brúðkaup', pricing: 'samid', price: 340000, status: 'lokid', actualHours: 14 });
  const w3 = gig({ title: 'Brúðkaup í Hörpu', clientId: hotel, date: '2026-09-12', category: 'Brúðkaup', pricing: 'samid', price: 360000, status: 'afhent', actualHours: 13 });
  gig({ title: 'Brúðkaup í desember', clientId: anna, date: '2026-12-12', category: 'Brúðkaup', pricing: 'osamid', status: 'bokad', estHours: 10 });
  const c1 = gig({ title: 'Matseðill og innréttingar', clientId: hotel, date: '2026-03-04', category: 'Fyrirtæki og auglýsingar', pricing: 'samid', price: 120000, status: 'lokid', actualHours: 6 });
  const c2 = gig({ title: 'Starfsmannamyndir', clientId: studio, date: '2026-10-08', category: 'Fyrirtæki og auglýsingar', pricing: 'samid', price: 95000, status: 'lokid', actualHours: 5 });
  gig({ title: 'Vörumyndir fyrir vefverslun', clientId: studio, date: '2026-11-18', category: 'Vörumyndir', pricing: 'samid', price: 85000, status: 'vinnsla', estHours: 5 });
  gig({ title: 'Fermingarmyndir', clientId: sigga, date: '2026-12-05', category: 'Fermingar', pricing: 'osamid', status: 'bokad', estHours: 2 });
  gig({ title: 'Myndir fyrir góðgerðarkvöld', clientId: hotel, date: '2026-05-15', category: 'Viðburðir', pricing: 'probono', status: 'lokid', estValue: 80000 });
  gig({ title: 'Fjölskyldumyndir fyrir vinkonu', clientId: sigga, date: '2026-12-01', category: 'Fjölskyldumyndir', pricing: 'greidi', status: 'bokad' });
  gig({ title: 'Árshátíð', clientId: studio, date: '2026-02-21', category: 'Viðburðir', pricing: 'samid', price: 110000, status: 'haett' });
  inv(w1, { number: '0981', issueDate: '2025-08-25', dueDate: '2025-09-08', status: 'sent' });
  inv(w2, { number: '1042', issueDate: '2026-06-28', dueDate: '2026-07-12', status: 'greitt', paidDate: '2026-07-10' });
  inv(c1, { number: '1031', issueDate: '2026-03-10', dueDate: '2026-03-24', status: 'greitt', paidDate: '2026-03-20' });
  inv(c2, { number: '1058', issueDate: '2026-10-15', dueDate: '2026-10-29', status: 'sent' });
  inv(null, { clientId: anna, description: 'Prentun á myndabók', amount: 45000, number: '1060', issueDate: '2026-11-20', dueDate: '2026-12-04', status: 'osent', sentDate: '' });
  void w3;
  const exp = (o) => {
    const v = calcVat(o.amount, o.vatRate, o.inclVat ?? true);
    const ded = o.deductible === false ? 0 : v.vat;
    d.expenses.push(rec({ supplier: '', notes: '', attachment: null, inclVat: true, deductible: true, deductPct: 100, foreign: false, asset: false, ...o, ...v, deductibleVat: ded }));
  };
  exp({ name: 'Myndavélarhús', date: '2026-02-10', supplier: 'Ljósmyndaverslunin', category: 'Búnaður', amount: 449000, vatRate: 24, asset: true });
  exp({ name: 'Lightroom áskrift', date: '2026-01-05', supplier: 'Adobe', category: 'Áskriftir', amount: 2900, vatRate: 0, foreign: true });
  exp({ name: 'Minniskort 2×128 GB', date: '2026-06-02', supplier: 'Raftækjaverslun', category: 'Búnaður', amount: 18990, vatRate: 24 });
  exp({ name: 'Akstur á Þingvelli', date: '2026-06-20', supplier: '', category: 'Ferðakostnaður', amount: 12400, vatRate: 0, deductible: false });
  exp({ name: 'Vefhýsing', date: '2026-04-01', supplier: 'Hýsingaraðili', category: 'Þjónusta', amount: 14880, vatRate: 24 });
  const pur = (o) => d.purchases.push(rec({ link: '', notes: '', reason: '', plannedDate: '', inclVat: true, vatRate: 24, ...o }));
  pur({ name: '85mm f/1.4 linsa', category: 'Búnaður', estPrice: 289000, priority: 'mikil', status: 'listi', reason: 'Portrett í lítilli birtu', plannedDate: '2027-01-15' });
  pur({ name: 'Ferðaflass', category: 'Búnaður', estPrice: 45000, priority: 'gagnlegt', status: 'skodun' });
  pur({ name: 'Auka rafhlöður', category: 'Búnaður', estPrice: 24000, priority: 'mikil', status: 'listi' });
  pur({ name: 'Nýr bakpoki', category: 'Búnaður', estPrice: 32000, priority: 'mabida', status: 'hugmynd' });
  return d;
}
