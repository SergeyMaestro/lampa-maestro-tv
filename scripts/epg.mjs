// Телепрограмма для Maestro TV.
// Качает открытые XMLTV, вырезает окно «сейчас − 2 ч … сейчас + 16 ч»,
// сопоставляет с нашими каналами по названиям (включая кириллические из базы iptv-org)
// и пишет компактные data/epg_ru.json и data/epg_w.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.window = globalThis.window || {};
require('../maestro_tv.js');
const { cleanKey } = globalThis.window.MaestroTV;

const NOW = Date.now();
const FROM = NOW - 2 * 3600e3;
const TO = NOW + 16 * 3600e3;

const EPG = {
  ru: ['https://iptvx.one/EPG_LITE', 'https://epg.pw/xmltv/epg_RU.xml.gz'],
  w: ['https://epg.pw/xmltv/epg_US.xml.gz', 'https://epg.pw/xmltv/epg_GB.xml.gz', 'https://epg.pw/xmltv/epg_CA.xml.gz', 'https://epg.pw/xmltv/epg_AU.xml.gz', 'https://iptvx.one/EPG_LITE'],
};

const local = process.argv[2]; // для отладки: папка с уже скачанными файлами

export function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '')
    .replace(/ё/g, 'е')
    .replace(/\b(hd|fhd|uhd|4k|sd|tv|тв|channel|канал|телеканал)\b/g, '')
    .replace(/[^a-zа-я0-9+]/g, '');
}

function parseTime(t) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/.exec(t || '');
  if (!m) return 0;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) {
    const sign = m[7][0] === '-' ? -1 : 1;
    ms -= sign * (+m[7].slice(1, 3) * 60 + +m[7].slice(3, 5)) * 60e3;
  }
  return ms;
}

function unxml(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();
}

async function openStream(url) {
  if (local) {
    const f = `${local}/${url.replace(/[^a-z0-9]/gi, '_')}`;
    if (fs.existsSync(f)) return fs.createReadStream(f);
  }
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(240e3) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Readable.fromWeb(res.body);
}

// потоковый разбор: на 200 МБ XML память не раздувается
async function readEpg(url) {
  const channels = new Map(); // id -> [names]
  const progs = new Map(); // id -> [[s,e,title]]
  const raw = await openStream(url);
  let input = raw;
  // gzip определяем по первым байтам
  const first = await new Promise((resolve, reject) => {
    raw.once('readable', () => { const b = raw.read(2); if (b) raw.unshift(b); resolve(b); });
    raw.once('error', reject);
  });
  if (first && first[0] === 0x1f && first[1] === 0x8b) input = raw.pipe(zlib.createGunzip());
  input.setEncoding('utf8');

  let buf = '';
  const chRe = /<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g;
  const prRe = /<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g;
  for await (const chunk of input) {
    buf += chunk;
    let last = 0, m;
    chRe.lastIndex = 0;
    while ((m = chRe.exec(buf))) {
      const names = [...m[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map((x) => unxml(x[1]));
      channels.set(m[1], names);
      last = Math.max(last, chRe.lastIndex);
    }
    prRe.lastIndex = 0;
    while ((m = prRe.exec(buf))) {
      last = Math.max(last, prRe.lastIndex);
      const a = m[1];
      const ch = /channel="([^"]*)"/.exec(a)?.[1];
      const s = parseTime(/start="([^"]*)"/.exec(a)?.[1]);
      const e = parseTime(/stop="([^"]*)"/.exec(a)?.[1]);
      if (!ch || !s || !e || e < FROM || s > TO) continue;
      const title = unxml(/<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2])?.[1] || '');
      if (!title) continue;
      if (!progs.has(ch)) progs.set(ch, []);
      progs.get(ch).push([Math.round(s / 60e3), Math.round(e / 60e3), title.slice(0, 90)]);
    }
    buf = buf.slice(last);
    if (buf.length > 5e6) buf = buf.slice(-1e6);
  }
  return { channels, progs };
}

async function main() {
  const data = JSON.parse(fs.readFileSync('data/channels.json', 'utf8'));
  let api = [];
  try {
    const r = await fetch('https://iptv-org.github.io/api/channels.json', { signal: AbortSignal.timeout(60e3) });
    api = await r.json();
  } catch (e) { console.log('api fail', e.message); }
  const apiById = new Map(api.map((a) => [a.id, a]));

  for (const lang of ['ru', 'w']) {
    const ours = data.channels.filter((c) => (lang === 'w' ? c.w : !c.w));
    // все варианты названия канала
    const want = ours.map((c) => {
      const names = new Set([c.n]);
      for (const id of c.i || []) {
        const a = apiById.get(String(id).split('@')[0]);
        if (a) { names.add(a.name); (a.alt_names || []).forEach((x) => names.add(x)); }
      }
      return { key: (c.w ? 'w:' : '') + cleanKey(c.n), norms: [...names].map(norm).filter((x) => x.length > 1) };
    });

    const out = {};
    for (const url of EPG[lang]) {
      let epg;
      try { epg = await readEpg(url); } catch (e) { console.log('epg fail', url, e.message); continue; }
      const byName = new Map();
      for (const [id, names] of epg.channels) {
        if (!epg.progs.has(id)) continue;
        for (const n of names) { const k = norm(n); if (k && !byName.has(k)) byName.set(k, id); }
      }
      let hit = 0;
      for (const w of want) {
        if (out[w.key]) continue;
        const id = w.norms.map((n) => byName.get(n)).find(Boolean);
        if (!id) continue;
        out[w.key] = epg.progs.get(id).sort((a, b) => a[0] - b[0]);
        hit++;
      }
      console.log(lang, url, 'epg channels', epg.channels.size, 'matched', hit);
    }
    console.log(lang, 'total with epg', Object.keys(out).length, 'of', want.length);
    fs.writeFileSync(`data/epg_${lang}.json`, JSON.stringify({ updated: new Date(NOW).toISOString(), p: out }));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
