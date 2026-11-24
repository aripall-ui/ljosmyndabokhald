// Minimal Dropbox client for a browser-only app (OAuth PKCE, App folder access)
const LS = {
  key: 'dbx_app_key', refresh: 'dbx_refresh', access: 'dbx_access', exp: 'dbx_exp', verifier: 'dbx_verifier',
};

export function appKey() {
  return (window.APP_CONFIG && window.APP_CONFIG.dropboxAppKey) || localStorage.getItem(LS.key) || '';
}
export const isConnected = () => !!localStorage.getItem(LS.refresh);
const redirectUri = () => location.origin + location.pathname;

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startAuth(key) {
  if (key) localStorage.setItem(LS.key, key.trim());
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem(LS.verifier, verifier);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    client_id: appKey(), response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256',
    token_access_type: 'offline', redirect_uri: redirectUri(),
  });
  location.href = 'https://www.dropbox.com/oauth2/authorize?' + q;
}

// Returns true if we just completed a login redirect
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  const code = q.get('code');
  if (!code && !q.get('error')) return false;
  history.replaceState(null, '', redirectUri() + location.hash);
  if (!code) throw new Error('Innskráning í Dropbox var hætt við.');
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      code, grant_type: 'authorization_code', code_verifier: localStorage.getItem(LS.verifier) || '',
      client_id: appKey(), redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error('Tókst ekki að tengjast Dropbox (' + res.status + ').');
  const t = await res.json();
  localStorage.removeItem(LS.verifier);
  localStorage.setItem(LS.refresh, t.refresh_token);
  saveAccess(t);
  return true;
}

function saveAccess(t) {
  localStorage.setItem(LS.access, t.access_token);
  localStorage.setItem(LS.exp, String(Date.now() + (t.expires_in - 60) * 1000));
}

export function disconnect() {
  const tok = localStorage.getItem(LS.access);
  if (tok) fetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {});
  [LS.refresh, LS.access, LS.exp].forEach((k) => localStorage.removeItem(k));
}

export class AuthError extends Error {}

async function token(force) {
  const exp = Number(localStorage.getItem(LS.exp) || 0);
  if (!force && localStorage.getItem(LS.access) && Date.now() < exp) return localStorage.getItem(LS.access);
  const refresh = localStorage.getItem(LS.refresh);
  if (!refresh) throw new AuthError('Ekki tengt við Dropbox');
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: appKey() }),
  });
  if (res.status === 400 || res.status === 401) throw new AuthError('Dropbox innskráning útrunnin');
  if (!res.ok) throw new Error('Dropbox svaraði ekki (' + res.status + ')');
  const t = await res.json();
  saveAccess(t);
  return t.access_token;
}

// Dropbox-API-Arg header must be ASCII: escape non-ASCII characters (Icelandic letters)
const argHeader = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

async function call(url, opts, retried) {
  const res = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: 'Bearer ' + (await token(retried)) } });
  if (res.status === 401 && !retried) return call(url, opts, true);
  return res;
}

async function errorFrom(res) {
  let summary = '';
  try { summary = (await res.json()).error_summary || ''; } catch { /* ignore */ }
  const e = new Error('Dropbox villa ' + res.status + (summary ? ': ' + summary : ''));
  e.status = res.status; e.summary = summary;
  return e;
}

export async function download(path) {
  const res = await call('https://content.dropboxapi.com/2/files/download', {
    method: 'POST', headers: { 'Dropbox-API-Arg': argHeader({ path }) },
  });
  if (res.status === 409) {
    const e = await errorFrom(res);
    if (e.summary.includes('not_found')) return null;
    throw e;
  }
  if (!res.ok) throw await errorFrom(res);
  const meta = JSON.parse(res.headers.get('Dropbox-API-Result') || '{}');
  return { blob: await res.blob(), rev: meta.rev, path: meta.path_display };
}

// mode: 'add' | 'overwrite' | {update: rev}
export async function upload(path, body, mode = 'add', autorename = false) {
  const m = typeof mode === 'string' ? { '.tag': mode } : { '.tag': 'update', update: mode.update };
  const res = await call('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': argHeader({ path, mode: m, autorename, mute: true }) },
    body,
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json(); // {rev, path_display, ...}
}

export async function tempLink(path) {
  const res = await call('https://api.dropboxapi.com/2/files/get_temporary_link', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()).link;
}

export async function accountName() {
  const res = await call('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST' });
  if (!res.ok) return '';
  const a = await res.json();
  return a.name && a.name.display_name;
}
