// Tiny IndexedDB key-value store (data cache + local files)
let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('ljosmyndabokhald', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('kv', mode);
    const req = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}
export const idbGet = (k) => tx('readonly', (s) => s.get(k));
export const idbSet = (k, v) => tx('readwrite', (s) => s.put(v, k));
export const idbDel = (k) => tx('readwrite', (s) => s.delete(k));
