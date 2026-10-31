/*!
 * 凤凰资讯 - 定时获取直播地址并弹出新窗口播放
 * 用法：<script src="live-popup.js"></script>
 * 可选：在引入前设置 window.FengLiveConfig = {...}
 */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    apiUrl: 'https://api.fengshows.cn/hub/live/auth-url?live_qa=hd&live_id=7c96b084-60e1-40a9-89c5-682b994fb680',
    proxy: '',
    minutes: 10,
    jsonpTimeout: 8000,
    autoStart: true,
    createUI: true,
    ui: {
      statusId: 'status',
      countId: 'count'
    }
  };

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  var userCfg = global.FengLiveConfig || {};
  var cfg = extend({}, DEFAULT_CONFIG, userCfg);
  cfg.ui = extend({}, DEFAULT_CONFIG.ui, userCfg.ui || {});

  var PERIOD = Math.max(1, Number(cfg.minutes) || 10) * 60 * 1000;

  var S = {
    busy: false,
    timer: null,
    tick: null,
    nextAt: 0,
    popWin: null,
    lastUrl: '',
    count: 0,
    started: false,
    statusEl: null,
    countEl: null,
    clickHandler: null,
    visibilityHandler: null
  };

  function byId(id) { return document.getElementById(id); }

  function ensureUI() {
    S.statusEl = byId(cfg.ui.statusId);
    S.countEl = byId(cfg.ui.countId);

    if (S.statusEl || !cfg.createUI) return;

    var panel = document.createElement('div');
    panel.id = 'feng-live-panel';
    panel.style.cssText = [
      'position:fixed',
      'left:0',
      'right:0',
      'bottom:18px',
      'z-index:2147483647',
      'text-align:center',
      'pointer-events:none',
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif'
    ].join(';');

    var status = document.createElement('div');
    status.id = cfg.ui.statusId;
    status.textContent = '正在获取直播地址…';
    status.style.cssText = [
      'display:inline-block',
      'padding:8px 16px',
      'border-radius:999px',
      'background:rgba(10,11,15,.72)',
      'color:#98a2b6',
      'font-size:15px',
      'font-weight:600',
      'letter-spacing:.08em',
      'backdrop-filter:blur(8px)'
    ].join(';');
    status.dataset.autoUi = '1';

    var count = document.createElement('div');
    count.id = cfg.ui.countId;
    count.textContent = '';
    count.style.cssText = [
      'margin-top:8px',
      'color:#6b7488',
      'font-size:12px',
      'letter-spacing:.08em',
      'font-variant-numeric:tabular-nums',
      'font-family:ui-monospace,Menlo,Consolas,monospace'
    ].join(';');
    count.dataset.autoUi = '1';

    panel.appendChild(status);
    panel.appendChild(count);
    (document.body || document.documentElement).appendChild(panel);

    S.statusEl = status;
    S.countEl = count;
  }

  var STATUS_COLORS = {
    '': '#98a2b6',
    wait: '#fcd34d',
    on: '#4ade80',
    err: '#fca5a5'
  };

  function setStatus(text, cls) {
    cls = cls || '';
    var el = S.statusEl;
    if (!el) return;

    el.textContent = text;
    el.className = 'sub ' + cls;

    if (el.dataset.autoUi === '1') {
      el.style.color = STATUS_COLORS[cls] || STATUS_COLORS[''];
    }
  }

  function setCount(text) {
    if (S.countEl) S.countEl.textContent = text || '';
  }

  /* 从任意 JSON 结构提取播放地址 */
  function extractUrl(o, depth) {
    depth = depth || 0;
    if (!o || depth > 6) return null;

    if (typeof o === 'string') {
      return /^https?:\/\/\S+/i.test(o.trim()) ? o.trim() : null;
    }

    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) {
        var r = extractUrl(o[i], depth + 1);
        if (r) return r;
      }
      return null;
    }

    if (typeof o === 'object') {
      var keys = ['live_url', 'flv_url', 'play_url', 'playUrl', 'url', 'm3u8', 'hls'];
      for (var k = 0; k < keys.length; k++) {
        var val = o[keys[k]];
        if (typeof val === 'string' && /^https?:\/\//i.test(val)) return val;
      }
      for (var key in o) {
        if (!Object.prototype.hasOwnProperty.call(o, key)) continue;
        var rr = extractUrl(o[key], depth + 1);
        if (rr) return rr;
      }
    }
    return null;
  }

  function tryFetch(url) {
    return fetch(url, { cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  function tryJsonp(url, timeout) {
    timeout = timeout || cfg.jsonpTimeout || 8000;
    return new Promise(function (resolve, reject) {
      var cb = '__fengLiveCb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('JSONP 超时'));
      }, timeout);

      function cleanup() {
        clearTimeout(timer);
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      global[cb] = function (data) {
        cleanup();
        resolve(data);
      };

      script.src = url + (url.indexOf('?') > -1 ? '&' : '?') +
        'callback=' + encodeURIComponent(cb) + '&_=' + Date.now();
      script.onerror = function () {
        cleanup();
        reject(new Error('JSONP 加载失败'));
      };
      (document.body || document.documentElement).appendChild(script);
    });
  }

  function getLiveUrl() {
    var plans = [
      function () { return tryFetch(cfg.apiUrl); },
      function () { return tryJsonp(cfg.apiUrl); }
    ];

    if (cfg.proxy) {
      plans.splice(1, 0, function () {
        return tryFetch(cfg.proxy + encodeURIComponent(cfg.apiUrl));
      });
      plans.push(function () {
        return tryJsonp(cfg.proxy + encodeURIComponent(cfg.apiUrl));
      });
    }

    var i = 0;
    function next() {
      if (i >= plans.length) {
        return Promise.reject(new Error('所有取数方式均失败'));
      }
      return plans[i++]().then(function (data) {
        var url = extractUrl(data);
        if (!url) throw new Error('返回中没有播放地址');
        return url;
      }).catch(function () {
        return next();
      });
    }

    return next();
  }

  function buildPopupHTML(url) {
    var safeUrl = JSON.stringify(url);
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>凤凰直播</title>'
      + '<style>'
      + 'html,body{margin:0;height:100%;background:#000;overflow:hidden}'
      + 'video{width:100%;height:100%;object-fit:contain;background:#000;display:block}'
      + '</style></head><body>'
      + '<video id="v" autoplay playsinline webkit-playsinline></video>'
      + '<script>'
      + '(function(){'
      + 'var v=document.getElementById("v");'
      + 'v.src=' + safeUrl + ';'
      + 'function go(){var p=v.play();if(p&&p.catch)p.catch(function(){});}'
      + 'v.addEventListener("loadedmetadata",go);'
      + 'v.addEventListener("canplay",go);'
      + 'go();'
      + '})();'
      + '<\/script></body></html>';
  }

  function openPopup(url) {
    if (!url) return false;

    try {
      if (S.popWin && !S.popWin.closed) S.popWin.close();
    } catch (e) {}
    S.popWin = null;

    var name = 'fengLiveWin_' + Date.now();
    var win = global.open('', name);
    if (!win || win.closed) return false;

    try {
      win.document.open();
      win.document.write(buildPopupHTML(url));
      win.document.close();
    } catch (e) {
      return false;
    }

    S.popWin = win;
    try { win.focus(); } catch (e) {}
    return true;
  }

  function run() {
    if (S.busy) return;
    S.busy = true;
    setStatus('正在获取直播地址…', 'wait');

    getLiveUrl().then(function (url) {
      S.lastUrl = url;
      S.count++;

      if (openPopup(url)) {
        setStatus('播放中 · 已弹出新地址', 'on');
      } else {
        setStatus('等待浏览器放行弹窗…', 'wait');
      }
    }).catch(function () {
      setStatus('获取失败，稍后重试', 'err');
    }).then(function () {
      S.busy = false;
      schedule();
    });
  }

  function schedule() {
    clearTimeout(S.timer);
    S.nextAt = Date.now() + PERIOD;
    S.timer = setTimeout(run, PERIOD);
    startTick();
  }

  function startTick() {
    clearInterval(S.tick);
    S.tick = setInterval(function () {
      if (!S.nextAt) return;

      var remain = Math.max(0, Math.round((S.nextAt - Date.now()) / 1000));
      var m = Math.floor(remain / 60);
      var ss = remain % 60;

      setCount(
        '下次换新地址 ' + (m < 10 ? '0' : '') + m + ':' +
        (ss < 10 ? '0' : '') + ss +
        '（已刷新 ' + S.count + ' 次）'
      );

      if (document.visibilityState === 'visible' &&
          Date.now() - S.nextAt > 1500 &&
          !S.busy) {
        run();
      }
    }, 500);
  }

  function onClick() {
    if (!S.lastUrl) return;
    if (S.popWin && !S.popWin.closed) return;
    openPopup(S.lastUrl);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' &&
        !S.busy &&
        S.nextAt &&
        Date.now() > S.nextAt) {
      run();
    }
  }

  function start() {
    if (S.started) return;
    S.started = true;

    ensureUI();
    setStatus('正在获取直播地址…', 'wait');

    S.clickHandler = onClick;
    S.visibilityHandler = onVisibilityChange;

    document.addEventListener('click', S.clickHandler);
    document.addEventListener('visibilitychange', S.visibilityHandler);

    run();
  }

  function stop() {
    clearTimeout(S.timer);
    clearInterval(S.tick);
    S.timer = null;
    S.tick = null;
    S.nextAt = 0;
    S.started = false;

    if (S.clickHandler) {
      document.removeEventListener('click', S.clickHandler);
      S.clickHandler = null;
    }
    if (S.visibilityHandler) {
      document.removeEventListener('visibilitychange', S.visibilityHandler);
      S.visibilityHandler = null;
    }
  }

  function runNow() {
    if (!S.started) start();
    else run();
  }

  function getState() {
    return {
      busy: S.busy,
      nextAt: S.nextAt,
      lastUrl: S.lastUrl,
      count: S.count,
      popupAlive: !!(S.popWin && !S.popWin.closed)
    };
  }

  global.FengLivePopup = {
    start: start,
    stop: stop,
    runNow: runNow,
    getState: getState
  };

  function boot() {
    if (cfg.autoStart) start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);