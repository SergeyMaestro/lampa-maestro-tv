// Проверка потоков для Maestro TV. Запускается в GitHub Actions по расписанию.
// Собирает открытые плейлисты, проверяет каждый поток (манифест + сегмент),
// склеивает зеркала одного канала и пишет data/channels.json и data/playlist.m3u.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = {};
require('../maestro_tv.js');
const { parseM3U, categorize, cleanKey } = globalThis.window.MaestroTV;

const BASE = 'https://iptv-org.github.io/iptv/';
// lang: ru — русскоязычные разделы, w — раздел «Зарубежные»
const SOURCES = [
  { p: 'languages/rus.m3u', lang: 'ru' },
  { p: 'languages/kaz.m3u', lang: 'ru' },
  { p: 'countries/kz.m3u', lang: 'ru' },
  { p: 'countries/by.m3u', lang: 'ru' },
  { p: 'languages/eng.m3u', lang: 'w' },
].map((x) => ({ ...x, url: BASE + x.p }));

// в зарубежном разделе это не нужно
const WORLD_SKIP = ['religious', 'legislative', 'shop'];
const WORLD_CAT = { docs: 'w_docs', travel: 'w_docs', movies: 'w_movies', news: 'w_news', sport: 'w_sport', music: 'w_music', kids: 'w_kids', fun: 'w_fun', other: 'w_fun', adult: 'adult' };

const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0 Safari/537.36';
const TIMEOUT = 9000;
const CONCURRENCY = 96;

async function get(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    });
    let body = '';
    if (opts.text) body = (await res.text()).slice(0, 200000);
    else if (opts.peek) {
      const reader = res.body?.getReader();
      if (reader) { await reader.read(); reader.cancel().catch(() => {}); }
    }
    return { ok: res.ok, status: res.status, url: res.url, type: res.headers.get('content-type') || '', body };
  } catch (e) {
    return { ok: false, status: 0, url, type: '', body: '', err: String(e.name || e) };
  } finally {
    clearTimeout(t);
  }
}

function firstUri(text, base) {
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (l && !l.startsWith('#')) return new URL(l, base).href;
  }
  return null;
}

// ok | geo | dead
async function checkStream(url) {
  const t0 = Date.now();
  const r = await get(url, { text: true });
  if (!r.ok) return { s: r.status === 403 || r.status === 451 ? 'geo' : 'dead', code: r.status };
  const isHls = r.body.includes('#EXTM3U');
  if (!isHls) {
    return /video|mpegurl|octet|dash|mp2t/i.test(r.type) ? { s: 'ok', ms: Date.now() - t0 } : { s: 'dead', code: 'type' };
  }
  let media = r.body, mediaUrl = r.url;
  if (r.body.includes('#EXT-X-STREAM-INF')) {
    const v = firstUri(r.body, r.url);
    if (!v) return { s: 'dead', code: 'novariant' };
    const vr = await get(v, { text: true });
    if (!vr.ok) return { s: vr.status === 403 || vr.status === 451 ? 'geo' : 'dead', code: vr.status };
    media = vr.body; mediaUrl = vr.url;
  }
  if (!media.includes('#EXTINF')) return { s: 'dead', code: 'nosegments' };
  const seg = firstUri(media, mediaUrl);
  if (!seg) return { s: 'dead', code: 'noseg' };
  const sr = await get(seg, { peek: true, headers: { Range: 'bytes=0-4095' } });
  if (!sr.ok) return { s: sr.status === 403 || sr.status === 451 ? 'geo' : 'dead', code: sr.status };
  return { s: 'ok', ms: Date.now() - t0 };
}

async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; items[k].res = await fn(items[k]); }
  });
  await Promise.all(workers);
}

async function main() {
  const all = [];
  for (const src of SOURCES) {
    const r = await get(src.url, { text: true });
    if (!r.ok) { console.log('source fail', src.p, r.status); continue; }
    let list = parseM3U(r.body).map((ch) => ({ ...ch, lang: src.lang }));
    if (src.lang === 'w') {
      list = list.filter((ch) => !String(ch.group).toLowerCase().split(';').some((g) => WORLD_SKIP.includes(g.trim())));
    }
    console.log(src.p, list.length);
    all.push(...list);
  }

  // уникальные URL; потоки, которым нужны спец-заголовки, Лампа не сыграет
  const byUrl = new Map();
  for (const ch of all) {
    if (ch.needsHeaders) continue;
    const prev = byUrl.get(ch.url);
    if (!prev) byUrl.set(ch.url, ch);
    else if (prev.lang === 'w' && ch.lang === 'ru') byUrl.set(ch.url, ch); // русская версия важнее
  }
  const streams = [...byUrl.values()];
  console.log('unique streams', streams.length);

  await pool(streams, CONCURRENCY, (ch) => checkStream(ch.url));

  // склеиваем зеркала одного канала
  const byKey = new Map();
  for (const ch of streams) {
    if (ch.res.s === 'dead') continue;
    const key = ch.lang + ':' + cleanKey(ch.name);
    const item = { u: ch.url, s: ch.res.s, hd: ch.hd ? 1 : 0, ms: ch.res.ms || 99999 };
    let c = byKey.get(key);
    if (!c) {
      const cat = categorize(ch);
      c = { n: ch.name, l: ch.logo, c: ch.lang === 'w' ? WORLD_CAT[cat] || 'w_fun' : cat, w: ch.lang === 'w' ? 1 : 0, src: [] };
      byKey.set(key, c);
    }
    if (!c.l && ch.logo) c.l = ch.logo;
    c.src.push(item);
  }

  const rank = { ok: 0, geo: 1 };
  const channels = [...byKey.values()].map((c) => {
    c.src.sort((a, b) => rank[a.s] - rank[b.s] || b.hd - a.hd || a.ms - b.ms);
    return {
      n: c.n, l: c.l || '', c: c.c, ...(c.w ? { w: 1 } : {}),
      s: c.src[0].s, hd: c.src.some((x) => x.hd && x.s === 'ok') ? 1 : c.src[0].hd,
      u: c.src.map((x) => x.u),
    };
  }).sort((a, b) => a.n.localeCompare(b.n, 'ru'));

  const stats = {
    checked: streams.length,
    ok: streams.filter((x) => x.res.s === 'ok').length,
    geo: streams.filter((x) => x.res.s === 'geo').length,
    dead: streams.filter((x) => x.res.s === 'dead').length,
    channels: channels.length,
  };
  console.log(stats);

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/channels.json', JSON.stringify({ updated: new Date().toISOString(), stats, channels }));

  const m3u = ['#EXTM3U'];
  for (const c of channels) {
    if (c.s !== 'ok') continue;
    m3u.push(`#EXTINF:-1 tvg-logo="${c.l}" group-title="${c.c}",${c.n}`, c.u[0]);
  }
  fs.writeFileSync('data/playlist.m3u', m3u.join('\n') + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
