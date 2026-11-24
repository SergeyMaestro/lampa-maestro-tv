/*!
 * Maestro TV v3 — IPTV и радио для Lampa
 * Каналы и радио проверяются роботом каждые 6 часов (GitHub Actions), в плагин попадают только живые.
 * Телепрограмма, поиск, умная сортировка, PIN на 18+, живое превью.
 * ES5 для старых WebOS.
 */
(function () {
    'use strict';

    if (window.maestro_tv_loaded) return;
    window.maestro_tv_loaded = true;

    var VERSION = '3.0.0';
    var PLUGIN = 'maestro_tv';
    var REPO = 'SergeyMaestro/lampa-maestro-tv';
    var BASES = [
        'https://raw.githubusercontent.com/' + REPO + '/main/data/',
        'https://cdn.jsdelivr.net/gh/' + REPO + '@main/data/'
    ];
    var TTL = 60 * 60 * 1000;
    var PIN_HASH_DEFAULT = 2088298495;
    var PAGE = 40;

    // Категории. Сначала ищем по названию канала (бренды), потом по group-title плейлиста.
    // Порядок важен: первое совпадение побеждает.
    var CATEGORIES = [
        { id: 'adult', title: '18+', icon: '🔞',
          words: ['xxx', 'adult', '18+', 'playboy', 'brazzers', 'hustler', 'erotic', 'эрот', 'redlight', 'dorcel', 'penthouse', 'vivid', 'русская ночь', 'шалун'],
          groups: ['xxx', 'adult'] },
        { id: 'kids', title: 'Мультики', icon: '🧸',
          words: ['мульт', 'cartoon', 'disney', 'nickelodeon', 'nick jr', 'карусель', 'детск', 'boomerang', 'jim jam', 'gulli', 'тлум', 'смайлик', 'уникум', 'рыжий', 'baby', 'kids', 'малыш', 'mult', 'detsk', 'detskiy'],
          groups: ['kids', 'animation'] },
        { id: 'travel', title: 'Путешествия', icon: '✈️',
          words: ['travel', 'путешеств', 'поехали', 'моя планета', 'viasat explore', 'охота', 'рыбал', 'fishing', 'hunting', 'outdoor', 'кухня', 'food network', 'puteshestv', 'rybalk', 'okhot', 'ohot', 'kuhnya'],
          groups: ['travel', 'outdoor', 'cooking'] },
        { id: 'docs', title: 'Познавательное', icon: '🌍',
          words: ['discovery', 'national geographic', 'nat geo', 'natgeo', 'viasat history', 'viasat nature', 'animal planet', 'history', 'наука', 'истори', 'живая планета', 'знание', 'докум', 'дикая', 'загородн', 'investigation', 'космос', 'теледом', 'кто есть кто', '365 дней', 'бобёр', 'бобер', 'культура', 'планета', 'nauka', 'istoriya', 'dokument', 'zoo'],
          groups: ['documentary', 'education', 'science', 'culture'] },
        { id: 'movies', title: 'Кино и сериалы', icon: '🎬',
          words: ['кино', 'фильм', 'сериал', 'amedia', 'tv1000', 'tv 1000', 'cinema', 'movie', 'hollywood', 'иллюзион', 'мосфильм', 'paramount', 'hbo', 'axn', 'остросюжет', 'детектив', 'комедия', 'страшное', 'индийское', 'film', 'kino', 'serial'],
          groups: ['movies', 'series', 'classic'] },
        { id: 'music', title: 'Музыка', icon: '🎵',
          words: ['music', 'муз', 'mtv', 'ru.tv', 'rutv', 'vh1', 'bridge', 'europa plus', 'шансон', 'жара', 'radio', 'радио', 'clubbing', 'dance', 'rock', 'jazz', 'песн', 'ля-минор', 'muzyka', 'muz-tv', 'muz tv'],
          groups: ['music'] },
        { id: 'sport', title: 'Спорт', icon: '⚽',
          words: ['sport', 'спорт', 'матч', 'eurosport', 'футбол', 'football', 'хоккей', 'hockey', 'бокс', 'fight', 'ufc', 'кхл', 'khl', 'qazsport', 'setanta', 'match!', 'futbol'],
          groups: ['sports', 'sport'] },
        { id: 'news', title: 'Новости', icon: '📰',
          words: ['news', 'новост', 'рбк', 'rbc', 'euronews', 'известия', 'вести', 'хабар 24', 'дума', 'novosti'],
          groups: ['news', 'legislative', 'business', 'weather'] },
        { id: 'fun', title: 'Развлекательное', icon: '🎉',
          words: ['тнт', 'стс', 'пятница', 'домашний', 'перец', 'суббота', 'рен тв', 'нтв', 'первый', 'россия', 'тв-3', 'тв3', 'звезда', 'хабар', 'qazaqstan', 'казахстан', 'кту', 'ктк', '31 канал', 'алматы', 'astana', 'астана', 'евразия', '2x2', 'юмор'],
          groups: ['entertainment', 'general', 'comedy', 'lifestyle', 'family', 'auto', 'relax'] },
        { id: 'other', title: 'Прочее', icon: '📺', words: [], groups: [] }
    ];

    function categorize(ch) {
        var name = (' ' + ch.name + ' ').toLowerCase();
        var groups = String(ch.group || '').toLowerCase().split(/[;,|\/]/).map(function (g) { return g.trim(); });
        var i, j, c;
        // 18+ проверяем первым и по имени, и по группе
        c = CATEGORIES[0];
        for (j = 0; j < c.words.length; j++) if (name.indexOf(c.words[j]) !== -1) return c.id;
        for (j = 0; j < groups.length; j++) if (c.groups.indexOf(groups[j]) !== -1) return c.id;
        // по названию
        for (i = 1; i < CATEGORIES.length; i++) {
            c = CATEGORIES[i];
            for (j = 0; j < c.words.length; j++) if (name.indexOf(c.words[j]) !== -1) return c.id;
        }
        // по группе плейлиста (в т.ч. русские названия групп)
        var gtext = groups.join(' ');
        for (i = 1; i < CATEGORIES.length; i++) {
            c = CATEGORIES[i];
            for (j = 0; j < groups.length; j++) if (c.groups.indexOf(groups[j]) !== -1) return c.id;
            for (j = 0; j < c.words.length; j++) if (gtext && gtext.indexOf(c.words[j]) !== -1) return c.id;
        }
        return 'other';
    }

    var WORLD = [
        { id: 'w_news', title: 'Новости', icon: '📰' },
        { id: 'w_docs', title: 'Познавательное', icon: '🌍' },
        { id: 'w_movies', title: 'Кино и сериалы', icon: '🎬' },
        { id: 'w_sport', title: 'Спорт', icon: '⚽' },
        { id: 'w_music', title: 'Музыка', icon: '🎵' },
        { id: 'w_kids', title: 'Мультики', icon: '🧸' },
        { id: 'w_fun', title: 'Разное', icon: '🎉' }
    ];
    var RADIO = [
        { id: 'r_ru', title: 'Русские станции', icon: '📻' },
        { id: 'r_pop', title: 'Хиты и поп', icon: '🎤' },
        { id: 'r_rock', title: 'Рок', icon: '🎸' },
        { id: 'r_dance', title: 'Танцевальная', icon: '🪩' },
        { id: 'r_retro', title: 'Ретро', icon: '📼' },
        { id: 'r_jazz', title: 'Джаз и лаунж', icon: '🎷' },
        { id: 'r_chanson', title: 'Шансон', icon: '🎙' },
        { id: 'r_classic', title: 'Классика', icon: '🎻' },
        { id: 'r_talk', title: 'Новости и разговор', icon: '🗞' }
    ];

    var STATE = { data: null, time: 0, radio: null, unlocked: false, query: '' };
    var EPG = { ru: null, w: null, wait: {} };

    // ---------- утилиты ----------

    function field(name, def) {
        try {
            var v = Lampa.Storage.field(name);
            return v === undefined || v === null || v === '' ? def : v;
        } catch (e) { return def; }
    }
    function getJSON(key, def) {
        try { var v = Lampa.Storage.get(key, ''); if (!v) return def; return typeof v === 'string' ? JSON.parse(v) : v; }
        catch (e) { return def; }
    }
    function setJSON(key, v) { try { Lampa.Storage.set(key, v); } catch (e) {} }
    function noty(t) { try { Lampa.Noty.show(t); } catch (e) {} }
    function esc(s) {
        return String(s || '').replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function attr(line, name) {
        var m = line.match(new RegExp(name + '="([^"]*)"', 'i'));
        return m ? m[1] : '';
    }
    function cleanName(raw) {
        return String(raw || '').replace(/\[[^\]]*\]/g, '').replace(/\((\d{3,4}[pi]|4k|uhd|hd|sd)\)/ig, '').replace(/\s+/g, ' ').trim();
    }
    function cleanKey(name) {
        return String(name || '').toLowerCase().replace(/\((russia|россия|kazakhstan|cis|international)\)/g, '')
            .replace(/\b(hd|fhd|uhd|4k|sd|tv|тв)\b/g, '').replace(/[^a-zа-яё0-9+]/g, '');
    }
    function isHD(raw) { return /(720p|1080p|2160p|4k|uhd|\bhd\b|full ?hd)/i.test(raw); }
    function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
    function ago(iso) {
        var d = Date.now() - new Date(iso).getTime();
        if (!(d > 0)) return '';
        var h = Math.floor(d / 3600000);
        return h < 1 ? 'только что' : h + ' ч назад';
    }
    function hhmm(min) {
        var d = new Date(min * 60000);
        return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }

    function parseM3U(text) {
        var lines = String(text || '').split(/\r?\n/), out = [], cur = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            if (line.indexOf('#EXTINF') === 0) {
                var idx = line.lastIndexOf(',');
                cur = {
                    raw: (idx !== -1 ? line.substr(idx + 1).trim() : '') || attr(line, 'tvg-name'),
                    logo: attr(line, 'tvg-logo'), group: attr(line, 'group-title'), id: attr(line, 'tvg-id'),
                    needsHeaders: /http-referrer|http-user-agent/i.test(line)
                };
            } else if (line.indexOf('#EXTVLCOPT') === 0 && cur) {
                if (/http-referrer|http-user-agent/i.test(line)) cur.needsHeaders = true;
            } else if (line.indexOf('#EXTGRP:') === 0 && cur) {
                cur.group = cur.group || line.substr(8).trim();
            } else if (line.charAt(0) !== '#' && cur) {
                out.push({ name: cleanName(cur.raw) || 'Без названия', hd: isHD(cur.raw), logo: cur.logo,
                    group: cur.group, id: cur.id, url: line, needsHeaders: cur.needsHeaders });
                cur = null;
            }
        }
        return out;
    }

    function request(url, ok, fail, timeout) {
        var xhr = new XMLHttpRequest(), done = false;
        xhr.open('GET', url, true);
        xhr.timeout = timeout || 30000;
        xhr.onload = function () {
            if (done) return; done = true;
            if (xhr.status >= 200 && xhr.status < 300) ok(xhr.responseText, xhr.status);
            else fail(xhr.status);
        };
        xhr.onerror = function () { if (!done) { done = true; fail(0); } };
        xhr.ontimeout = function () { if (!done) { done = true; fail(-1); } };
        xhr.send();
    }

    // Узнаём только код ответа, тело не качаем (иначе бесконечный поток висел бы до таймаута)
    function probe(url, cb) {
        var xhr = new XMLHttpRequest(), done = false;
        function finish(code) { if (done) return; done = true; try { xhr.abort(); } catch (e) {} cb(code); }
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () { if (xhr.readyState >= 2) finish(xhr.status); };
        xhr.onerror = function () { finish(0); };
        setTimeout(function () { finish(-1); }, 6000);
        xhr.send();
    }

    function loadFile(name, ok, fail) {
        var bust = '?t=' + Math.floor(Date.now() / 600000), i = 0;
        (function next() {
            if (i >= BASES.length) return fail();
            request(BASES[i++] + name + bust, function (text) {
                var json;
                try { json = JSON.parse(text); } catch (e) { return next(); }
                ok(json);
            }, next);
        })();
    }

    // ---------- данные ----------

    function fromJSON(json) {
        return json.channels.map(function (c) {
            return { name: c.n, logo: c.l, cat: c.c, hd: !!c.hd, status: c.s, urls: c.u, world: !!c.w, key: (c.w ? 'w:' : '') + cleanKey(c.n) };
        });
    }

    function loadData(ok, fail, force) {
        if (!force && STATE.data && Date.now() - STATE.time < TTL) return ok(STATE.data);
        loadFile('channels.json', function (json) {
            var list = fromJSON(json);
            loadUser(function (extra) {
                STATE.data = { updated: json.updated, stats: json.stats, list: merge(list, extra) };
                STATE.time = Date.now();
                loadFile('radio.json', function (r) { STATE.radio = r.cats; ok(STATE.data); }, function () { STATE.radio = {}; ok(STATE.data); });
            });
        }, function () { fail('Не удалось получить список каналов'); });
    }

    function loadEpg(lang, cb) {
        if (EPG[lang]) return cb();
        if (EPG.wait[lang]) { EPG.wait[lang].push(cb); return; }
        EPG.wait[lang] = [cb];
        loadFile('epg_' + lang + '.json', function (j) { EPG[lang] = j.p || {}; flush(); }, function () { EPG[lang] = {}; flush(); });
        function flush() { var w = EPG.wait[lang]; EPG.wait[lang] = null; w.forEach(function (f) { f(); }); }
    }

    function nowNext(c) {
        if (c.radio) return null;
        var p = (c.world ? EPG.w : EPG.ru) || {}, list = p[c.key];
        if (!list) return null;
        var m = Date.now() / 60000;
        for (var i = 0; i < list.length; i++) {
            if (list[i][0] <= m && list[i][1] > m) return { now: list[i], next: list[i + 1] };
        }
        return null;
    }

    function loadUser(done) {
        var urls = String(field('mtv_playlists', '') || '').split(/[\s,;]+/).filter(function (u) { return /^https?:\/\//i.test(u); });
        if (!urls.length) return done([]);
        var left = urls.length, out = [];
        urls.forEach(function (u) {
            request(u, function (text) {
                parseM3U(text).forEach(function (ch) {
                    if (ch.needsHeaders) return;
                    out.push({ name: ch.name, logo: ch.logo, cat: categorize(ch), hd: ch.hd, status: 'user', urls: [ch.url], key: cleanKey(ch.name) });
                });
                if (--left === 0) done(out);
            }, function () {
                noty('Плейлист не открылся: ' + u);
                if (--left === 0) done(out);
            });
        });
    }

    function merge(list, extra) {
        var map = {};
        list.forEach(function (c) { map[c.key] = c; });
        extra.forEach(function (c) {
            var m = map[c.key];
            if (m) { if (m.urls.indexOf(c.urls[0]) === -1) m.urls.push(c.urls[0]); }
            else { map[c.key] = c; list.push(c); }
        });
        return list;
    }

    function radioList(id) {
        var src = (STATE.radio || {})[id] || [];
        return src.map(function (s) {
            return { name: s.n, logo: s.l, urls: [s.u], key: 'r:' + s.k, radio: true, tags: s.t, br: s.b, status: 'ok' };
        });
    }

    function visible(list) {
        var adult = field('mtv_adult', true), hdOnly = field('mtv_hd_only', false), geo = field('mtv_geo', false), world = field('mtv_world', true);
        var hidden = getJSON('mtv_hidden', []);
        var bad = getJSON('mtv_bad', {});
        return list.filter(function (c) {
            if (!adult && c.cat === 'adult') return false;
            if (!world && c.world) return false;
            if (hdOnly && !c.hd) return false;
            if (!geo && c.status === 'geo') return false;
            if (hidden.indexOf(c.key) !== -1) return false;
            if (bad[c.key] && bad[c.key] >= c.urls.length && Date.now() - (bad[c.key + '_t'] || 0) < 12 * 3600000) return false;
            return true;
        });
    }

    // живые выше, потом то, что ты чаще смотришь, потом HD
    function sortList(list) {
        var rank = { ok: 0, user: 1, geo: 2 };
        var stats = getJSON('mtv_stats', {});
        return list.slice().sort(function (a, b) {
            return (rank[a.status] || 0) - (rank[b.status] || 0) ||
                ((stats[b.key] || 0) - (stats[a.key] || 0)) ||
                (b.hd - a.hd) || a.name.localeCompare(b.name, 'ru');
        });
    }

    // ---------- избранное, недавние, скрытые, статистика ----------

    function slim(c) { return { name: c.name, logo: c.logo, cat: c.cat, hd: c.hd, status: c.status, urls: c.urls, world: c.world, radio: c.radio, tags: c.tags, br: c.br, key: c.key }; }
    function isFav(c) { return getJSON('mtv_fav2', []).some(function (f) { return f.key === c.key; }); }
    function toggleFav(c) {
        var fav = getJSON('mtv_fav2', []), had = isFav(c);
        fav = fav.filter(function (f) { return f.key !== c.key; });
        if (!had) fav.unshift(slim(c));
        setJSON('mtv_fav2', fav);
        noty(had ? 'Убрано из избранного' : '⭐ В избранном');
    }
    function pushRecent(c) {
        var rec = getJSON('mtv_recent2', []).filter(function (f) { return f.key !== c.key; });
        rec.unshift(slim(c));
        setJSON('mtv_recent2', rec.slice(0, 30));
        var stats = getJSON('mtv_stats', {});
        stats[c.key] = (stats[c.key] || 0) + 1;
        setJSON('mtv_stats', stats);
    }
    function hide(c) {
        var h = getJSON('mtv_hidden', []);
        if (h.indexOf(c.key) === -1) h.push(c.key);
        setJSON('mtv_hidden', h);
        noty('Скрыто. Вернуть: Настройки → Maestro TV');
    }

    // ---------- PIN ----------

    function askPin(ok) {
        Lampa.Input.edit({ title: 'PIN-код', value: '', free: true, nosave: true }, function (v) {
            var saved = parseInt(Lampa.Storage.get('mtv_pin_hash', ''), 10) || PIN_HASH_DEFAULT;
            if (hash(String(v || '').trim()) === saved) { STATE.unlocked = true; ok(); }
            else { noty('Неверный PIN'); Lampa.Controller.toggle('content'); }
        });
    }

    // ---------- плеер ----------

    function pickUrl(c, done) {
        if (c.radio) return done(c.urls[0], 0);
        var i = 0;
        (function next() {
            if (i >= c.urls.length) return done(null);
            var url = c.urls[i++];
            probe(url, function (code) {
                // 0 / -1: ответ не прочитать (CORS) или долго думает — пусть решает плеер
                if (code <= 0 || (code >= 200 && code < 400)) done(url, i - 1);
                else next();
            });
        })();
    }

    function markBad(c, count) {
        var bad = getJSON('mtv_bad', {});
        bad[c.key] = count; bad[c.key + '_t'] = Date.now();
        setJSON('mtv_bad', bad);
    }

    function play(c, list) {
        Lampa.Loading.start(function () { Lampa.Loading.stop(); });
        pickUrl(c, function (url, idx) {
            Lampa.Loading.stop();
            if (!url) {
                markBad(c, c.urls.length);
                noty('Канал сейчас не вещает (проверено зеркал: ' + c.urls.length + ')');
                return;
            }
            pushRecent(c);
            var nn = nowNext(c);
            var title = c.name + (nn ? ' · ' + nn.now[2] : '') + (idx > 0 ? ' · зеркало ' + (idx + 1) : '');
            var playlist = (list || [c]).map(function (x) { return { title: x.name, url: x === c ? url : x.urls[0] }; });
            Lampa.Player.play({ title: title, url: url });
            if (playlist.length > 1) Lampa.Player.playlist(playlist);
        });
    }

    // ---------- стили ----------

    function addStyles() {
        if (document.getElementById('mtv-style')) return;
        var css =
            '.mtv{display:flex;height:100%;box-sizing:border-box;padding:0 1.5em 0 1em}' +
            '.mtv-side{width:19em;flex-shrink:0;overflow:hidden;position:relative;padding:1em .5em 2em 0}' +
            '.mtv-main{flex:1;overflow:hidden;position:relative;padding:1em 0 2em 1.2em}' +
            '.mtv-side__in,.mtv-main__in{position:relative;transition:transform .18s ease-out}' +
            '.mtv-cat{display:flex;align-items:center;padding:.7em 1em;margin-bottom:.3em;border-radius:1em}' +
            '.mtv-cat__ico{width:1.8em;font-size:1.15em}' +
            '.mtv-cat__name{flex:1;font-size:1.08em}' +
            '.mtv-cat__cnt{opacity:.45;font-size:.9em}' +
            '.mtv-cat.active{background:rgba(255,255,255,.08)}' +
            '.mtv-cat.focus{background:#fff;color:#111}' +
            '.mtv-cat.focus .mtv-cat__cnt{opacity:.6}' +
            '.mtv-sep{opacity:.5;font-size:.82em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:1.3em 1em .5em}' +
            '.mtv-head{display:flex;align-items:baseline;margin:0 0 1em .2em}' +
            '.mtv-head__title{font-size:1.9em;font-weight:700;letter-spacing:-.01em}' +
            '.mtv-head__info{margin-left:1em;opacity:.45}' +
            '.mtv-row{display:flex;align-items:center;padding:.55em .8em;margin-bottom:.4em;border-radius:1.1em;background:rgba(255,255,255,.035);transition:background .12s,transform .12s}' +
            '.mtv-row__logo{width:5.2em;height:3.2em;flex-shrink:0;border-radius:.7em;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-right:1em}' +
            '.mtv-row__logo img{max-width:82%;max-height:78%;object-fit:contain}' +
            '.mtv-row__letter{font-size:1.5em;font-weight:700;opacity:.35}' +
            '.mtv-row__info{flex:1;min-width:0}' +
            '.mtv-row__name{font-size:1.15em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mtv-row__epg{font-size:.85em;opacity:.6;margin-top:.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mtv-row__bar{height:.22em;border-radius:.2em;background:rgba(255,255,255,.12);margin-top:.35em;max-width:22em;overflow:hidden}' +
            '.mtv-row__bar div{height:100%;background:linear-gradient(90deg,#7c5cff,#2fb6ff)}' +
            '.mtv-row__next{font-size:.78em;opacity:.4;margin-top:.25em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mtv-row__tags{display:flex;align-items:center;margin-left:.8em}' +
            '.mtv-tag{font-size:.7em;font-weight:700;padding:.2em .5em;border-radius:.45em;margin-left:.5em;background:rgba(255,255,255,.12);white-space:nowrap}' +
            '.mtv-tag--hd{background:linear-gradient(135deg,#7c5cff,#2fb6ff);color:#fff}' +
            '.mtv-dot{width:.6em;height:.6em;border-radius:50%;margin-left:.8em;background:#3ddc84}' +
            '.mtv-dot--geo{background:#ffb020}.mtv-dot--user{background:#8a8a8a}' +
            '.mtv-row.focus{background:#fff;color:#111;transform:scale(1.012)}' +
            '.mtv-row.focus .mtv-tag{background:rgba(0,0,0,.1)}' +
            '.mtv-row.focus .mtv-tag--hd{background:linear-gradient(135deg,#7c5cff,#2fb6ff);color:#fff}' +
            '.mtv-row.focus .mtv-row__bar{background:rgba(0,0,0,.12)}' +
            '.mtv-lock{padding:2em 1.5em;border-radius:1.2em;background:rgba(255,255,255,.05);font-size:1.15em;text-align:center}' +
            '.mtv-lock.focus{background:#fff;color:#111}' +
            '.mtv-empty{opacity:.5;padding:2em .3em;font-size:1.1em}' +
            '.mtv-foot{opacity:.35;font-size:.85em;padding:1em .3em}' +
            '.mtv-prev{position:absolute;right:1.5em;bottom:1.5em;width:24em;height:13.5em;border-radius:1em;overflow:hidden;background:#000;box-shadow:0 1em 3em rgba(0,0,0,.6);z-index:5;display:none}' +
            '.mtv-prev video{width:100%;height:100%;object-fit:cover}' +
            '.mtv-prev__name{position:absolute;left:0;right:0;bottom:0;padding:.6em .9em;font-size:.85em;background:linear-gradient(transparent,rgba(0,0,0,.8))}';
        var st = document.createElement('style');
        st.id = 'mtv-style'; st.textContent = css;
        document.head.appendChild(st);
    }

    // ---------- экран ----------

    function Component(object) {
        var self = this;
        var html = $('<div class="mtv"></div>');
        var side = $('<div class="mtv-side"><div class="mtv-side__in"></div></div>');
        var main = $('<div class="mtv-main"><div class="mtv-main__in"></div></div>');
        var prev = $('<div class="mtv-prev"><video muted playsinline></video><div class="mtv-prev__name"></div></div>');
        var sideIn = side.find('.mtv-side__in'), mainIn = main.find('.mtv-main__in');
        var data = null, cats = [], current = null, currentCat = null, currentEl = null, lastRow = null, zone = 'side';
        var rows = [], rowRefs = [], curList = [], shown = 0;
        var switchTimer = null, prevTimer = null, epgTimer = null;

        html.append(side).append(main).append(prev);

        function follow(box, inner, el) {
            var boxH = box[0].clientHeight, top = el[0].offsetTop, h = el[0].offsetHeight;
            var innerH = inner[0].scrollHeight;
            var y = Math.max(0, Math.min(top - boxH / 2 + h / 2, innerH - boxH + 40));
            inner.css('transform', 'translate3d(0,' + (-y) + 'px,0)');
        }

        // ---- превью ----
        function hidePreview() {
            clearTimeout(prevTimer);
            var v = prev.find('video')[0];
            if (v && v.getAttribute('src')) { try { v.pause(); } catch (e) {} v.removeAttribute('src'); try { v.load(); } catch (e) {} }
            prev.hide();
        }
        function schedulePreview(ch) {
            clearTimeout(prevTimer);
            if (!field('mtv_preview', false) || ch.radio) { hidePreview(); return; }
            prevTimer = setTimeout(function () {
                var v = prev.find('video')[0];
                prev.find('.mtv-prev__name').text(ch.name);
                v.src = ch.urls[0];
                prev.show();
                try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
            }, 1200);
        }

        // ---- телепрограмма ----
        function epgHtml(ch) {
            var nn = nowNext(ch);
            if (ch.radio) return '<div class="mtv-row__epg">' + esc(ch.tags || '') + (ch.br ? ' · ' + ch.br + ' kbps' : '') + '</div>';
            if (!nn) return '';
            var m = Date.now() / 60000, p = nn.now;
            var pct = Math.max(0, Math.min(100, (m - p[0]) / (p[1] - p[0]) * 100));
            return '<div class="mtv-row__epg">' + hhmm(p[0]) + ' · ' + esc(p[2]) + '</div>' +
                '<div class="mtv-row__bar"><div style="width:' + pct.toFixed(1) + '%"></div></div>' +
                (nn.next ? '<div class="mtv-row__next">Далее ' + hhmm(nn.next[0]) + ' · ' + esc(nn.next[2]) + '</div>' : '');
        }
        function refreshEpg() {
            rowRefs.forEach(function (r) { r.box.html(epgHtml(r.ch)); });
        }

        this.create = function () {
            this.activity.loader(true);
            loadData(function (d) {
                data = d;
                self.build();
                loadEpg('ru', refreshEpg);
            }, function (err) {
                var empty = new Lampa.Empty({ descr: err });
                html.empty().append(empty.render());
                self.start = empty.start;
                self.activity.loader(false);
                self.activity.toggle();
            }, object.force);
            epgTimer = setInterval(refreshEpg, 60000);
            return this.render();
        };

        this.channelsFor = function (id) {
            if (id === 'fav') return getJSON('mtv_fav2', []);
            if (id === 'recent') return getJSON('mtv_recent2', []);
            if (id === 'search') return this.searchList(STATE.query);
            if (id.indexOf('r_') === 0) return radioList(id);
            var vis = visible(data.list);
            return sortList(id === 'all' ? vis.filter(function (c) { return !c.world; }) : vis.filter(function (c) { return c.cat === id; }));
        };

        this.searchList = function (q) {
            q = String(q || '').toLowerCase().trim();
            if (!q) return [];
            var res = visible(data.list).filter(function (c) {
                if (c.cat === 'adult') return false;
                if (c.name.toLowerCase().indexOf(q) !== -1) return true;
                var nn = nowNext(c);
                return nn && nn.now[2].toLowerCase().indexOf(q) !== -1;
            });
            var seen = {};
            RADIO.forEach(function (r) {
                radioList(r.id).forEach(function (s) {
                    if (!seen[s.key] && s.name.toLowerCase().indexOf(q) !== -1) { seen[s.key] = 1; res.push(s); }
                });
            });
            return sortList(res).slice(0, 300);
        };

        this.countFor = function (id) {
            if (id === 'search') return '';
            return this.channelsFor(id).length;
        };

        this.build = function () {
            cats = [];
            cats.push({ id: 'search', title: 'Поиск', icon: '🔍' });
            cats.push({ id: 'fav', title: 'Избранное', icon: '⭐' });
            cats.push({ id: 'recent', title: 'Недавние', icon: '🕘' });
            CATEGORIES.forEach(function (c) { cats.push({ id: c.id, title: c.title, icon: c.icon }); });
            cats.push({ id: 'all', title: 'Все каналы', icon: '📡' });
            cats.push({ sep: '🌐 Зарубежные · English' });
            WORLD.forEach(function (c) { cats.push({ id: c.id, title: c.title, icon: c.icon, world: true }); });
            cats.push({ sep: '📻 Радио' });
            RADIO.forEach(function (c) { cats.push({ id: c.id, title: c.title, icon: c.icon }); });

            var saved = Lampa.Storage.get('mtv_last_cat', 'docs');
            var first = null, pendingSep = null;

            cats.forEach(function (c) {
                if (c.sep) { pendingSep = c.sep; return; }
                var n = self.countFor(c.id);
                if (n === 0 && c.id !== 'fav') return;
                if (pendingSep) { sideIn.append('<div class="mtv-sep">' + esc(pendingSep) + '</div>'); pendingSep = null; }
                var el = $('<div class="mtv-cat selector"><div class="mtv-cat__ico">' + c.icon + '</div>' +
                    '<div class="mtv-cat__name">' + esc(c.title) + '</div><div class="mtv-cat__cnt">' + (c.id === 'adult' ? '🔒' : n) + '</div></div>');
                el.on('hover:focus', function () {
                    zone = 'side';
                    hidePreview();
                    follow(side, sideIn, el);
                    clearTimeout(switchTimer);
                    if (c.id === 'search') return;
                    switchTimer = setTimeout(function () { self.showCat(c, el); }, 220);
                });
                el.on('hover:enter', function () {
                    clearTimeout(switchTimer);
                    if (c.id === 'search') return self.search(c, el);
                    self.showCat(c, el);
                    self.focusList();
                });
                c.el = el;
                sideIn.append(el);
                if (c.id !== 'search' && (!first || c.id === saved)) first = c;
            });

            var st = data.stats || {};
            sideIn.append('<div class="mtv-foot">Проверено ' + esc(ago(data.updated)) + '<br>Живых потоков: ' + (st.ok || 0) + '<br>v' + VERSION + '</div>');

            if (first) this.showCat(first, first.el);
            this.activity.loader(false);
            this.activity.toggle();

            if (field('mtv_autostart', false) && !object.noauto) {
                var last = getJSON('mtv_recent2', [])[0];
                if (last && last.cat !== 'adult') setTimeout(function () { play(last, [last]); }, 400);
            }
        };

        this.search = function (c, el) {
            Lampa.Input.edit({ title: 'Название канала, станции или передачи', value: STATE.query || '', free: true, nosave: true }, function (v) {
                STATE.query = String(v || '').trim();
                current = null;
                if (STATE.query) {
                    c.title = 'Поиск: ' + STATE.query;
                    el.find('.mtv-cat__name').text('Поиск: ' + STATE.query);
                    loadEpg('w', function () {});
                    self.showCat(c, el);
                    Lampa.Controller.toggle('content');
                    self.focusList();
                } else {
                    Lampa.Controller.toggle('content');
                }
            });
        };

        this.showCat = function (c, el) {
            if (current === c.id && rows.length) return;
            current = c.id;
            currentCat = c;
            currentEl = el;
            hidePreview();
            sideIn.find('.mtv-cat').removeClass('active');
            el.addClass('active');
            if (c.id !== 'search') Lampa.Storage.set('mtv_last_cat', c.id);
            if (c.world) loadEpg('w', refreshEpg);

            mainIn.empty().css('transform', 'translate3d(0,0,0)');
            rows = []; rowRefs = []; lastRow = null;

            if (c.id === 'adult' && !STATE.unlocked) {
                mainIn.append('<div class="mtv-head"><div class="mtv-head__title">18+</div></div>');
                var lock = $('<div class="mtv-lock selector">🔒 Раздел под PIN-кодом. Нажми OK, чтобы ввести</div>');
                lock.on('hover:focus', function () { zone = 'main'; lastRow = lock[0]; });
                lock.on('hover:enter', function () {
                    askPin(function () {
                        current = null;
                        self.showCat(c, el);
                        Lampa.Controller.toggle('content');
                        self.focusList();
                    });
                });
                rows.push(lock[0]);
                mainIn.append(lock);
                this.recollect();
                return;
            }

            var list = this.channelsFor(c.id);
            var isRadio = c.id.indexOf('r_') === 0;
            mainIn.append('<div class="mtv-head"><div class="mtv-head__title">' + esc(c.title) + '</div>' +
                '<div class="mtv-head__info">' + list.length + (isRadio ? ' станций' : ' кан.') + ' · OK — включить · долгое OK — меню</div></div>');

            if (!list.length) {
                mainIn.append('<div class="mtv-empty">' + (c.id === 'fav' ? 'Долгое нажатие OK на канале → «В избранное»' : 'Ничего не найдено') + '</div>');
            }

            shown = 0;
            curList = list;
            this.addRows();
            this.recollect();
        };

        this.recollect = function () {
            if (Lampa.Activity.active() && Lampa.Activity.active().activity === this.activity) {
                Lampa.Controller.collectionSet(html);
            }
        };

        this.addRows = function () {
            var list = curList, end = Math.min(shown + PAGE, list.length);
            list.slice(shown, end).forEach(function (ch, j) {
                var index = shown + j;
                var letter = esc((ch.name || '?').charAt(0).toUpperCase());
                var row = $('<div class="mtv-row selector">' +
                    '<div class="mtv-row__logo">' + (ch.logo ? '<img src="' + esc(ch.logo) + '">' : '<div class="mtv-row__letter">' + letter + '</div>') + '</div>' +
                    '<div class="mtv-row__info"><div class="mtv-row__name">' + esc(ch.name) + '</div><div class="mtv-row__box"></div></div>' +
                    '<div class="mtv-row__tags">' +
                    (isFav(ch) ? '<span>⭐</span>' : '') +
                    (ch.urls && ch.urls.length > 1 ? '<div class="mtv-tag">' + ch.urls.length + ' зерк.</div>' : '') +
                    (ch.hd ? '<div class="mtv-tag mtv-tag--hd">HD</div>' : '') +
                    (ch.radio ? '' : '<div class="mtv-dot' + (ch.status === 'geo' ? ' mtv-dot--geo' : ch.status === 'user' ? ' mtv-dot--user' : '') + '"></div>') +
                    '</div></div>');
                var box = row.find('.mtv-row__box');
                box.html(epgHtml(ch));
                rowRefs.push({ ch: ch, box: box });
                row.find('img').on('error', function () { $(this).replaceWith('<div class="mtv-row__letter">' + letter + '</div>'); });
                row.on('hover:focus', function () {
                    zone = 'main'; lastRow = row[0]; follow(main, mainIn, row);
                    schedulePreview(ch);
                    if (index >= shown - 8 && shown < curList.length) {
                        self.addRows();
                        Lampa.Controller.collectionSet(html);
                        Lampa.Controller.collectionFocus(row[0], html);
                    }
                });
                row.on('hover:enter', function () { hidePreview(); play(ch, list); });
                row.on('hover:long', function () { hidePreview(); self.menu(ch); });
                rows.push(row[0]);
                mainIn.append(row);
            });
            shown = end;
        };

        this.menu = function (ch) {
            var fav = isFav(ch);
            Lampa.Select.show({
                title: ch.name,
                items: [
                    { title: fav ? 'Убрать из избранного' : 'В избранное', act: 'fav' },
                    { title: 'Скрыть', act: 'hide' }
                ],
                onSelect: function (a) {
                    if (a.act === 'fav') toggleFav(ch);
                    if (a.act === 'hide') hide(ch);
                    current = null;
                    if (currentCat) self.showCat(currentCat, currentEl);
                    Lampa.Controller.toggle('content');
                    self.focusList();
                },
                onBack: function () { Lampa.Controller.toggle('content'); }
            });
        };

        this.focusList = function () {
            var target = lastRow || rows[0];
            if (!target) return;
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(target, html);
        };

        this.focusSide = function () {
            if (!currentEl) return;
            hidePreview();
            Lampa.Controller.collectionSet(html);
            Lampa.Controller.collectionFocus(currentEl[0], html);
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html);
                    var target = zone === 'main' && lastRow ? lastRow : (currentEl ? currentEl[0] : false);
                    Lampa.Controller.collectionFocus(target, html);
                },
                left: function () {
                    if (zone === 'main') self.focusSide();
                    else Lampa.Controller.toggle('menu');
                },
                right: function () { if (zone === 'side') self.focusList(); },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { if (Navigator.canmove('down')) Navigator.move('down'); },
                back: function () {
                    if (zone === 'main') self.focusSide();
                    else Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () { hidePreview(); };
        this.stop = function () { hidePreview(); };
        this.render = function () { return html; };
        this.destroy = function () {
            clearTimeout(switchTimer); clearInterval(epgTimer); hidePreview();
            html.remove();
        };
    }

    // ---------- настройки ----------

    function addSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.SettingsApi.addComponent({
            component: PLUGIN, name: 'Maestro TV',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 2l4 3 4-3"/></svg>'
        });
        Lampa.SettingsApi.addParam({
            component: PLUGIN,
            param: { name: 'mtv_playlists', type: 'input', values: '', default: '', placeholder: 'https://.../playlist.m3u' },
            field: { name: 'Мои плейлисты (M3U)', description: 'Ссылки через запятую. Каналы с теми же названиями станут дополнительными зеркалами' },
            onChange: function () { STATE.data = null; }
        });
        [
            ['mtv_autostart', 'Включать последний канал при открытии', false, ''],
            ['mtv_preview', 'Живое превью при наведении', false, 'Маленькое окно с эфиром через секунду после наведения. На слабых ТВ может тормозить'],
            ['mtv_world', 'Зарубежные каналы (English)', true, ''],
            ['mtv_hd_only', 'Только HD', false, ''],
            ['mtv_geo', 'Показывать каналы с региональной блокировкой', false, 'Жёлтая точка: у робота поток закрыт по региону, у тебя может работать'],
            ['mtv_adult', 'Раздел 18+ (под PIN-кодом)', true, '']
        ].forEach(function (t) {
            Lampa.SettingsApi.addParam({
                component: PLUGIN,
                param: { name: t[0], type: 'trigger', default: t[2] },
                field: { name: t[1], description: t[3] },
                onChange: function () { STATE.data = null; }
            });
        });
        Lampa.SettingsApi.addParam({
            component: PLUGIN,
            param: { name: 'mtv_pin_change', type: 'button' },
            field: { name: 'Сменить PIN-код', description: 'Сначала спросит текущий' },
            onChange: function () {
                askPin(function () {
                    Lampa.Input.edit({ title: 'Новый PIN', value: '', free: true, nosave: true }, function (v) {
                        v = String(v || '').trim();
                        if (v.length < 4) return noty('PIN должен быть от 4 символов');
                        Lampa.Storage.set('mtv_pin_hash', String(hash(v)));
                        noty('PIN изменён');
                    });
                });
            }
        });
        Lampa.SettingsApi.addParam({
            component: PLUGIN,
            param: { name: 'mtv_reset_hidden', type: 'button' },
            field: { name: 'Вернуть скрытые каналы' },
            onChange: function () {
                setJSON('mtv_hidden', []); setJSON('mtv_bad', {});
                noty('Скрытые каналы возвращены');
            }
        });
    }

    // ---------- меню ----------

    function addMenu() {
        if ($('.menu [data-action="maestro_tv"]').length) return;
        var item = $('<li class="menu__item selector" data-action="maestro_tv">' +
            '<div class="menu__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 2l4 3 4-3"/></svg></div>' +
            '<div class="menu__text">ТВ и радио</div></li>');
        item.on('hover:enter', function () {
            Lampa.Activity.push({ url: '', title: 'ТВ и радио', component: PLUGIN, page: 1 });
        });
        $('.menu .menu__list').eq(0).append(item);
    }

    function start() {
        Lampa.Component.add(PLUGIN, Component);
        addStyles();
        addSettings();
        addMenu();
    }

    window.MaestroTV = { parseM3U: parseM3U, categorize: categorize, cleanKey: cleanKey, hash: hash, version: VERSION };

    if (typeof Lampa === 'undefined') return;
    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})();
