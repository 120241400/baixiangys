/*!
 * 凤凰香港 - 定时获取直播地址并弹出新窗口播放
 * 用法：<script src="live-popup.js"></script>
 * 可选：在引入前设置 window.FengLiveConfig = {...}
 */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    apiUrl: 'https://api.fengshows.cn/hub/live/auth-url?live_qa=hd&live_id=15e02d92-1698-416c-af2f-3e9a872b4d78',
    minutes: 10
  }, global.FengLiveConfig || {});

  var PERIOD = Math.max(1, +cfg.minutes || 10) * 60000;
  var busy = false, timer = null, popWin = null;

  /* 递归找 flv 地址 */
  function extractFlv(o, depth) {
    depth = depth || 0;
    if (!o || depth > 6) return null;
    if (typeof o === 'string') {
      return /^https?:\/\/\S+\.flv(\?|$)/i.test(o.trim()) ? o.trim() : null;
    }
    if (Array.isArray(o)) {
      for (var i = 0; i < o.length; i++) {
        var r = extractFlv(o[i], depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (typeof o === 'object') {
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
        var rr = extractFlv(o[k], depth + 1);
        if (rr) return rr;
      }
    }
    return null;
  }

  function getFlvUrl() {
    return fetch(cfg.apiUrl, { cache: 'no-store', credentials: 'omit', mode: 'cors' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var u = extractFlv(d);
        if (!u) throw new Error('无 flv 地址');
        return u;
      });
  }

  /* flv.js 弹窗播放 */
  function openPopup(url) {
    if (!url) return false;
    try { if (popWin && !popWin.closed) popWin.close(); } catch (e) {}
    var win = global.open();
    if (!win || win.closed) return false;

    win.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>凤凰直播</title></head>' +
      '<body style="margin:0;background:#000">' +
      '<video id="v" autoplay muted playsinline style="position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>' +
      '<script src="https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.min.js"><\/script>' +
      '<script>' +
      'var p=flvjs.createPlayer({type:"flv",url:' + JSON.stringify(url) + '});' +
      'p.attachMediaElement(document.getElementById("v"));p.load();p.play();' +
      '<\/script></body></html>'
    );
    win.document.close();
    popWin = win;
    return true;
  }

  function run() {
    if (busy) return;
    busy = true;
    getFlvUrl().then(openPopup).catch(function () {}).then(function () {
      busy = false;
      clearTimeout(timer);
      timer = setTimeout(run, PERIOD);
    });
  }

  global.FengLivePopup = { start: function () { run(); }, stop: function () { clearTimeout(timer); } };
  run();
})(window);