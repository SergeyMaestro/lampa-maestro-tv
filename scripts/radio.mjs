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
  const wList = world.filter(good).filter((s) => !seen.has(s.stationuuid) && seen.add(s.stationuuid));

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
