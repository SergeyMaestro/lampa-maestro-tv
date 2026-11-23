/*!
 * Maestro TV — IPTV-плагин для Lampa
 * Категории, избранное, недавние, 18+ по переключателю, HD-фильтр.
 * Источники: открытые плейлисты iptv-org + любые M3U-ссылки из настроек.
 * Код на ES5, чтобы работал на старых WebOS.
 */
(function () {
    'use strict';

    if (window.maestro_tv_loaded) return;
    window.maestro_tv_loaded = true;

    var PLUGIN = 'maestro_tv';
    var TTL = 6 * 60 * 60 * 1000; // кэш плейлистов на 6 часов

    var SOURCES = {
        mtv_src_rus: { url: 'https://iptv-org.github.io/iptv/languages/rus.m3u', name: 'Русскоязычные' },
        mtv_src_kaz: { url: 'https://iptv-org.github.io/iptv/languages/kaz.m3u', name: 'Казахстан' },
        mtv_src_ukr: { url: 'https://iptv-org.github.io/iptv/languages/ukr.m3u', name: 'Украинские' },
        mtv_src_doc: { url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u', name: 'Документальные (мир)' }
    };

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

    var CACHE = null; // { time, list }

    // ---------- утилиты ----------

    function field(name, def) {
        try {
            var v = Lampa.Storage.field(name);
            return v === undefined || v === null || v === '' ? def : v;
        } catch (e) { return def; }
    }

    function getList(key) {
        try { var v = Lampa.Storage.get(key, '[]'); return typeof v === 'string' ? JSON.parse(v) : (v || []); }
        catch (e) { return []; }
    }

    function setList(key, list) {
        try { Lampa.Storage.set(key, list); } catch (e) {}
    }

    function noty(text) {
        try { Lampa.Noty.show(text); } catch (e) {}
    }

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
        return raw.replace(/\[[^\]]*\]/g, '').replace(/\((\d{3,4}[pi]|4k|uhd|hd|sd)\)/ig, '').replace(/\s+/g, ' ').trim();
    }

    function isHD(raw) {
        return /(720p|1080p|2160p|4k|uhd|\bhd\b|full ?hd)/i.test(raw);
    }

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

    function parseM3U(text) {
        var lines = String(text || '').split(/\r?\n/);
        var out = [];
        var cur = null;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            if (line.indexOf('#EXTINF') === 0) {
                var idx = line.lastIndexOf(',');
                var raw = idx !== -1 ? line.substr(idx + 1).trim() : '';
                cur = {
                    raw: raw || attr(line, 'tvg-name'),
                    logo: attr(line, 'tvg-logo'),
                    group: attr(line, 'group-title'),
                    id: attr(line, 'tvg-id')
                };
            } else if (line.indexOf('#EXTGRP:') === 0 && cur) {
                cur.group = cur.group || line.substr(8).trim();
            } else if (line.charAt(0) !== '#' && cur) {
                out.push({
                    name: cleanName(cur.raw) || 'Без названия',
                    hd: isHD(cur.raw),
                    logo: cur.logo,
                    group: cur.group,
                    id: cur.id,
                    url: line
                });
                cur = null;
            }
        }
        return out;
    }

    function request(url, ok, fail) {
        var xhr = new XMLHttpRequest();
        var done = false;
        xhr.open('GET', url, true);
        xhr.timeout = 20000;
        xhr.onload = function () {
            if (done) return; done = true;
            if (xhr.status >= 200 && xhr.status < 300) ok(xhr.responseText);
            else fail('HTTP ' + xhr.status);
        };
        xhr.onerror = function () { if (!done) { done = true; fail('сеть'); } };
        xhr.ontimeout = function () { if (!done) { done = true; fail('таймаут'); } };
        xhr.send();
    }

    function userPlaylists() {
        var raw = String(field('mtv_playlists', '') || '');
        return raw.split(/[\s,;]+/).filter(function (u) { return /^https?:\/\//i.test(u); });
    }

    function activeSources() {
        var list = [];
        // свои плейлисты идут первыми — при дублях выигрывают они
        userPlaylists().forEach(function (u) { list.push({ url: u, name: 'Мой плейлист' }); });
        for (var key in SOURCES) {
            var def = key !== 'mtv_src_ukr' && key !== 'mtv_src_doc';
            if (field(key, def)) list.push(SOURCES[key]);
        }
        return list;
    }

    function loadAll(ok, fail, force) {
        if (!force && CACHE && Date.now() - CACHE.time < TTL) return ok(CACHE.list);

        var sources = activeSources();
        if (!sources.length) return fail('Нет ни одного источника. Включи их в Настройки → Maestro TV');

        var left = sources.length;
        var all = [];
        var errors = [];

        sources.forEach(function (src) {
            request(src.url, function (text) {
                all = all.concat(parseM3U(text));
                finish();
            }, function (err) {
                errors.push(src.name + ': ' + err);
                finish();
            });
        });

        function finish() {
            if (--left > 0) return;
            if (!all.length) return fail('Не удалось загрузить каналы. ' + errors.join('; '));
            if (errors.length) noty('Часть источников не ответила: ' + errors.join('; '));
            CACHE = { time: Date.now(), list: dedupe(all) };
            ok(CACHE.list);
        }
    }

    // убираем дубли: одинаковый URL — выкидываем; одинаковое имя — оставляем HD
    function dedupe(list) {
        var byUrl = {}, byName = {}, out = [];
        list.forEach(function (ch) {
            if (byUrl[ch.url]) return;
            byUrl[ch.url] = true;
            var key = ch.name.toLowerCase().replace(/\b(hd|fhd|uhd|4k)\b/g, '').replace(/[^a-zа-яё0-9+]/g, '');
            var prev = byName[key];
            ch.cat = categorize(ch);
            if (!prev) { byName[key] = ch; out.push(ch); return; }
            prev.alts = prev.alts || [];
            if (ch.hd && !prev.hd) {
                prev.alts.push(prev.url);
                prev.url = ch.url; prev.hd = true;
                if (!prev.logo) prev.logo = ch.logo;
            } else {
                prev.alts.push(ch.url);
            }
        });
        out.sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
        return out;
    }

    function visible(list) {
        var adult = field('mtv_adult', false);
        var hdOnly = field('mtv_hd_only', false);
        return list.filter(function (ch) {
            if (!adult && ch.cat === 'adult') return false;
            if (hdOnly && !ch.hd) return false;
            return true;
        });
    }

    // ---------- избранное / недавние ----------

    function slim(ch) { return { name: ch.name, url: ch.url, logo: ch.logo, hd: ch.hd, cat: ch.cat, alts: ch.alts }; }

    function isFav(ch) {
        return getList('mtv_fav').some(function (f) { return f.url === ch.url; });
    }

    function toggleFav(ch) {
        var fav = getList('mtv_fav');
        var had = fav.some(function (f) { return f.url === ch.url; });
        fav = fav.filter(function (f) { return f.url !== ch.url; });
        if (!had) fav.unshift(slim(ch));
        setList('mtv_fav', fav);
        noty(had ? 'Убрано из избранного' : '⭐ Добавлено в избранное');
        return !had;
    }

    function pushRecent(ch) {
        var rec = getList('mtv_recent').filter(function (f) { return f.url !== ch.url; });
        rec.unshift(slim(ch));
        setList('mtv_recent', rec.slice(0, 24));
    }

    // ---------- плеер ----------

    function play(ch, list) {
        pushRecent(ch);
        var playlist = (list || [ch]).map(function (c) { return { title: c.name, url: c.url }; });
        Lampa.Player.play({ title: ch.name, url: ch.url });
        if (playlist.length > 1) Lampa.Player.playlist(playlist);
    }

    // ---------- стили ----------

    function addStyles() {
        var css =
            '.mtv-wrap{padding:1.5em 1.5em 3em}' +
            '.mtv-head{font-size:1.1em;opacity:.6;margin:0 0 1em .3em}' +
            '.mtv-grid{display:flex;flex-wrap:wrap;margin:-.5em}' +
            '.mtv-cat{width:16em;height:8em;margin:.5em;border-radius:1.2em;padding:1.2em;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:2px solid transparent;transition:transform .15s}' +
            '.mtv-cat__icon{font-size:2.2em;line-height:1}' +
            '.mtv-cat__title{font-size:1.3em;font-weight:600}' +
            '.mtv-cat__count{opacity:.5;font-size:.9em}' +
            '.mtv-ch{width:11em;margin:.5em;border-radius:1em;padding:.8em;box-sizing:border-box;background:rgba(255,255,255,.05);border:2px solid transparent;position:relative;transition:transform .15s}' +
            '.mtv-ch__logo{height:5em;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.25);border-radius:.7em;overflow:hidden}' +
            '.mtv-ch__logo img{max-width:85%;max-height:80%;object-fit:contain}' +
            '.mtv-ch__letter{font-size:2.2em;font-weight:700;opacity:.35}' +
            '.mtv-ch__name{margin-top:.6em;font-size:.95em;line-height:1.25;height:2.5em;overflow:hidden}' +
            '.mtv-ch__hd{position:absolute;top:1.1em;right:1.1em;font-size:.65em;font-weight:700;padding:.15em .45em;border-radius:.4em;background:#fff;color:#000}' +
            '.mtv-ch__fav{position:absolute;top:.9em;left:1.1em;font-size:.9em}' +
            '.mtv-cat.focus,.mtv-ch.focus{border-color:#fff;transform:scale(1.06);background:rgba(255,255,255,.16)}' +
            '.mtv-hint{opacity:.4;font-size:.85em;margin:1.5em .3em 0}';
        $('head').append('<style id="mtv-style">' + css + '</style>');
    }

    // ---------- экран ----------

    function Component(object) {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 250 });
        var html = $('<div></div>');
        var last = null;
        var self = this;

        this.create = function () {
            this.activity.loader(true);
            loadAll(function (list) {
                if (object.category) self.buildChannels(list);
                else self.buildCategories(list);
            }, function (err) {
                self.empty(err);
            }, object.force);
            return this.render();
        };

        this.empty = function (text) {
            var empty = new Lampa.Empty({ descr: text });
            html.append(empty.render());
            this.start = empty.start;
            this.activity.loader(false);
            this.activity.toggle();
        };

        this.bindFocus = function (el) {
            el.on('hover:focus', function () {
                last = el[0];
                scroll.update(el, true);
            });
        };

        this.buildCategories = function (all) {
            var list = visible(all);
            var wrap = $('<div class="mtv-wrap"></div>');
            var grid = $('<div class="mtv-grid"></div>');
            var cats = [];

            var fav = getList('mtv_fav');
            var rec = getList('mtv_recent');
            if (fav.length) cats.push({ id: 'fav', title: 'Избранное', icon: '⭐', count: fav.length });
            if (rec.length) cats.push({ id: 'recent', title: 'Недавние', icon: '🕘', count: rec.length });
            cats.push({ id: 'all', title: 'Все каналы', icon: '📡', count: list.length });

            CATEGORIES.forEach(function (c) {
                var n = list.filter(function (ch) { return ch.cat === c.id; }).length;
                if (n) cats.push({ id: c.id, title: c.title, icon: c.icon, count: n });
            });
            cats.push({ id: 'refresh', title: 'Обновить', icon: '🔄', count: null });

            cats.forEach(function (c) {
                var el = $('<div class="mtv-cat selector">' +
                    '<div class="mtv-cat__icon">' + c.icon + '</div>' +
                    '<div><div class="mtv-cat__title">' + esc(c.title) + '</div>' +
                    (c.count !== null ? '<div class="mtv-cat__count">' + c.count + ' кан.</div>' : '<div class="mtv-cat__count">перезагрузить списки</div>') +
                    '</div></div>');
                el.on('hover:enter', function () {
                    if (c.id === 'refresh') {
                        CACHE = null;
                        Lampa.Activity.replace({ url: '', title: 'ТВ', component: PLUGIN, force: true, page: 1 });
                        return;
                    }
                    Lampa.Activity.push({ url: '', title: c.title, component: PLUGIN, category: c.id, page: 1 });
                });
                self.bindFocus(el);
                grid.append(el);
            });

            wrap.append(grid);
            wrap.append('<div class="mtv-hint">Свои плейлисты, 18+ и HD-фильтр: Настройки → Maestro TV</div>');
            this.finish(wrap);
        };

        this.buildChannels = function (all) {
            var list;
            if (object.category === 'fav') list = getList('mtv_fav');
            else if (object.category === 'recent') list = getList('mtv_recent');
            else if (object.category === 'all') list = visible(all);
            else list = visible(all).filter(function (ch) { return ch.cat === object.category; });

            if (!list.length) return this.empty('Тут пока пусто');

            var wrap = $('<div class="mtv-wrap"></div>');
            wrap.append('<div class="mtv-head">' + list.length + ' каналов · OK — смотреть · долгое нажатие — в избранное</div>');
            var grid = $('<div class="mtv-grid"></div>');

            list.forEach(function (ch) {
                var letter = esc((ch.name || '?').charAt(0).toUpperCase());
                var el = $('<div class="mtv-ch selector">' +
                    '<div class="mtv-ch__logo">' +
                    (ch.logo ? '<img loading="lazy" src="' + esc(ch.logo) + '">' : '<div class="mtv-ch__letter">' + letter + '</div>') +
                    '</div>' +
                    (ch.hd ? '<div class="mtv-ch__hd">HD</div>' : '') +
                    (isFav(ch) ? '<div class="mtv-ch__fav">⭐</div>' : '') +
                    '<div class="mtv-ch__name">' + esc(ch.name) + '</div></div>');

                el.find('img').on('error', function () {
                    $(this).replaceWith('<div class="mtv-ch__letter">' + letter + '</div>');
                });
                el.on('hover:enter', function () { play(ch, list); });
                el.on('hover:long', function () {
                    var now = toggleFav(ch);
                    el.find('.mtv-ch__fav').remove();
                    if (now) el.prepend('<div class="mtv-ch__fav">⭐</div>');
                });
                self.bindFocus(el);
                grid.append(el);
            });

            wrap.append(grid);
            this.finish(wrap);
        };

        this.finish = function (content) {
            scroll.minus();
            scroll.append(content);
            html.append(scroll.render());
            this.activity.loader(false);
            this.activity.toggle();
        };

        this.start = function () {
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () { Navigator.move('right'); },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { Navigator.move('down'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.render = function () { return html; };
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

    // ---------- настройки ----------

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: PLUGIN,
            name: 'Maestro TV',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 2l4 3 4-3"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: PLUGIN,
            param: { name: 'mtv_playlists', type: 'input', values: '', default: '', placeholder: 'https://.../playlist.m3u' },
            field: { name: 'Мои плейлисты (M3U)', description: 'Одна или несколько ссылок через запятую' },
            onChange: function () { CACHE = null; }
        });

        var triggers = [
            ['mtv_src_rus', 'Открытые русскоязычные каналы', true],
            ['mtv_src_kaz', 'Открытые каналы Казахстана', true],
            ['mtv_src_ukr', 'Открытые украинские каналы', false],
            ['mtv_src_doc', 'Открытые документальные (весь мир)', false],
            ['mtv_hd_only', 'Только HD', false],
            ['mtv_adult', 'Показывать 18+', false]
        ];
        triggers.forEach(function (t) {
            Lampa.SettingsApi.addParam({
                component: PLUGIN,
                param: { name: t[0], type: 'trigger', default: t[2] },
                field: { name: t[1] },
                onChange: function () { CACHE = null; }
            });
        });
    }

    // ---------- пункт меню ----------

    function addMenu() {
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

    // экспорт для тестов вне Лампы
    window.MaestroTV = { parseM3U: parseM3U, categorize: categorize, dedupe: dedupe };

    if (typeof Lampa === 'undefined') return;
    if (window.appready) start();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') start(); });
})();
