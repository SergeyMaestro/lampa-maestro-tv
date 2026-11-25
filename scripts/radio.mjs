// Радио для Maestro TV из открытой базы Radio Browser (radio-browser.info).
// Берём только станции, которые база отметила рабочими, и раскладываем по жанрам.
import fs from 'node:fs';

const MIRRORS = ['https://de1.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://de2.api.radio-browser.info'];
const UA = { 'User-Agent': 'MaestroTV/3.0 (github.com/SergeyMaestro/lampa-maestro-tv)' };

async function api(path) {
  for (const m of MIRRORS) {
    try {
      const r = await fetch(m + path, { headers: UA, signal: AbortSignal.timeout(60e3) });
      if (r.ok) return await r.json();
    } catch (e) { console.log('mirror fail', m, e.message); }
  }
  throw new Error('radio-browser недоступен');
}

const CATS = [
  { id: 'r_pop', words: ['pop', 'hits', 'top 40', 'хит', 'поп', 'top40', 'charts'] },
  { id: 'r_rock', words: ['rock', 'рок', 'metal', 'alternative', 'indie', 'punk'] },
  { id: 'r_dance', words: ['dance', 'electronic', 'house', 'techno', 'trance', 'edm', 'club', 'deep', 'drum and bass', 'dnb'] },
  { id: 'r_jazz', words: ['jazz', 'lounge', 'chillout', 'chill', 'smooth', 'blues', 'ambient', 'relax'] },
  { id: 'r_retro', words: ['retro', 'ретро', 'oldies', '80s', '70s', '60s', '90s', 'дискотека', 'disco', 'ностальг'] },
  { id: 'r_chanson', words: ['шансон', 'chanson', 'бард'], ruOnly: true },
  { id: 'r_classic', words: ['classical', 'classic music', 'классик', 'opera', 'orchestra', 'baroque', 'symphon'] },
  { id: 'r_talk', words: ['news', 'talk', 'новост', 'разговор', 'спорт', 'sport', 'information'] },
];
// Проверка станции: отвечает 200 и реально отдаёт аудио (или HLS-плейлист)
async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { headers: { ...UA, 'Icy-MetaData': '0' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) return false;
    const type = (r.headers.get('content-type') || '').toLowerCase();
    const reader = r.body && r.body.getReader();
    let bytes = 0, text = '';
    if (reader) {
      const start = Date.now();
      while (bytes < 8192 && Date.now() - start < 6000) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (text.length < 200) text += Buffer.from(value).toString('latin1');
      }
      reader.cancel().catch(() => {});
    }
    if (/mpegurl/.test(type) || text.startsWith('#EXTM3U')) return text.includes('#EXT');
    if (/text\/html/.test(type)) return false;
    return bytes >= 2048 && /audio|mpeg|ogg|aac|octet|application\/x-|video\/mp2t/.test(type || 'audio');
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const hostBusy = new Map();
async function checkAll(list, n) {
  let i = 0;
  const host = (u) => { try { return new URL(u).host; } catch { return u; } };
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < list.length) {
      const s = list[i++], h = host(s.url_resolved || s.url);
      while ((hostBusy.get(h) || 0) >= 4) await new Promise((r) => setTimeout(r, 50));
      hostBusy.set(h, (hostBusy.get(h) || 0) + 1);
      try { s.alive = await probe(s.url_resolved || s.url); } finally { hostBusy.set(h, hostBusy.get(h) - 1); }
    }
  }));
}

const OK_CODEC = /^(mp3|aac|aac\+|he-aac|mpeg|ogg|unknown)$/i;

function slim(s) {
  return { n: s.name.trim().slice(0, 70), u: s.url_resolved || s.url, l: s.favicon || '', t: String(s.tags || '').split(',').slice(0, 3).join(', '), b: s.bitrate || 0, k: s.stationuuid };
}

async function main() {
  const ru = await api('/json/stations/search?language=russian&hidebroken=true&order=clickcount&reverse=true&limit=800');
  const world = await api('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=2500');
  const good = (s) => s.lastcheckok === 1 && (s.url_resolved || s.url) && (OK_CODEC.test(s.codec || 'unknown') || s.hls === 1);

  const seen = new Set();
  const ruList = ru.filter(good).filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid));
  const wList0 = world.filter(good).filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid));
  const ruList0 = ruList.splice(0);

  await checkAll([...ruList0, ...wList0], 48);
  // страховка: если проверка сломалась и «живых» подозрительно мало, оставляем список как есть
  const aliveShare = [...ruList0, ...wList0].filter((s) => s.alive).length / Math.max(1, ruList0.length + wList0.length);
  const trust = aliveShare > 0.25;
  if (!trust) console.log('alive share too low, keeping unchecked list', aliveShare);
  ruList.push(...ruList0.filter((s) => !trust || s.alive));
  const wList = wList0.filter((s) => !trust || s.alive);
  console.log('radio alive: ru', ruList.length, 'of', ruList0.length, '| world', wList.length, 'of', wList0.length);

  const cats = { r_ru: ruList.slice(0, 200).map(slim) };
  for (const c of CATS) {
    const match = (s) => { const h = (s.tags + ' ' + s.name).toLowerCase(); return c.words.some((w) => h.includes(w)); };
    const fromRu = ruList.filter(match);
    const fromW = c.ruOnly ? [] : wList.filter(match);
    cats[c.id] = [...fromRu.slice(0, 60), ...fromW].slice(0, 150).map(slim);
  }
  for (const k in cats) console.log(k, cats[k].length);
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/radio.json', JSON.stringify({ updated: new Date().toISOString(), cats }));
}

main().catch((e) => { console.error(e); process.exit(1); });
