// A small stand-in for the Claude dashboard runtime, so the same page runs on GitHub Pages.
// Data comes from the daily snapshot in data/ (written by scripts/snapshot.mjs), not from live queries.
(() => {
  const loaders = {}, calcs = {}, draws = {}, onDataFns = [];
  const store = {};          // dataset key -> {status, data, columns, message, truncated, meta}
  let manifest = null, queries = null, gen = 0, calcMemo = {}, scheduled = false;

  // "Today" is the date the snapshot was taken (data/today.js), so relative dates resolve to files that exist.
  const TODAY = window.DASH_SNAPSHOT_DATE || new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
  window.DASH_TODAY_MS = Date.parse(TODAY + 'T12:00:00Z');
  const daysAgo = (n) => new Date(window.DASH_TODAY_MS - n * 86400000).toISOString().slice(0, 10);
  const RAW_DEFAULTS = window.DASH_DEFAULT_PARAMS || {};
  const isRelative = (v) => v && typeof v === 'object' && v.daysAgo != null;
  const DEFAULT_PARAMS = Object.fromEntries(Object.entries(RAW_DEFAULTS).map(([k, v]) => [k, isRelative(v) ? daysAgo(v.daysAgo) : v]));
  const PARAM_KEY = 'wiom-ibf-params';
  let params = { ...DEFAULT_PARAMS };
  try { Object.assign(params, JSON.parse(localStorage.getItem(PARAM_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  // Only the view settings (tab, filters the snapshot covers) are remembered.
  const saveParams = () => { try { localStorage.setItem(PARAM_KEY, JSON.stringify(params)); } catch (e) { /* ignore */ } };

  const keyFor = (id) => {
    const q = queries && queries[id];
    if (!q) return null;
    return id + '|' + q.params.map((n) => `${n}=${params[n]}`).join('|');
  };

  const normalise = (out) => {
    if (Array.isArray(out)) return { data: out, columns: out.length ? Object.keys(out[0]) : [] };
    if (out && Array.isArray(out.rows)) return { data: out.rows, columns: out.columns || [], truncated: !!out.truncated, meta: out.meta };
    if (out && 'data' in out) return { data: out.data, columns: out.columns || [], truncated: !!out.truncated, meta: out.meta };
    return { data: out, columns: [] };
  };

  const load = (id, key) => {
    store[key] = { status: 'loading', data: [] };
    const file = manifest.files[key];
    if (!file) {
      // A remembered date can go stale once the snapshot moves on: fall back to that filter's rolling default.
      const stale = queries[id].params.filter((n) => isRelative(RAW_DEFAULTS[n]) && params[n] !== DEFAULT_PARAMS[n]);
      if (stale.length) { delete store[key]; window.dash.setParams(Object.fromEntries(stale.map((n) => [n, DEFAULT_PARAMS[n]]))); return; }
      store[key] = { status: 'error', data: [], message: 'This filter isn’t in the daily snapshot. Pick the default, or open the live dashboard in Claude.' };
      schedule();
      return;
    }
    fetch(`data/${file}`, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`Snapshot file missing (${r.status})`); return r.json(); })
      .then(async (answer) => {
        const L = loaders[id];
        const out = L ? await L.fn({ answer, items: [answer], args: {}, call: () => { throw new Error('Not available in the snapshot'); } }) : answer;
        store[key] = { status: 'ok', refreshing: false, ...normalise(out) };
      })
      .catch((e) => { store[key] = { status: 'error', data: [], message: String(e && e.message || e) }; })
      .finally(schedule);
  };

  const data = (id) => {
    if (calcs[id]) return calcData(id);
    if (!manifest) return { status: 'loading', data: [] };
    const key = keyFor(id);
    if (!key) return { status: 'missing', data: [] };
    if (!store[key]) load(id, key);
    return store[key];
  };

  const calcData = (id) => {
    if (calcMemo[id]) return calcMemo[id];
    const c = calcs[id];
    const ins = c.inputs.map((i) => data(i));
    const bad = ins.find((d) => d.status !== 'ok');
    let res;
    if (bad) res = { status: bad.status === 'error' ? 'error' : bad.status, data: null, message: bad.message };
    else {
      try { res = { status: 'ok', data: c.fn(...ins.map((d) => d.data)) }; }
      catch (e) { console.error(`calc ${id}`, e); res = { status: 'error', data: null, message: String(e.message || e) }; }
    }
    calcMemo[id] = res;
    return res;
  };

  const render = () => {
    scheduled = false; gen += 1; calcMemo = {};
    document.querySelectorAll('[data-draw]').forEach((el) => {
      const fn = draws[el.dataset.draw];
      if (!fn) return;
      try { fn(el); } catch (e) { console.error(`draw ${el.dataset.draw}`, e); }
    });
    for (const fn of onDataFns) { try { fn(); } catch (e) { console.error('onData', e); } }
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(render); } };

  window.dash = {
    loader: (id, def) => { loaders[id] = def; },
    calc: (id, def) => { calcs[id] = def; },
    draw: (name, fn) => { draws[name] = fn; schedule(); },
    data,
    onData: (fn) => { onDataFns.push(fn); schedule(); },
    params: () => ({ ...params }),
    setParams: (p) => { params = { ...params, ...p }; for (const k of Object.keys(p)) if (p[k] == null) delete params[k]; saveParams(); schedule(); },
    resetParams: () => { params = { ...DEFAULT_PARAMS }; saveParams(); schedule(); },
    refresh: () => {},
    setLink: () => {},
    colors: ['#D9008D', '#6D17CE', '#008043', '#B85C00', '#0B6BCB', '#5C5570'],
  };

  let lastW = 0;
  window.addEventListener('resize', () => { const w = document.documentElement.clientWidth; if (w !== lastW) { lastW = w; schedule(); } });

  Promise.all([
    fetch('data/manifest.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('queries.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]).then(([m, q]) => { manifest = m; queries = q; schedule(); })
    .catch((e) => { manifest = { files: {} }; queries = {}; console.error(e); schedule(); });
})();
