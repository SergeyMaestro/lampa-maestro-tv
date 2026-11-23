/*!
 * Maestro TV v2 — IPTV-плагин для Lampa
 * Каналы проверяются роботом каждые 6 часов (GitHub Actions), в плагин попадают только живые.
 * У каждого канала несколько зеркал: если одно не отвечает, плагин берёт следующее.
 * ES5 для старых WebOS.
 */
(function () {
    'use strict';

    if (window.maestro_tv_loaded) return;
    window.maestro_tv_loaded = true;

    var VERSION = '2.0.0';
    var PLUGIN = 'maestro_tv';
    var REPO = 'SergeyMaestro/lampa-maestro-tv';
    var DATA_URLS = [
        'https://raw.githubusercontent.com/' + REPO + '/main/data/channels.json',
        'https://cdn.jsdelivr.net/gh/' + REPO + '@main/data/channels.json'
    ];
    var TTL = 60 * 60 * 1000;

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

    var STATE = { data: null, time: 0 };

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
    function ago(iso) {
        var d = Date.now() - new Date(iso).getTime();
        if (!(d > 0)) return '';
        var h = Math.floor(d / 3600000);
        return h < 1 ? 'только что' : h + ' ч назад';
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
                    logo: attr(line, 'tvg-logo'), group: attr(line, 'group-title'),
                    needsHeaders: /http-referrer|http-user-agent/i.test(line)
                };
            } else if (line.indexOf('#EXTVLCOPT') === 0 && cur) {
                if (/http-referrer|http-user-agent/i.test(line)) cur.needsHeaders = true;
            } else if (line.indexOf('#EXTGRP:') === 0 && cur) {
                cur.group = cur.group || line.substr(8).trim();
            } else if (line.charAt(0) !== '#' && cur) {
                out.push({ name: cleanName(cur.raw) || 'Без названия', hd: isHD(cur.raw), logo: cur.logo,
                    group: cur.group, url: line, needsHeaders: cur.needsHeaders });
                cur = null;
            }
        }
        return out;
    }

    function request(url, ok, fail, timeout) {
        var xhr = new XMLHttpRequest(), done = false;
        xhr.open('GET', url, true);
        xhr.timeout = timeout || 20000;
        xhr.onload = function () {
            if (done) return; done = true;
            if (xhr.status >= 200 && xhr.status < 300) ok(xhr.responseText, xhr.status);
            else fail(xhr.status);
        };
        xhr.onerror = function () { if (!done) { done = true; fail(0); } };
        xhr.ontimeout = function () { if (!done) { done = true; fail(-1); } };
        xhr.send();
    }

    // ---------- данные ----------

    function fromJSON(json) {
        return json.channels.map(function (c) {
            return { name: c.n, logo: c.l, cat: c.c, hd: !!c.hd, status: c.s, urls: c.u, key: cleanKey(c.n) };
        });
    }

    function loadData(ok, fail, force) {
        if (!force && STATE.data && Date.now() - STATE.time < TTL) return ok(STATE.data);
        var bust = '?t=' + Math.floor(Date.now() / 600000);
        var i = 0;
        (function next() {
            if (i >= DATA_URLS.length) return fail('Не удалось получить список каналов');
            request(DATA_URLS[i++] + bust, function (text) {
                var json;
                try { json = JSON.parse(text); } catch (e) { return next(); }
                var list = fromJSON(json);
                loadUser(function (extra) {
                    STATE.data = { updated: json.updated, stats: json.stats, list: merge(list, extra) };
                    STATE.time = Date.now();
                    ok(STATE.data);
                });
            }, next);
        })();
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

    // свои плейлисты подмешиваем как дополнительные зеркала
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

    function visible(list) {
        var adult = field('mtv_adult', false), hdOnly = field('mtv_hd_only', false), geo = field('mtv_geo', false);
        var hidden = getJSON('mtv_hidden', []);
        var bad = getJSON('mtv_bad', {});
        return list.filter(function (c) {
            if (!adult && c.cat === 'adult') return false;
            if (hdOnly && !c.hd) return false;
            if (!geo && c.status === 'geo') return false;
            if (hidden.indexOf(c.key) !== -1) return false;
            if (bad[c.key] && bad[c.key] >= c.urls.length && Date.now() - (bad[c.key + '_t'] || 0) < 12 * 3600000) return false;
            return true;
        });
    }

    function sortList(list) {
        var rank = { ok: 0, user: 1, geo: 2 };
        return list.slice().sort(function (a, b) {
            return (rank[a.status] || 0) - (rank[b.status] || 0) || (b.hd - a.hd) || a.name.localeCompare(b.name, 'ru');
        });
    }

    // ---------- избранное, недавние, скрытые ----------

    function slim(c) { return { name: c.name, logo: c.logo, cat: c.cat, hd: c.hd, status: c.status, urls: c.urls, key: c.key }; }
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
    }
    function hide(c) {
        var h = getJSON('mtv_hidden', []);
        if (h.indexOf(c.key) === -1) h.push(c.key);
        setJSON('mtv_hidden', h);
        noty('Канал скрыт. Вернуть: Настройки → Maestro TV');
    }

    // ---------- плеер с автоподбором зеркала ----------

    // Пробуем зеркала по очереди. Если сервер прямо ответил ошибкой — берём следующее.
    // Если ответа не прочитать (CORS), считаем поток рабочим и отдаём плееру.
    function pickUrl(c, done) {
        var i = 0;
        (function next() {
            if (i >= c.urls.length) return done(null);
            var url = c.urls[i++];
            request(url, function (text) {
                if (text.indexOf('#EXTM3U') === 0 || text.indexOf('#EXTM3U') !== -1 || text.length > 0) done(url, i - 1);
                else next();
            }, function (code) {
                if (code === 0) return done(url, i - 1);
                next();
            }, 6000);
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
            var playlist = list.map(function (x) {
                return { title: x.name, url: x === c ? url : x.urls[0] };
            });
            Lampa.Player.play({ title: c.name + (idx > 0 ? ' · зеркало ' + (idx + 1) : ''), url: url });
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
            '.mtv-side__in,.mtv-main__in{position:relative}' +
            '.mtv-cat{display:flex;align-items:center;padding:.75em 1em;margin-bottom:.35em;border-radius:1em;transition:background .15s}' +
            '.mtv-cat__ico{width:1.8em;font-size:1.15em}' +
            '.mtv-cat__name{flex:1;font-size:1.1em}' +
            '.mtv-cat__cnt{opacity:.45;font-size:.9em}' +
            '.mtv-cat.active{background:rgba(255,255,255,.08)}' +
            '.mtv-cat.focus{background:#fff;color:#111}' +
            '.mtv-cat.focus .mtv-cat__cnt{opacity:.6}' +
            '.mtv-head{display:flex;align-items:baseline;margin:0 0 1em .2em}' +
            '.mtv-head__title{font-size:1.9em;font-weight:700;letter-spacing:-.01em}' +
            '.mtv-head__info{margin-left:1em;opacity:.45}' +
            '.mtv-row{display:flex;align-items:center;padding:.55em .8em;margin-bottom:.4em;border-radius:1.1em;background:rgba(255,255,255,.035);transition:background .12s,transform .12s}' +
            '.mtv-row__logo{width:5.2em;height:3.2em;flex-shrink:0;border-radius:.7em;background:rgba(255,255,255,.07);display:flex;align-items:center;justify-content:center;overflow:hidden;margin-right:1em}' +
            '.mtv-row__logo img{max-width:82%;max-height:78%;object-fit:contain}' +
            '.mtv-row__letter{font-size:1.5em;font-weight:700;opacity:.35}' +
            '.mtv-row__name{flex:1;font-size:1.15em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mtv-row__tags{display:flex;align-items:center}' +
            '.mtv-tag{font-size:.7em;font-weight:700;padding:.2em .5em;border-radius:.45em;margin-left:.5em;background:rgba(255,255,255,.12)}' +
            '.mtv-tag--hd{background:linear-gradient(135deg,#7c5cff,#2fb6ff);color:#fff}' +
            '.mtv-dot{width:.6em;height:.6em;border-radius:50%;margin-left:.8em;background:#3ddc84}' +
            '.mtv-dot--geo{background:#ffb020}.mtv-dot--user{background:#8a8a8a}' +
            '.mtv-row.focus{background:#fff;color:#111;transform:scale(1.015)}' +
            '.mtv-row.focus .mtv-tag{background:rgba(0,0,0,.1)}' +
            '.mtv-row.focus .mtv-tag--hd{background:linear-gradient(135deg,#7c5cff,#2fb6ff);color:#fff}' +
            '.mtv-empty{opacity:.5;padding:2em .3em;font-size:1.1em}' +
            '.mtv-foot{opacity:.35;font-size:.85em;padding:1em .3em}';
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
        var sideIn = side.find('.mtv-side__in'), mainIn = main.find('.mtv-main__in');
        var data = null, cats = [], current = null, currentEl = null, lastRow = null, zone = 'side', rows = [];
        var switchTimer = null;

        html.append(side).append(main);

        // прокрутка через transform: плавно и работает на старых WebOS
        function follow(box, inner, el) {
            var boxH = box[0].clientHeight, top = el[0].offsetTop, h = el[0].offsetHeight;
            var innerH = inner[0].scrollHeight;
            var y = Math.max(0, Math.min(top - boxH / 2 + h / 2, innerH - boxH + 40));
            inner.css('transform', 'translate3d(0,' + (-y) + 'px,0)');
        }

        this.create = function () {
            this.activity.loader(true);
            loadData(function (d) {
                data = d;
                self.build();
            }, function (err) {
                var empty = new Lampa.Empty({ descr: err });
                html.empty().append(empty.render());
                self.start = empty.start;
                self.activity.loader(false);
                self.activity.toggle();
            }, object.force);
            return this.render();
        };

        this.countFor = function (id) {
            var vis = visible(data.list);
            if (id === 'fav') return getJSON('mtv_fav2', []).length;
            if (id === 'recent') return getJSON('mtv_recent2', []).length;
            if (id === 'all') return vis.length;
            return vis.filter(function (c) { return c.cat === id; }).length;
        };

        this.channelsFor = function (id) {
            if (id === 'fav') return getJSON('mtv_fav2', []);
            if (id === 'recent') return getJSON('mtv_recent2', []);
            var vis = visible(data.list);
            return sortList(id === 'all' ? vis : vis.filter(function (c) { return c.cat === id; }));
        };

        this.build = function () {
            cats = [];
            cats.push({ id: 'fav', title: 'Избранное', icon: '⭐' });
            cats.push({ id: 'recent', title: 'Недавние', icon: '🕘' });
            CATEGORIES.forEach(function (c) { cats.push({ id: c.id, title: c.title, icon: c.icon }); });
            cats.push({ id: 'all', title: 'Все каналы', icon: '📡' });

            var saved = Lampa.Storage.get('mtv_last_cat', 'docs');
            var first = null;

            cats.forEach(function (c) {
                var n = self.countFor(c.id);
                if (!n && c.id !== 'fav') return;
                var el = $('<div class="mtv-cat selector"><div class="mtv-cat__ico">' + c.icon + '</div>' +
                    '<div class="mtv-cat__name">' + esc(c.title) + '</div><div class="mtv-cat__cnt">' + n + '</div></div>');
                el.on('hover:focus', function () {
                    zone = 'side';
                    follow(side, sideIn, el);
                    clearTimeout(switchTimer);
                    switchTimer = setTimeout(function () { self.showCat(c, el); }, 220);
                });
                el.on('hover:enter', function () {
                    clearTimeout(switchTimer);
                    self.showCat(c, el);
                    self.focusList();
                });
                c.el = el;
                sideIn.append(el);
                if (!first || c.id === saved) first = c;
            });

            var st = data.stats || {};
            sideIn.append('<div class="mtv-foot">Проверено ' + esc(ago(data.updated)) + '<br>Живых потоков: ' + (st.ok || 0) + '<br>v' + VERSION + '</div>');

            if (first) this.showCat(first, first.el);
            this.activity.loader(false);
            this.activity.toggle();
        };

        this.showCat = function (c, el) {
            if (current === c.id && rows.length) return;
            current = c.id;
            currentEl = el;
            sideIn.find('.mtv-cat').removeClass('active');
            el.addClass('active');
            Lampa.Storage.set('mtv_last_cat', c.id);

            var list = this.channelsFor(c.id);
            mainIn.empty().css('transform', 'translate3d(0,0,0)');
            rows = [];
            lastRow = null;
            mainIn.append('<div class="mtv-head"><div class="mtv-head__title">' + esc(c.title) + '</div>' +
                '<div class="mtv-head__info">' + list.length + ' кан. · OK — смотреть · долгое OK — меню</div></div>');

            if (!list.length) {
                mainIn.append('<div class="mtv-empty">' + (c.id === 'fav' ? 'Долгое нажатие OK на канале → «В избранное»' : 'Пусто') + '</div>');
            }

            list.forEach(function (ch) {
                var letter = esc((ch.name || '?').charAt(0).toUpperCase());
                var row = $('<div class="mtv-row selector">' +
                    '<div class="mtv-row__logo">' + (ch.logo ? '<img src="' + esc(ch.logo) + '">' : '<div class="mtv-row__letter">' + letter + '</div>') + '</div>' +
                    '<div class="mtv-row__name">' + esc(ch.name) + '</div>' +
                    '<div class="mtv-row__tags">' +
                    (isFav(ch) ? '<span>⭐</span>' : '') +
                    (ch.urls && ch.urls.length > 1 ? '<div class="mtv-tag">' + ch.urls.length + ' зерк.</div>' : '') +
                    (ch.hd ? '<div class="mtv-tag mtv-tag--hd">HD</div>' : '') +
                    '<div class="mtv-dot' + (ch.status === 'geo' ? ' mtv-dot--geo' : ch.status === 'user' ? ' mtv-dot--user' : '') + '"></div>' +
                    '</div></div>');
                row.find('img').on('error', function () { $(this).replaceWith('<div class="mtv-row__letter">' + letter + '</div>'); });
                row.on('hover:focus', function () { zone = 'main'; lastRow = row[0]; follow(main, mainIn, row); });
                row.on('hover:enter', function () { play(ch, list); });
                row.on('hover:long', function () { self.menu(ch); });
                rows.push(row[0]);
                mainIn.append(row);
            });

            if (Lampa.Activity.active() && Lampa.Activity.active().activity === this.activity) {
                Lampa.Controller.collectionSet(html);
            }
        };

        this.menu = function (ch) {
            var fav = isFav(ch);
            Lampa.Select.show({
                title: ch.name,
                items: [
                    { title: fav ? 'Убрать из избранного' : 'В избранное', act: 'fav' },
                    { title: 'Скрыть канал', act: 'hide' }
                ],
                onSelect: function (a) {
                    if (a.act === 'fav') toggleFav(ch);
                    if (a.act === 'hide') hide(ch);
                    var c = current; current = null;
                    var cat = cats.filter(function (x) { return x.id === c; })[0];
                    if (cat) self.showCat(cat, cat.el);
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
                right: function () {
                    if (zone === 'side') self.focusList();
                },
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

        this.pause = function () {};
        this.stop = function () {};
        this.render = function () { return html; };
        this.destroy = function () { clearTimeout(switchTimer); html.remove(); };
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
            ['mtv_hd_only', 'Только HD', false, ''],
            ['mtv_geo', 'Показывать каналы с региональной блокировкой', false, 'Жёлтая точка: у робота поток закрыт по региону, у тебя может работать'],
            ['mtv_adult', 'Показывать 18+', false, '']
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
            '<div class="menu__text">ТВ каналы</div></li>');
        item.on('hover:enter', function () {
            Lampa.Activity.push({ url: '', title: 'ТВ каналы', component: PLUGIN, page: 1 });
        });
        $('.menu .menu__list').eq(0).append(item);
    }

    function start() {
        Lampa.Component.add(PLUGIN, Component);
        addStyles();
        addSettings();
        addMenu();
    }

    window.MaestroTV = { parseM3U: parseM3U, categorize: categorize, cleanKey: cleanKey, version: VERSION };

    if (typeof Lampa === 'undefined') return;
    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})();
