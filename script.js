/* ============================================================
   NiC Radio - Pseudo-Live Internet Radio
   Synchronized via date-seeded PRNG and system clock
   ============================================================ */

(function () {
    'use strict';

    /* ============================================================
       KONFIGURACJA
       ============================================================ */
    const CONFIG = {
        PASSWORD: 'nudne-radio',
        INTRO_SECONDS: 10,
        SYNC_DRIFT_THRESHOLD: 3,
        SYNC_INTERVAL_MS: 1000,
        MAX_SYNC_RETRIES: 5,
        PLAYLIST_FETCH_TIMEOUT_MS: 8000,
        SCHEDULE_FETCH_TIMEOUT_MS: 5000,
        USE_EMBEDDED_FALLBACK: true,
        DEBUG_OVERLAY_ENABLED: true,
        DISPLAY_NAMES: {
            'noc.txt': 'NOC',
            'poranek.txt': 'PORANEK',
            'rano.txt': 'PORANNE GRACIE',
            'dzien.txt': 'W CIĄGU DNIA',
            'popoludnie.txt': 'POPOŁUDNIE',
            'wieczor.txt': 'WIECZÓR',
            'weekend.txt': 'WEEKEND'
        }
    };

    /* ============================================================
       DEBUG - log buffer i overlay
       ============================================================ */
    const debugLog = [];
    const DEBUG_LOG_MAX = 20;
    let debugOverlayEl = null;
    let debugLogEl = null;
    let debugStateEl = null;

    function debugLogAdd(msg, kind) {
        const t = new Date();
        const time = t.getHours().toString().padStart(2,'0') + ':' + t.getMinutes().toString().padStart(2,'0') + ':' + t.getSeconds().toString().padStart(2,'0');
        const entry = { time: time, msg: msg, kind: kind || 'info' };
        debugLog.push(entry);
        if (debugLog.length > DEBUG_LOG_MAX) debugLog.shift();
        if (debugLogEl) {
            const color = kind === 'error' ? '#ff6b6b' : (kind === 'warn' ? '#f5c44a' : (kind === 'ok' ? '#7eff7e' : '#aaa'));
            const div = document.createElement('div');
            div.style.color = color;
            div.style.fontSize = '10px';
            div.style.lineHeight = '1.3';
            div.style.marginTop = '2px';
            div.style.wordBreak = 'break-word';
            div.textContent = time + ' ' + msg;
            debugLogEl.appendChild(div);
            while (debugLogEl.children.length > DEBUG_LOG_MAX) debugLogEl.removeChild(debugLogEl.firstChild);
            debugLogEl.scrollTop = debugLogEl.scrollHeight;
        }
        console.log('[' + time + '] [NiC] ' + (kind ? '[' + kind + '] ' : '') + msg);
    }

    function createDebugOverlay() {
        if (debugOverlayEl || !CONFIG.DEBUG_OVERLAY_ENABLED) return;
        debugOverlayEl = document.createElement('div');
        debugOverlayEl.id = 'nicDebugOverlay';
        debugOverlayEl.style.cssText = 'position:fixed;top:8px;right:8px;width:280px;max-height:90vh;background:rgba(0,0,0,0.92);color:#fff;border:1px solid #720000;border-radius:6px;padding:8px;font-family:ui-monospace,Consolas,monospace;font-size:11px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.6);overflow:hidden;display:flex;flex-direction:column;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:1px solid #333;padding-bottom:4px;';
        header.innerHTML = '<span style="color:#f851d4;font-weight:bold;">[NiC DEBUG]</span>';
        const hideBtn = document.createElement('button');
        hideBtn.textContent = '×';
        hideBtn.style.cssText = 'background:transparent;border:1px solid #555;color:#fff;width:20px;height:20px;cursor:pointer;border-radius:3px;line-height:1;';
        hideBtn.onclick = function() {
            debugOverlayEl.style.display = 'none';
            const btn = document.getElementById('nicConsoleToggle');
            if (btn) btn.innerHTML = '[NiC]';
        };
        header.appendChild(hideBtn);
        debugOverlayEl.appendChild(header);

        debugStateEl = document.createElement('div');
        debugStateEl.style.cssText = 'font-size:10px;line-height:1.4;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #222;white-space:pre-wrap;';
        debugOverlayEl.appendChild(debugStateEl);

        const logLabel = document.createElement('div');
        logLabel.textContent = 'Ostatnie zdarzenia:';
        logLabel.style.cssText = 'color:#888;font-size:9px;margin-bottom:2px;';
        debugOverlayEl.appendChild(logLabel);

        debugLogEl = document.createElement('div');
        debugLogEl.style.cssText = 'flex:1;overflow-y:auto;max-height:280px;background:rgba(255,255,255,0.03);padding:4px;border-radius:3px;';
        debugOverlayEl.appendChild(debugLogEl);

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

        const toggleDriftBtn = document.createElement('button');
        toggleDriftBtn.id = 'nicDebugToggleDrift';
        toggleDriftBtn.textContent = 'Wyłącz korektę';
        toggleDriftBtn.style.cssText = 'flex:1;background:#720000;color:#fff;border:none;padding:5px;cursor:pointer;font-size:10px;border-radius:3px;';
        toggleDriftBtn.onclick = function() {
            if (state.driftCheckDisabled) {
                state.driftCheckDisabled = false;
                state.lastDriftCheck = 0;
                debugLogAdd('Korekta dryfu WŁĄCZONA', 'ok');
                toggleDriftBtn.textContent = 'Wyłącz korektę';
                toggleDriftBtn.style.background = '#720000';
            } else {
                state.driftCheckDisabled = true;
                debugLogAdd('Korekta dryfu WYŁĄCZONA', 'warn');
                toggleDriftBtn.textContent = 'Włącz korektę';
                toggleDriftBtn.style.background = '#1a5a1a';
            }
        };
        btnRow.appendChild(toggleDriftBtn);

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Wyczyść log';
        clearBtn.style.cssText = 'background:#333;color:#fff;border:none;padding:5px;cursor:pointer;font-size:10px;border-radius:3px;';
        clearBtn.onclick = function() {
            debugLog.length = 0;
            if (debugLogEl) debugLogEl.innerHTML = '';
        };
        btnRow.appendChild(clearBtn);

        const resyncBtn = document.createElement('button');
        resyncBtn.textContent = 'Wymuś sync';
        resyncBtn.style.cssText = 'background:#1a5a1a;color:#fff;border:none;padding:5px;cursor:pointer;font-size:10px;border-radius:3px;';
        resyncBtn.onclick = function() {
            state.lastLoadedVideoId = null;
            state.videoLoadLock = false;
            state.lastDriftCheck = 0;
            performSync();
            debugLogAdd('Wymuszona synchronizacja', 'ok');
        };
        btnRow.appendChild(resyncBtn);

        debugOverlayEl.appendChild(btnRow);
        debugOverlayEl.style.display = 'none';
        document.body.appendChild(debugOverlayEl);

        const consoleBtn = document.createElement('button');
        consoleBtn.id = 'nicConsoleToggle';
        consoleBtn.innerHTML = '[NiC]';
        consoleBtn.title = 'Pokaż/ukryj konsolę diagnostyczną';
        consoleBtn.style.cssText = 'position:fixed;bottom:12px;right:12px;background:#720000;color:#fff;border:1px solid #f851d4;padding:6px 10px;font-family:ui-monospace,Consolas,monospace;font-size:11px;font-weight:bold;border-radius:4px;cursor:pointer;z-index:99998;box-shadow:0 2px 8px rgba(0,0,0,0.5);letter-spacing:0.05em;';
        consoleBtn.onmouseover = function() { consoleBtn.style.background = '#8a0a0a'; };
        consoleBtn.onmouseout = function() { consoleBtn.style.background = '#720000'; };
        consoleBtn.onclick = function() {
            if (debugOverlayEl.style.display === 'none') {
                debugOverlayEl.style.display = 'flex';
                consoleBtn.innerHTML = '[NiC ×]';
            } else {
                debugOverlayEl.style.display = 'none';
                consoleBtn.innerHTML = '[NiC]';
            }
        };
        document.body.appendChild(consoleBtn);

        debugLogAdd('Overlay załadowany', 'ok');
    }

    function updateDebugState() {
        if (!debugStateEl || !state.player) return;
        const pTime = safeGetCurrentTime();
        const pState = (function() { try { return state.player.getPlayerState(); } catch(e) { return '?'; }})();
        const states = { '-1':'unstarted','0':'ended','1':'playing','2':'paused','3':'buffering','5':'cued' };
        const now = new Date();
        const nowStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + ':' + now.getSeconds().toString().padStart(2,'0');
        let elapsedStr = '—', totalStr = '—';
        if (state.schedule) {
            const currentSec = getSecondsOfDay();
            const info = getProgramElapsedSec(state.schedule, currentSec);
            const pl = state.playlists[info.program.playlist];
            if (pl) {
                let total = 0;
                for (let i = 0; i < pl.length; i++) total += pl[i].duration;
                const e = info.program.useIntro ? Math.max(0, info.elapsed - CONFIG.INTRO_SECONDS) : info.elapsed;
                elapsedStr = (e % (total || 1)).toFixed(0) + 's';
                totalStr = total + 's';
            }
        }
        debugStateEl.textContent =
            'Czas: ' + nowStr + '\n' +
            'Offset: ' + (state.clockOffset / 1000).toFixed(1) + 's\n' +
            'Program: ' + (state.lastProgramFile || '—') + '\n' +
            'Elapsed: ' + elapsedStr + ' / ' + totalStr + '\n' +
            'Wideo: ' + (state.lastLoadedVideoId || '—') + '\n' +
            'Faktyczne: ' + (getCurrentVideoId() || '—') + '\n' +
            'Player: ' + (pTime !== null ? pTime.toFixed(1) + 's' : '?') + '\n' +
            'Stan: ' + (states[pState] || pState) + '\n' +
            'Lock: ' + (state.videoLoadLock ? 'BLOKADA' : 'ok') + '\n' +
            'Dryf: ' + (state.driftCheckDisabled ? 'WYŁ.' : 'ON') + '\n' +
            'Sync#: ' + state.driftCheckCount;
    }

    /* ============================================================
       WBUDOWANE DANE (fallback gdy fetch zawiedzie)
       Używane TYLKO gdy nie uda się pobrać plików .txt z serwera.
       Na GitHub Pages aplikacja korzysta z plików .txt w repozytorium.
       ============================================================ */
    const EMBEDDED = {
        'schedule.txt':
            '00:00,noc.txt,0\n' +
            '06:00,poranek.txt,1\n' +
            '10:00,dzien.txt,0\n' +
            '14:00,popoludnie.txt,0\n' +
            '18:00,wieczor.txt,1\n' +
            '22:00,noc.txt,0',

        'noc.txt':
            'bZ2H9cMx1FA,236,Cigarettes After Sex - Apocalypse\n' +
            'hd31oNL6tkg,210,Tame Impala - Let It Happen\n' +
            'XctG9JkbCuQ,234,The Neighbourhood - Sweater Weather\n' +
            'O_d9NpeI1mc,233,Arctic Monkeys - Do I Wanna Know\n' +
            'wJGc1tjA1Hk,182,Daft Punk - Something About Us\n' +
            'YQHsXMglC9A,295,Adele - Hello\n' +
            'l482T0yNkeo,248,Daft Punk - Get Lucky\n' +
            'CevxZvSJLk8,228,Adele - Rolling in the Deep\n' +
            'fJ9rUzIMcZQ,354,Queen - Bohemian Rhapsody\n' +
            'jNQXAC9IVRw,19,Me at the zoo (first YouTube video)',

        'poranek.txt':
            'dQw4w9WgXcQ,212,Rick Astley - Never Gonna Give You Up\n' +
            '9bZkp7q19f0,252,PSY - Gangnam Style\n' +
            'kJQP7kiw5Fk,282,Luis Fonsi - Despacito\n' +
            'JGwWNGJdvx8,263,Ed Sheeran - Shape of You\n' +
            'OPf0YbXqDm0,270,Mark Ronson - Uptown Funk\n' +
            'RgKAFK5djSk,235,Wiz Khalifa - See You Again\n' +
            'CevxZvSJLk8,228,Adele - Rolling in the Deep\n' +
            'YQHsXMglC9A,295,Adele - Hello\n' +
            'hT_nvWreIhg,220,Katy Perry - Roar\n' +
            '6Mgqbai3NyU,138,The Kid LAROI - Stay\n' +
            'L_jWHffIx5E,196,Smash Mouth - All Star\n' +
            'l482T0yNkeo,248,Daft Punk - Get Lucky\n' +
            'CEb3LH65u1Q,225,Pharrell Williams - Happy\n' +
            'b4B8yFPX3Ro,235,Maroon 5 - Sugar\n' +
            '2Vv-BfVoq4g,237,Ed Sheeran - Perfect',

        'dzien.txt':
            'fJ9rUzIMcZQ,354,Queen - Bohemian Rhapsody\n' +
            'fNFzfwLM_hc,294,Michael Jackson - Billie Jean\n' +
            'tAGnKpE4NCI,388,Metallica - Nothing Else Matters\n' +
            'F-aB4ohNyaY,238,Red Hot Chili Peppers - Californication\n' +
            'YykjpeuMNEk,236,System Of A Down - Chop Suey\n' +
            'lDK9Q5IWYR0,300,Eagles - Hotel California\n' +
            'ktvTqknDobU,236,Imagine Dragons - Radioactive\n' +
            'uelHwf8o7_U,247,Imagine Dragons - Believer\n' +
            'Rb0bYuH_aqU,236,Aerosmith - I Dont Want To Miss A Thing\n' +
            'VjJ_rQbi3G0,242,Gotye - Somebody That I Used To Know\n' +
            'sBws8MSQSS8,237,Survivor - Eye Of The Tiger\n' +
            '4fndeDfaWCg,241,Lynyrd Skynyrd - Sweet Home Alabama\n' +
            'i62sjv3rfvY,231,Dire Straits - Sultans Of Swing\n' +
            'E6GVH4ukTuU,228,Toto - Africa\n' +
            'h4UqMyfQ3RA,290,Ozzy Osbourne - Crazy Train',

        'popoludnie.txt':
            '60ItHLz5WEA,288,Foo Fighters - The Pretender\n' +
            'eVfH8DRH_mE,235,Linkin Park - Numb\n' +
            'F3uMRQfvUfQ,236,Green Day - Boulevard Of Broken Dreams\n' +
            'LjhCEhBgYxw,247,Aerosmith - Crazy\n' +
            '9Ht5R8z1IqE,235,Linkin Park - In The End\n' +
            'gH476CxUfgg,236,Audioslave - Like A Stone\n' +
            'Z07dTxL2JjE,225,Bon Jovi - Livin On A Prayer\n' +
            'S2jV6_axMyo,239,AC/DC - Back In Black\n' +
            'xPU8OA9SHzI,237,Rammstein - Du Hast\n' +
            '05aAmJeu3zU,236,Red Hot Chili Peppers - Under The Bridge\n' +
            'Tj6O2XhY2ko,228,AC/DC - Thunderstruck\n' +
            'h4UqMyfQ3RA,290,Ozzy Osbourne - Crazy Train\n' +
            'ktvTqknDobU,236,Imagine Dragons - Radioactive\n' +
            'uelHwf8o7_U,247,Imagine Dragons - Believer\n' +
            'F-aB4ohNyaY,238,Red Hot Chili Peppers - Californication',

        'wieczor.txt':
            'bZ2H9cMx1FA,236,Cigarettes After Sex - Apocalypse\n' +
            'hd31oNL6tkg,210,Tame Impala - Let It Happen\n' +
            'XctG9JkbCuQ,234,The Neighbourhood - Sweater Weather\n' +
            'O_d9NpeI1mc,233,Arctic Monkeys - Do I Wanna Know\n' +
            'wJGc1tjA1Hk,182,Daft Punk - Something About Us\n' +
            'YQHsXMglC9A,295,Adele - Hello\n' +
            'l482T0yNkeo,248,Daft Punk - Get Lucky\n' +
            'CevxZvSJLk8,228,Adele - Rolling in the Deep\n' +
            'b4B8yFPX3Ro,235,Maroon 5 - Sugar\n' +
            'VjJ_rQbi3G0,242,Gotye - Somebody That I Used To Know\n' +
            'CEb3LH65u1Q,225,Pharrell Williams - Happy\n' +
            'JGwWNGJdvx8,263,Ed Sheeran - Shape of You\n' +
            'fNFzfwLM_hc,294,Michael Jackson - Billie Jean\n' +
            'tAGnKpE4NCI,388,Metallica - Nothing Else Matters\n' +
            'OPf0YbXqDm0,270,Mark Ronson - Uptown Funk'
    };

    /* ============================================================
       STAN APLIKACJI
       ============================================================ */
    const state = {
        authorized: false,
        schedule: null,
        playlists: {},
        shuffledCache: {},
        player: null,
        playerReady: false,
        isPlaying: false,
        lastSyncedKey: null,
        lastProgramFile: null,
        lastTrackIndex: -1,
        introActive: false,
        syncIntervalId: null,
        initStarted: false,
        lastLoadedVideoId: null,
        lastLoadedStartSec: 0,
        videoLoadLock: false,
        lastDriftCheck: 0,
        driftCheckCount: 0,
        driftCheckDisabled: false,
        skippedDuration: 0,
        failedVideoIds: {},
        currentShuffled: null,
        clockOffset: 0
    };

    /* ============================================================
       ELEMENTY DOM
       ============================================================ */
    const dom = {
        passwordModal: document.getElementById('passwordModal'),
        passwordForm: document.getElementById('passwordForm'),
        passwordInput: document.getElementById('passwordInput'),
        passwordError: document.getElementById('passwordError'),
        radioApp: document.getElementById('radioApp'),
        playButton: document.getElementById('playButton'),
        playLabel: document.getElementById('playLabel'),
        currentProgram: document.getElementById('currentProgram'),
        trackTitle: document.getElementById('trackTitle'),
        statusIndicator: document.getElementById('statusIndicator'),
        statusText: document.getElementById('statusText'),
        youtubePlayer: document.getElementById('youtubePlayer')
    };

    /* ============================================================
       GENERATOR LICZB PSEUDOLOSOWYCH (Mulberry32)
       ============================================================ */
    function mulberry32(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function dateStringToSeed(dateStr) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < dateStr.length; i++) {
            h ^= dateStr.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    function shuffleWithSeed(array, seed) {
        const arr = array.slice();
        const rng = mulberry32(seed);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    function getBaseURL() {
        const path = window.location.pathname;
        const lastSlash = path.lastIndexOf('/');
        return window.location.origin + path.substring(0, lastSlash + 1);
    }

    function resourceURL(filename) {
        return getBaseURL() + filename;
    }

    function encodeURL(url) {
        try {
            return encodeURI(url);
        } catch (e) {
            return url;
        }
    }

    function getTodayDateString() {
        const d = new Date(Date.now() + (state.clockOffset || 0));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    async function syncClockWithAPI() {
        const sources = [
            async () => {
                const t0 = Date.now();
                const r = await fetchWithTimeout('https://timeapi.io/api/Time/current/zone?timeZone=UTC', 3000);
                const t1 = Date.now();
                const d = await r.json();
                return { t0, t1, apiUnix: new Date(d.dateTime + 'Z').getTime() };
            },
            async () => {
                const t0 = Date.now();
                const r = await fetchWithTimeout('https://api.binance.com/api/v3/time', 3000);
                const t1 = Date.now();
                const d = await r.json();
                return { t0, t1, apiUnix: d.serverTime };
            },
            async () => {
                const t0 = Date.now();
                const r = await fetchWithTimeout('https://worldtimeapi.org/api/timezone/Etc/UTC', 3000);
                const t1 = Date.now();
                const d = await r.json();
                return { t0, t1, apiUnix: new Date(d.utc_datetime).getTime() };
            }
        ];
        for (const source of sources) {
            try {
                const { t0, t1, apiUnix } = await source();
                const estimatedServerNow = apiUnix + (t1 - t0) / 2;
                state.clockOffset = estimatedServerNow - t1;
                debugLogAdd('Zegar zsynchronizowany, offset=' + (state.clockOffset / 1000).toFixed(2) + 's', 'ok');
                return true;
            } catch (e) {
                debugLogAdd('Sync zegara: ' + e.message, 'warn');
            }
        }
        state.clockOffset = 0;
        debugLogAdd('Wszystkie API zegara niedostępne, używam zegara lokalnego', 'warn');
        return false;
    }

    async function fetchWithTimeout(url, ms) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        try {
            const r = await fetch(url, { signal: controller.signal });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r;
        } finally {
            clearTimeout(id);
        }
    }

    async function fetchText(filename) {
        const url = resourceURL(filename);
        try {
            const res = await fetchWithTimeout(encodeURL(url), CONFIG.SCHEDULE_FETCH_TIMEOUT_MS);
            if (!res.ok) {
                throw new Error('HTTP ' + res.status + ' dla ' + filename);
            }
            const text = await res.text();
            if (!text || text.trim().length === 0) {
                throw new Error('Pusty plik: ' + filename);
            }
            return { text: text, source: 'plik' };
        } catch (err) {
            if (CONFIG.USE_EMBEDDED_FALLBACK && EMBEDDED[filename]) {
                console.warn('Uzywam wbudowanych danych dla ' + filename + ' (' + err.message + ')');
                return { text: EMBEDDED[filename], source: 'wbudowane' };
            }
            throw err;
        }
    }

    /* ============================================================
       PARSOWANIE PLIKÓW
       ============================================================ */
    function parseSchedule(text) {
        const lines = text.split(/\r?\n/);
        const blocks = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            const parts = line.split(',').map(s => s.trim());
            if (parts.length < 3) continue;
            const timeMatch = parts[0].match(/^(\d{1,2}):(\d{2})$/);
            if (!timeMatch) continue;
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            if (hours > 23 || minutes > 59) continue;
            blocks.push({
                time: parts[0].padStart(5, '0'),
                startSec: hours * 3600 + minutes * 60,
                playlist: parts[1],
                useIntro: parts[2] === '1' || parts[2] === 'true',
                displayName: CONFIG.DISPLAY_NAMES[parts[1]] || parts[1].replace(/\.txt$/i, '').toUpperCase()
            });
        }
        if (blocks.length === 0) {
            throw new Error('schedule.txt nie zawiera prawidłowych bloków');
        }
        blocks.sort((a, b) => a.startSec - b.startSec);
        const first = blocks[0];
        if (first.startSec !== 0) {
            throw new Error('Pierwszy blok w schedule.txt musi zaczynać się o 00:00');
        }
        return blocks;
    }

    function extractYouTubeId(input) {
        if (!input) return null;
        const s = String(input).trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
        const patterns = [
            /[?&]v=([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /embed\/([a-zA-Z0-9_-]{11})/,
            /\/v\/([a-zA-Z0-9_-]{11})/,
            /shorts\/([a-zA-Z0-9_-]{11})/
        ];
        for (let i = 0; i < patterns.length; i++) {
            const m = s.match(patterns[i]);
            if (m) return m[1];
        }
        const fallback = s.match(/([a-zA-Z0-9_-]{11})/);
        return fallback ? fallback[1] : null;
    }

    function parsePlaylist(text) {
        const lines = text.split(/\r?\n/);
        const tracks = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('#')) continue;
            const parts = line.split(',');
            if (parts.length < 3) continue;
            const id = extractYouTubeId(parts[0]);
            const duration = parseInt(parts[1].trim(), 10);
            const title = parts.slice(2).join(',').trim();
            if (!id) continue;
            if (!isFinite(duration) || duration <= 0) continue;
            tracks.push({ id: id, duration: duration, title: title || id });
        }
        return tracks;
    }

    /* ============================================================
       OBLICZENIA CZASU
       ============================================================ */
    function getSecondsOfDay() {
        const d = new Date(Date.now() + (state.clockOffset || 0));
        return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
    }

    function getCurrentProgram(schedule, currentSec) {
        let current = schedule[0];
        for (let i = 0; i < schedule.length; i++) {
            if (schedule[i].startSec <= currentSec) {
                current = schedule[i];
            } else {
                break;
            }
        }
        return current;
    }

    function getProgramElapsedSec(schedule, currentSec) {
        const program = getCurrentProgram(schedule, currentSec);
        let elapsed = currentSec - program.startSec + state.skippedDuration;
        if (elapsed < 0) elapsed += 86400;
        return { program: program, elapsed: elapsed };
    }

    function getShuffledPlaylist(playlistFile) {
        if (state.shuffledCache[playlistFile]) {
            return state.shuffledCache[playlistFile];
        }
        const tracks = state.playlists[playlistFile];
        if (!tracks || tracks.length === 0) return [];
        const seed = dateStringToSeed(getTodayDateString());
        const shuffled = shuffleWithSeed(tracks, seed);
        state.shuffledCache[playlistFile] = shuffled;
        return shuffled;
    }

    function findTrackAtTime(shuffledTracks, elapsedSec, useIntro) {
        let offset = elapsedSec;
        if (useIntro) {
            if (offset < CONFIG.INTRO_SECONDS) {
                return { type: 'intro', remainingSec: CONFIG.INTRO_SECONDS - offset };
            }
            offset -= CONFIG.INTRO_SECONDS;
        }
        const failMap = state.failedVideoIds || {};
        let activeTracks = shuffledTracks;
        let activeDurations = null;
        if (Object.keys(failMap).length > 0) {
            const filtered = [];
            const filteredDurs = [];
            for (let i = 0; i < shuffledTracks.length; i++) {
                if (!failMap[shuffledTracks[i].id]) {
                    filtered.push(shuffledTracks[i]);
                    filteredDurs.push(shuffledTracks[i].duration);
                }
            }
            if (filtered.length > 0) {
                activeTracks = filtered;
                activeDurations = filteredDurs;
            }
        }
        let totalDuration = 0;
        const durs = activeDurations || (function() {
            const arr = [];
            for (let i = 0; i < activeTracks.length; i++) arr.push(activeTracks[i].duration);
            return arr;
        })();
        for (let i = 0; i < durs.length; i++) totalDuration += durs[i];
        if (totalDuration > 0) {
            offset = ((offset % totalDuration) + totalDuration) % totalDuration;
        }
        for (let i = 0; i < activeTracks.length; i++) {
            const track = activeTracks[i];
            if (offset < track.duration) {
                return { type: 'track', index: i, startSec: offset, track: track };
            }
            offset -= track.duration;
        }
        if (activeTracks.length > 0) {
            return { type: 'track', index: 0, startSec: 0, track: activeTracks[0] };
        }
        return { type: 'end', track: null, startSec: 0 };
    }

    /* ============================================================
       YOUTUBE IFRAME API
       ============================================================ */
    function loadYouTubeAPI() {
        if (window.YT && window.YT.Player) {
            onYouTubeIframeAPIReady();
            return;
        }
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        const firstScript = document.getElementsByTagName('script')[0];
        firstScript.parentNode.insertBefore(tag, firstScript);
    }

    window.onYouTubeIframeAPIReady = function () {
        if (!state.authorized) return;
        createPlayer();
    };

    function createPlayer() {
        if (state.player) return;
        watchForIframe();
        try {
            state.player = new YT.Player('youtubePlayer', {
                height: '180',
                width: '320',
                videoId: '',
                playerVars: {
                    'autoplay': 1,
                    'controls': 1,
                    'disablekb': 1,
                    'fs': 0,
                    'iv_load_policy': 3,
                    'modestbranding': 1,
                    'playsinline': 1,
                    'rel': 0,
                    'showinfo': 0,
                    'mute': 0
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange,
                    'onError': onPlayerError,
                    'onAutoplayBlocked': onAutoplayBlocked
                }
            });
            setTimeout(applyAllowAutoplay, 200);
            setTimeout(applyAllowAutoplay, 800);
            setTimeout(applyAllowAutoplay, 2000);
        } catch (e) {
            console.error('Player init failed', e);
            setStatus('Błąd odtwarzacza', 'error');
        }
    }

    function applyAllowAutoplay() {
        const iframe = document.querySelector('#youtubePlayer iframe');
        if (iframe) {
            iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope');
            console.log('[NiC] Iframe allow attr:', iframe.getAttribute('allow'));
        } else {
            console.warn('[NiC] YouTube iframe not found yet, retrying...');
        }
    }

    function watchForIframe() {
        const container = document.getElementById('youtubePlayer');
        if (!container || !window.MutationObserver) return;
        const observer = new MutationObserver(() => {
            const iframe = container.querySelector('iframe');
            if (iframe && !iframe.getAttribute('data-allow-set')) {
                iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope');
                iframe.setAttribute('data-allow-set', '1');
                console.log('[NiC] Iframe allow attr set via observer');
            }
        });
        observer.observe(container, { childList: true, subtree: true });
    }

    function onPlayerReady(event) {
        state.playerReady = true;
        try {
            event.target.setVolume(100);
            event.target.unMute();
        } catch (e) { /* ignore */ }
        setTimeout(applyAllowAutoplay, 50);
        performSync();
        if (state.isPlaying) {
            try {
                event.target.playVideo();
                setStatus('NA ŻYWO', 'online');
                debugLogAdd('Play (po załadowaniu)', 'ok');
            } catch (e) {
                debugLogAdd('pending playVideo fail: ' + e.message, 'error');
            }
        }
    }

    function onPlayerStateChange(event) {
        const states = { '-1':'UNSTARTED','0':'ENDED','1':'PLAYING','2':'PAUSED','3':'BUFFERING','5':'CUED' };
        const sName = states[event.data] || ('?' + event.data);
        if (event.data === YT.PlayerState.ENDED) {
            debugLogAdd('Stan: ENDED → next track', 'warn');
            state.lastTrackIndex++;
            performSync();
        } else if (event.data === YT.PlayerState.BUFFERING) {
            debugLogAdd('Stan: BUFFERING', 'info');
        } else if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.CUED) {
            debugLogAdd('Stan: ' + sName, 'ok');
            const currentSec = getSecondsOfDay();
            const info = getProgramElapsedSec(state.schedule, currentSec);
            refreshDisplayFromPlayer(info.program.displayName, null);
        }
    }

    function onPlayerError(event) {
        const failedId = state.lastLoadedVideoId;
        debugLogAdd('YT ERROR kod=' + event.data + ' (' + (failedId || '?') + ')', 'error');
        if (!state.player || !state.schedule || !failedId) {
            setTimeout(performSync, 500);
            return;
        }
        const currentSec = getSecondsOfDay();
        const { program } = getProgramElapsedSec(state.schedule, currentSec);
        const shuffled = getShuffledPlaylist(program.playlist);
        if (!shuffled || shuffled.length === 0) {
            setTimeout(performSync, 500);
            return;
        }
        const failedIdx = shuffled.findIndex(t => t.id === failedId);
        const failedTrack = failedIdx >= 0 ? shuffled[failedIdx] : null;
        if (failedTrack) {
            state.skippedDuration += failedTrack.duration;
            state.failedVideoIds[failedTrack.id] = true;
            debugLogAdd('Zablokowany: ' + failedTrack.title + ' (+' + failedTrack.duration + 's, czarna lista)', 'warn');
        } else {
            state.skippedDuration += 30;
            state.failedVideoIds[failedId] = true;
            debugLogAdd('Zablokowany: ' + failedId + ' (+30s, czarna lista)', 'warn');
        }
        state.lastLoadedVideoId = null;
        state.videoLoadLock = true;
        setTimeout(() => { state.videoLoadLock = false; }, 2000);
        setTimeout(performSync, 500);
    }

    function onAutoplayBlocked(event) {
        console.warn('[NiC] Autoplay zablokowany przez przeglądarkę');
        setStatus('Kliknij odtwarzacz aby włączyć dźwięk', 'error');
        const container = document.getElementById('youtubePlayer');
        if (container) container.classList.add('autoplay-blocked');
    }

    /* ============================================================
       SYNCHRONIZACJA - GŁÓWNA PĘTLA
       ============================================================ */
    function performSync() {
        if (!state.authorized || !state.playerReady || !state.schedule) return;
        if (state.videoLoadLock) return;

        const now = Date.now();
        const currentSec = getSecondsOfDay();
        const { program, elapsed } = getProgramElapsedSec(state.schedule, currentSec);
        const shuffled = getShuffledPlaylist(program.playlist);

        if (!shuffled || shuffled.length === 0) {
            setStatus('Brak utworów: ' + program.playlist, 'error');
            return;
        }

        state.currentShuffled = shuffled;

        const found = findTrackAtTime(shuffled, elapsed, program.useIntro);

        if (found.type === 'intro') {
            handleIntro(program);
            return;
        }

        state.introActive = false;

        if (program.playlist !== state.lastProgramFile) {
            debugLogAdd('Program: ' + program.playlist, 'ok');
            state.lastProgramFile = program.playlist;
            state.skippedDuration = 0;
            state.failedVideoIds = {};
        }

        const targetVideoId = found.track.id;
        const targetStartSec = Math.max(0, found.startSec);

        if (state.lastLoadedVideoId !== targetVideoId) {
            state.videoLoadLock = true;
            try {
                debugLogAdd('LOAD ' + targetVideoId + ' @ ' + targetStartSec.toFixed(1) + 's', 'ok');
                state.player.loadVideoById(targetVideoId, targetStartSec);
                if (state.isPlaying) {
                    state.player.unMute();
                    state.player.setVolume(100);
                } else {
                    state.player.mute();
                }
                state.lastLoadedVideoId = targetVideoId;
                state.lastLoadedStartSec = targetStartSec;
                state.lastTrackIndex = found.index;
                state.lastDriftCheck = now;
                state.driftCheckCount = 0;
            } catch (e) {
                debugLogAdd('LOAD FAIL: ' + e.message, 'error');
                state.videoLoadLock = false;
                return;
            }
            setTimeout(() => { state.videoLoadLock = false; }, 5000);
        } else {
            const playerTime = safeGetCurrentTime();
            const playerStateCode = (function() {
                try { return state.player.getPlayerState(); } catch (e) { return -1; }
            })();

            const sinceLastCheck = now - state.lastDriftCheck;
            const isPlayerPlaying = playerStateCode === 1;

            if (!state.driftCheckDisabled && isPlayerPlaying && playerTime !== null && playerTime > 1 && sinceLastCheck > 5000) {
                state.lastDriftCheck = now;
                const drift = Math.abs(playerTime - targetStartSec);
                if (drift > 5) {
                    debugLogAdd('SEEK dryf=' + drift.toFixed(1) + 's gracz=' + playerTime.toFixed(1) + ' cel=' + targetStartSec.toFixed(1), 'warn');
                    try {
                        state.player.seekTo(targetStartSec, true);
                    } catch (e) {
                        debugLogAdd('SEEK FAIL: ' + e.message, 'error');
                    }
                    state.lastLoadedStartSec = targetStartSec;
                }
                state.driftCheckCount++;
            }
        }

        if (!state.isPlaying) {
            try {
                if (state.player.getPlayerState && state.player.getPlayerState() === 1) {
                    state.player.pauseVideo();
                }
            } catch (e) { /* ignore */ }
        }

        let playerStateCode = -1;
        try { playerStateCode = state.player.getPlayerState(); } catch (e) { /* ignore */ }
        const actualId = getCurrentVideoId();
        const actualTrack = getTrackByVideoId(actualId);

        if (state.lastLoadedVideoId && actualId && actualId !== state.lastLoadedVideoId) {
            debugLogAdd('DESYNC cel=' + targetVideoId + ' załadowany=' + state.lastLoadedVideoId + ' faktyczny=' + actualId, 'warn');
        }

        if (playerStateCode === 1 && actualTrack) {
            updateUI(program.displayName, actualTrack.title, 'live');
        } else if (dom.trackTitle.textContent === '\u2014' && found.track) {
            updateUI(program.displayName, found.track.title, 'live');
        } else if (actualTrack) {
            updateUI(program.displayName, actualTrack.title, 'live');
        }
    }

    function handleIntro(program) {
        if (!state.introActive) {
            state.introActive = true;
            try { state.player.pauseVideo(); } catch (e) { /* ignore */ }
        }
        updateUI(program.displayName, 'Intro', 'live');
    }

    function getCurrentVideoId() {
        try {
            const data = state.player.getVideoData();
            return data && data.video_id ? data.video_id : null;
        } catch (e) {
            return null;
        }
    }

    function getTrackByVideoId(videoId) {
        if (!videoId || !state.currentShuffled) return null;
        return state.currentShuffled.find(t => t.id === videoId) || null;
    }

    function refreshDisplayFromPlayer(programName, fallbackTitle) {
        const actualId = getCurrentVideoId();
        const actualTrack = getTrackByVideoId(actualId);
        if (actualTrack) {
            updateUI(programName, actualTrack.title, 'live');
        } else if (fallbackTitle) {
            updateUI(programName, fallbackTitle, 'live');
        }
    }

    function safeGetCurrentTime() {
        try {
            return state.player.getCurrentTime();
        } catch (e) {
            return null;
        }
    }

    function startSyncLoop() {
        if (state.syncIntervalId) return;
        performSync();
        state.syncIntervalId = setInterval(function() {
            performSync();
            updateDebugState();
        }, CONFIG.SYNC_INTERVAL_MS);
    }

    function stopSyncLoop() {
        if (state.syncIntervalId) {
            clearInterval(state.syncIntervalId);
            state.syncIntervalId = null;
        }
    }

    /* ============================================================
       AKTUALIZACJA UI
       ============================================================ */
    function updateUI(programName, trackName, status) {
        if (dom.currentProgram.textContent !== programName) {
            dom.currentProgram.textContent = programName;
        }
        if (dom.trackTitle.textContent !== trackName) {
            dom.trackTitle.textContent = trackName;
        }
        setStatus(status === 'live' ? 'NA ŻYWO' : status.toUpperCase(), status === 'live' ? 'online' : 'offline');
    }

    function setStatus(text, stateName) {
        dom.statusText.textContent = text;
        dom.statusIndicator.classList.remove('is-online', 'is-error', 'is-offline');
        if (stateName === 'online') dom.statusIndicator.classList.add('is-online');
        else if (stateName === 'error') dom.statusIndicator.classList.add('is-error');
    }

    function setPlaying(playing) {
        state.isPlaying = playing;
        if (playing) {
            dom.playButton.classList.add('is-playing');
            dom.playLabel.textContent = 'SŁUCHASZ RADIA';
        } else {
            dom.playButton.classList.remove('is-playing');
            dom.playLabel.textContent = 'WŁĄCZ RADIO';
        }
    }

    /* ============================================================
       AUTORYZACJA
       ============================================================ */
    function tryAuthorize(submittedPassword) {
        if (submittedPassword === CONFIG.PASSWORD) {
            dom.passwordError.textContent = '';
            dom.passwordModal.classList.add('hidden');
            dom.radioApp.classList.remove('hidden');
            dom.radioApp.setAttribute('aria-hidden', 'false');
            state.authorized = true;
            initializeRadio();
            return true;
        }
        return false;
    }

    function handlePasswordSubmit(event) {
        event.preventDefault();
        const value = dom.passwordInput.value;
        if (tryAuthorize(value)) return;
        dom.passwordError.textContent = 'Nieprawidłowe hasło';
        dom.passwordInput.value = '';
        dom.passwordInput.focus();
        shakeModal();
    }

    function shakeModal() {
        const content = dom.passwordModal.querySelector('.modal-content');
        content.style.animation = 'none';
        void content.offsetWidth;
        content.style.animation = 'shake 0.4s ease';
    }

    /* ============================================================
       INICJALIZACJA RADIA
       ============================================================ */
    function isFileProtocol() {
        return window.location.protocol === 'file:';
    }

    function showFileProtocolWarning() {
        const isLocal = isFileProtocol();
        const message = isLocal
            ? '⚠️ Otwierasz plik bezpośrednio (file://) - YouTube API i playlisty mogą nie działać. Użyj serwera WWW (np. GitHub Pages, http-server).'
            : '⚠️ Nie udało się pobrać plików konfiguracyjnych - działam na wbudowanych danych.';
        showNotice(message, isLocal ? 'critical' : 'warning');
    }

    async function initializeRadio() {
        if (state.initStarted) return;
        state.initStarted = true;

        setStatus('Ładowanie...', 'offline');

        await syncClockWithAPI();

        let usingFallback = false;

        try {
            const result = await fetchText('schedule.txt');
            state.schedule = parseSchedule(result.text);
            if (result.source === 'wbudowane') {
                usingFallback = true;
            }
        } catch (e) {
            console.error('schedule.txt error', e);
            setStatus('Błąd harmonogramu: ' + e.message, 'error');
            return;
        }

        const playlistFiles = [];
        for (let i = 0; i < state.schedule.length; i++) {
            const f = state.schedule[i].playlist;
            if (playlistFiles.indexOf(f) === -1) playlistFiles.push(f);
        }

        const fetchPromises = playlistFiles.map(async (file) => {
            try {
                const result = await fetchText(file);
                state.playlists[file] = parsePlaylist(result.text);
                if (result.source === 'wbudowane') usingFallback = true;
            } catch (e) {
                console.warn('Playlist fetch failed: ' + file, e);
                state.playlists[file] = [];
            }
        });

        await Promise.all(fetchPromises);

        let allValid = true;
        for (let i = 0; i < playlistFiles.length; i++) {
            if (!state.playlists[playlistFiles[i]] || state.playlists[playlistFiles[i]].length === 0) {
                setStatus('Brak utworów: ' + playlistFiles[i], 'error');
                allValid = false;
            }
        }

        if (!allValid) return;

        if (usingFallback) {
            showFileProtocolWarning();
        }

        loadYouTubeAPI();

        setTimeout(() => {
            if (!state.playerReady) {
                if (isFileProtocol()) {
                    setStatus('YouTube API nie działa na file://', 'error');
                    showFileProtocolWarning();
                } else {
                    setStatus('YouTube API - timeout', 'error');
                }
            }
        }, 12000);

        startSyncLoop();

        createDebugOverlay();

        dom.playButton.addEventListener('click', handlePlayToggle);
    }

    function showNotice(message, severity) {
        let notice = document.getElementById('radioNotice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'radioNotice';
            notice.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);padding:0.75rem 1.25rem;border-radius:10px;font-size:0.8rem;letter-spacing:0.03em;z-index:100;max-width:92%;text-align:center;backdrop-filter:blur(8px);line-height:1.5;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
            document.body.appendChild(notice);
        }
        let bg, border, color;
        if (severity === 'critical') {
            bg = 'rgba(114,0,0,0.85)';
            border = '#f851d4';
            color = '#ffffff';
        } else if (severity === 'warning') {
            bg = 'rgba(245,196,74,0.18)';
            border = '#f5c44a';
            color = '#f5c44a';
        } else {
            bg = 'rgba(245,196,74,0.18)';
            border = '#f5c44a';
            color = '#f5c44a';
        }
        notice.style.background = bg;
        notice.style.border = '1px solid ' + border;
        notice.style.color = color;
        notice.innerHTML = message;
        notice.style.display = 'block';
        if (severity !== 'critical') {
            setTimeout(() => { if (notice) notice.style.display = 'none'; }, 8000);
        }
    }

    function handlePlayToggle() {
        if (state.isPlaying) {
            try { state.player.pauseVideo(); } catch (e) { /* ignore */ }
            setPlaying(false);
            setStatus('Wstrzymano', 'offline');
            debugLogAdd('Pauza', 'info');
            return;
        }
        state.isPlaying = true;
        setPlaying(true);
        if (!state.playerReady) {
            setStatus('Ładowanie odtwarzacza...', 'offline');
            debugLogAdd('Play (oczekuje na player)', 'info');
            return;
        }
        try {
            state.player.unMute();
            state.player.setVolume(100);
            state.player.playVideo();
        } catch (e) { debugLogAdd('playVideo fail: ' + e.message, 'error'); }
        performSync();
        setStatus('NA ŻYWO', 'online');
        debugLogAdd('Play', 'ok');
    }

    /* ============================================================
       NASŁUCHIWANIE NA ZAKŁADKĘ (visibility)
       ============================================================ */
    document.addEventListener('visibilitychange', function () {
        if (!state.authorized || !state.playerReady) return;
        if (document.hidden) {
            try { state.player.pauseVideo(); } catch (e) { /* ignore */ }
        } else if (state.isPlaying) {
            performSync();
            try { state.player.playVideo(); } catch (e) { /* ignore */ }
        }
    });

    window.addEventListener('beforeunload', function () {
        stopSyncLoop();
    });

    /* ============================================================
       START
       ============================================================ */
    if (dom.passwordForm) {
        dom.passwordForm.addEventListener('submit', handlePasswordSubmit);
    }

    if (dom.passwordInput) {
        dom.passwordInput.focus();
    }

    const style = document.createElement('style');
    style.textContent = '@keyframes shake { 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-8px);} 40%,80%{transform:translateX(8px);} }';
    document.head.appendChild(style);

    window.nicRadio = {
        disableDriftCheck: function() {
            state.driftCheckDisabled = true;
            console.log('[NiC] ✓ Korekta dryfu WYŁĄCZONA. Radio nie będzie korygować pozycji.');
        },
        enableDriftCheck: function() {
            state.driftCheckDisabled = false;
            state.lastDriftCheck = 0;
            console.log('[NiC] ✓ Korekta dryfu WŁĄCZONA (co 5s, próg 5s).');
        },
        status: function() {
            const pTime = safeGetCurrentTime();
            const pState = (function() { try { return state.player.getPlayerState(); } catch(e) { return '?'; }})();
            const states = { '-1':'unstarted','0':'ended','1':'playing','2':'paused','3':'buffering','5':'cued' };
            console.log('[NiC] === STATUS ===');
            console.log('  Czas systemu:  ', getSecondsOfDay().toFixed(0) + 's od północy');
            console.log('  Program:       ', state.lastProgramFile || '?');
            console.log('  Załadowane ID: ', state.lastLoadedVideoId || 'brak');
            console.log('  Player time:   ', pTime !== null ? pTime.toFixed(1) + 's' : '?');
            console.log('  Player state:  ', states[pState] || pState);
            console.log('  Drift check:   ', state.driftCheckDisabled ? 'WYŁĄCZONY' : 'włączony (5s próg)');
            console.log('  Video lock:    ', state.videoLoadLock ? 'zablokowany' : 'odblokowany');
        }
    };
    console.log('[NiC] Komendy konsoli: nicRadio.status(), nicRadio.disableDriftCheck(), nicRadio.enableDriftCheck()');

})();
