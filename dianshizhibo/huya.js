// ku9.js - 虎牙直播 FLV 地址解析（AntiCode 重签 · 长效版）
// 传参方式：item.id（推荐）/ item.url / ku9.js?id=xxx 都兼容
// 可选：item.cdn = "TX" | "AL" | "HS" 指定线路（默认 TX，对齐参考里的长效地址）
//
// 改动说明：
//   mp.huya.com/cache.php 返回的 multiLine.url / sFlvAntiCode 是 ctype=tars_mp 的
//   「短租约」链接，直接拼出来只能播一秒。真实客户端会用 fm 模板重算 wsSecret，
//   切成 ctype=huya_adr 的长效签名（租约 6 小时），本文件即实现该重签流程。
//   参考里的 https://<hash>.v.smtcdns.net/<原host>/... 是 CDN 302 调度层下发的
//   最终地址（带 TxLiveCode / dispatch_from / tencent_test_client_ip 等服务端参数），
//   本地无法也不必伪造：播放器请求下面输出的官方 CDN 地址时会自动跟随到它。

function main(item) {
    var roomId = resolveRoomId(item);
    if (!roomId) {
        return JSON.stringify({ error: "没拿到频道号", debug: collectEnv(item) });
    }

    var apiUrl = "https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=" + roomId;
    var text = httpGet(apiUrl);
    if (!text) {
        return JSON.stringify({ error: "请求接口失败", debug: collectEnv(item) });
    }

    var json;
    try { json = JSON.parse(text); }
    catch (e) {
        return JSON.stringify({
            error: "接口返回非JSON",
            raw: String(text).slice(0, 300),
            debug: collectEnv(item)
        });
    }

    var data = json && json.data;
    if (data && data.liveStatus && data.liveStatus !== "ON" && data.realLiveStatus !== "ON") {
        return JSON.stringify({
            error: "直播间未开播",
            liveStatus: data.liveStatus,
            debug: collectEnv(item)
        });
    }

    var built = buildFlvUrl(data, item);
    if (!built || !built.url) {
        return JSON.stringify({
            error: "未找到可重签的FLV地址",
            hint: "接口的 sFlvAntiCode / newCFlvAntiCode 缺少 fm 模板，或线路结构已变更",
            debug: collectEnv(item)
        });
    }

    return JSON.stringify({ url: built.url });
}

/* ---------- 获取频道号：多路兜底 ---------- */
function resolveRoomId(item) {
    var candidates = [];
    if (item) {
        if (item.id) candidates.push(item.id);
        if (item.url) candidates.push(item.url);
        if (item.ext) candidates.push(item.ext);
        if (item.roomId) candidates.push(item.roomId);
    }
    try { if (typeof location !== "undefined" && location.search) candidates.push(location.search); } catch (e) {}
    try { if (typeof location !== "undefined" && location.href) candidates.push(location.href); } catch (e) {}
    try { if (typeof query !== "undefined" && query) candidates.push(JSON.stringify(query)); } catch (e) {}
    try { if (typeof id !== "undefined" && id) candidates.push(id); } catch (e) {}

    for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (c == null) continue;
        var s = String(c).trim();
        if (!s) continue;
        // 纯数字直接就是房间号
        if (/^\d+$/.test(s)) return s;
        // 从 URL/query 里提取 id / roomid / room_id
        var m = s.match(/(?:[?&]|^)(?:id|roomid|room_id)=([^&\s]+)/i);
        if (m && /^\d+/.test(m[1])) return decodeURIComponent(m[1]);
        // 兜底：字符串中第一段连续数字（>=3位）
        var m2 = s.match(/(\d{3,})/);
        if (m2) return m2[1];
    }
    return null;
}

/* ---------- 发 HTTP 请求：多路兜底 ---------- */
function httpGet(url) {
    var fns = [];
    try { if (typeof request === "function") fns.push(function () { return request(url); }); } catch (e) {}
    try { if (typeof ku9 !== "undefined" && typeof ku9.request === "function") fns.push(function () { return ku9.request(url); }); } catch (e) {}
    try { if (typeof http !== "undefined" && typeof http.get === "function") fns.push(function () { return http.get(url); }); } catch (e) {}
    try { if (typeof $http !== "undefined" && typeof $http.get === "function") fns.push(function () { return $http.get(url); }); } catch (e) {}
    try { if (typeof req === "function") fns.push(function () { return req(url); }); } catch (e) {}

    for (var i = 0; i < fns.length; i++) {
        try {
            var r = fns[i]();
            if (typeof r === "string" && r) return r;
            if (r && typeof r === "object") {
                if (typeof r.body === "string") return r.body;
                if (typeof r.content === "string") return r.content;
                if (typeof r.data === "string") return r.data;
            }
        } catch (e) {}
    }
    return null;
}

/* ---------- 组装长效 FLV 地址 ---------- */
function buildFlvUrl(data, item) {
    if (!data || !data.stream) return null;

    var uid = String(pickUid(data));
    var prefer = (item && item.cdn) ? String(item.cdn).toUpperCase() : "";

    // 路径 A：baseSteamInfoList（字段最全，优先 newCFlvAntiCode）
    var list = (data.stream.baseSteamInfoList) || [];
    var ordered = orderStreams(list, prefer);
    for (var i = 0; i < ordered.length; i++) {
        var s = ordered[i];
        if (!s || !s.sFlvUrl || !s.sStreamName) continue;
        var anti = s.newCFlvAntiCode || s.sFlvAntiCode || "";
        if (!anti) continue;
        var query = rebuildAntiCode(anti, String(s.sStreamName), uid);
        if (!query) continue;
        var base = normalize(s.sFlvUrl) + "/" + s.sStreamName + "." + (s.sFlvUrlSuffix || "flv");
        return { url: base + "?" + query, cdn: s.sCdnType || "" };
    }

    // 路径 B：stream.flv.multiLine[].url（已是完整地址，拆开后重签）
    var lines = (data.stream.flv && data.stream.flv.multiLine) || [];
    for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var raw = line && line.url;
        if (!raw || raw.indexOf(".flv") === -1) continue;
        raw = decodeHtml(raw);
        var pos = raw.indexOf("?");
        if (pos < 0) continue;
        var path = raw.substring(0, pos);
        var segs = path.split("/");
        var name = segs[segs.length - 1].replace(/\.flv$/i, "");
        if (!name) continue;
        var query2 = rebuildAntiCode(raw.substring(pos + 1), name, uid);
        if (!query2) continue;
        return { url: normalize(path) + "?" + query2, cdn: line.cdnType || "" };
    }
    return null;
}

/* ---------- 线路选择：默认 TX（对齐参考），可用 item.cdn 覆盖 ---------- */
function orderStreams(list, prefer) {
    var order = prefer ? [prefer, "TX", "HS", "AL"] : ["TX", "HS", "AL"];
    var picked = [], seen = {}, k, i;
    for (k = 0; k < order.length; k++) {
        for (i = 0; i < list.length; i++) {
            if (seen[i] || !list[i]) continue;
            if (String(list[i].sCdnType || "").toUpperCase() === order[k]) {
                picked.push(list[i]);
                seen[i] = 1;
            }
        }
    }
    for (i = 0; i < list.length; i++) {
        if (!seen[i] && list[i]) picked.push(list[i]);
    }
    return picked;
}

/* ---------- 观众 uid：优先用主播 uid（与参考一致） ---------- */
function pickUid(data) {
    if (data.profileInfo && data.profileInfo.uid) return data.profileInfo.uid;
    if (data.chTopId) return data.chTopId;
    var list = (data.stream && data.stream.baseSteamInfoList) || [];
    if (list[0] && list[0].lPresenterUid) return list[0].lPresenterUid;
    // 回退：匿名观众 uid（13 位，落在官方客户端使用的区间内）
    return Math.floor(1400000000000 + Math.random() * 100000000000);
}

/* ---------- 核心：重算 antiCode，把 tars_mp 短租约换成 huya_adr 长效签名 ----------
   fm 经 base64 解码得到模板：DWq8BcJ3h6DJt6TY_$0_$1_$2_$3
     $0 -> uid          $1 -> sStreamName
     $2 -> md5(seqid|ctype|t)   $3 -> wsTime
   模板整体再取一次 md5 即为新的 wsSecret。
------------------------------------------------------------------------------ */
function rebuildAntiCode(antiCode, streamName, uid) {
    var q = parseQuery(antiCode);
    if (!q.fm) return null;

    var tpl;
    try { tpl = base64Decode(decodeURIComponent(q.fm)); }
    catch (e) { return null; }
    if (!tpl || tpl.indexOf("$1") === -1) return null;

    var nowSec = Math.floor(nowMs() / 1000);
    var wsTime = (nowSec + 21600).toString(16);        // 6 小时租约
    var ctype = "huya_adr";
    var t = q.t || "102";
    var seqid = String(uid) + String(nowSec);           // 必须字符串拼接，不能数字相加
    var ss = md5(seqid + "|" + ctype + "|" + t);

    // 用 split/join 而非 replace：避免 $1 被当成正则捕获组
    var sign = tpl;
    sign = sign.split("$0").join(String(uid));
    sign = sign.split("$1").join(String(streamName));
    sign = sign.split("$2").join(ss);
    sign = sign.split("$3").join(wsTime);
    var wsSecret = md5(sign);

    var out = [];
    out.push("wsSecret=" + wsSecret);
    out.push("wsTime=" + wsTime);
    out.push("ctype=" + ctype);
    out.push("seqid=" + seqid);
    out.push("uid=" + String(uid));
    out.push("fs=" + (q.fs || "bgct"));
    out.push("ver=1");
    out.push("t=" + encodeURIComponent(t));
    return out.join("&");
}

/* ---------- 工具 ---------- */
function nowMs() { return new Date().getTime(); }

function parseQuery(str) {
    var out = {};
    var parts = String(str).replace(/^\?/, "").split("&");
    for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var kv = parts[i].split("=");
        var k = kv.shift();
        if (!k) continue;
        var v = kv.join("=");
        try { v = decodeURIComponent(v); } catch (e) {}
        out[k] = v;
    }
    return out;
}

function normalize(base) {
    var s = String(base).replace(/\/+$/, "");
    if (s.indexOf("http://") === 0) s = "https://" + s.substring(7);
    else if (s.indexOf("//") === 0) s = "https:" + s;
    return s;
}

function base64Decode(input) {
    var key = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var s = String(input).replace(/[^A-Za-z0-9+/=]/g, "");
    var out = "", i = 0, e1, e2, e3, e4;
    while (i < s.length) {
        e1 = key.indexOf(s.charAt(i++));
        e2 = key.indexOf(s.charAt(i++));
        e3 = key.indexOf(s.charAt(i++));
        e4 = key.indexOf(s.charAt(i++));
        if (e1 < 0) e1 = 64;
        if (e2 < 0) e2 = 64;
        if (e3 < 0) e3 = 64;
        if (e4 < 0) e4 = 64;
        out += String.fromCharCode((e1 << 2) | (e2 >> 4));
        if (e3 !== 64) out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
        if (e4 !== 64) out += String.fromCharCode(((e3 & 3) << 6) | e4);
    }
    return out;
}

function decodeHtml(str) {
    return String(str).replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

/* ---------- 自检：返回环境信息，便于排错 ---------- */
function collectEnv(item) {
    var env = {};
    try { env.item = item; } catch (e) { env.item = "err"; }
    try {
        env.location = (typeof location !== "undefined")
            ? { search: location.search, href: location.href }
            : null;
    } catch (e) { env.location = "err"; }
    try { env.query = (typeof query !== "undefined") ? query : null; } catch (e) {}
    try {
        env.api = {
            request: typeof request,
            ku9: typeof ku9,
            http: typeof http,
            fetch: typeof fetch,
            $http: typeof $http
        };
    } catch (e) {}
    return env;
}

/* ---------- 纯 JS MD5（不依赖 atob / crypto / 外部库） ---------- */
function md5(str) {
    function add(x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    function rol(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
    function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

    var bytes = [], i, c;
    for (i = 0; i < str.length; i++) {
        c = str.charCodeAt(i);
        if (c < 0x80) bytes.push(c);
        else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
        else bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    var len = bytes.length * 8;
    var x = [];
    for (i = 0; i < bytes.length; i += 4) {
        x.push((bytes[i] || 0) | ((bytes[i + 1] || 0) << 8) |
               ((bytes[i + 2] || 0) << 16) | ((bytes[i + 3] || 0) << 24));
    }
    x[len >> 5] |= 0x80 << (len % 32);
    var need = (((len + 64) >>> 9) << 4) + 15;
    while (x.length < need) x.push(0);
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    var a = 1732584193, b = -271733879, c0 = -1732584194, d = 271733878;
    var oa, ob, oc, od;
    for (i = 0; i < x.length; i += 16) {
        oa = a; ob = b; oc = c0; od = d;
        a = ff(a, b, c0, d, x[i     ],  7, -680876936);
        d = ff(d, a, b, c0, x[i +  1], 12, -389564586);
        c0 = ff(c0, d, a, b, x[i +  2], 17,  606105819);
        b = ff(b, c0, d, a, x[i +  3], 22, -1044525330);
        a = ff(a, b, c0, d, x[i +  4],  7, -176418897);
        d = ff(d, a, b, c0, x[i +  5], 12,  1200080426);
        c0 = ff(c0, d, a, b, x[i +  6], 17, -1473231341);
        b = ff(b, c0, d, a, x[i +  7], 22, -45705983);
        a = ff(a, b, c0, d, x[i +  8],  7,  1770035416);
        d = ff(d, a, b, c0, x[i +  9], 12, -1958414417);
        c0 = ff(c0, d, a, b, x[i + 10], 17, -42063);
        b = ff(b, c0, d, a, x[i + 11], 22, -1990404162);
        a = ff(a, b, c0, d, x[i + 12],  7,  1804603682);
        d = ff(d, a, b, c0, x[i + 13], 12, -40341101);
        c0 = ff(c0, d, a, b, x[i + 14], 17, -1502002290);
        b = ff(b, c0, d, a, x[i + 15], 22,  1236535329);

        a = gg(a, b, c0, d, x[i +  1],  5, -165796510);
        d = gg(d, a, b, c0, x[i +  6],  9, -1069501632);
        c0 = gg(c0, d, a, b, x[i + 11], 14,  643717713);
        b = gg(b, c0, d, a, x[i +  0], 20, -373897302);
        a = gg(a, b, c0, d, x[i +  5],  5, -701558691);
        d = gg(d, a, b, c0, x[i + 10],  9,  38016083);
        c0 = gg(c0, d, a, b, x[i + 15], 14, -660478335);
        b = gg(b, c0, d, a, x[i +  4], 20, -405537848);
        a = gg(a, b, c0, d, x[i +  9],  5,  568446438);
        d = gg(d, a, b, c0, x[i + 14],  9, -1019803690);
        c0 = gg(c0, d, a, b, x[i +  3], 14, -187363961);
        b = gg(b, c0, d, a, x[i +  8], 20,  1163531501);
        a = gg(a, b, c0, d, x[i + 13],  5, -1444681467);
        d = gg(d, a, b, c0, x[i +  2],  9, -51403784);
        c0 = gg(c0, d, a, b, x[i +  7], 14,  1735328473);
        b = gg(b, c0, d, a, x[i + 12], 20, -1926607734);

        a = hh(a, b, c0, d, x[i +  5],  4, -378558);
        d = hh(d, a, b, c0, x[i +  8], 11, -2022574463);
        c0 = hh(c0, d, a, b, x[i + 11], 16,  1839030562);
        b = hh(b, c0, d, a, x[i + 14], 23, -35309556);
        a = hh(a, b, c0, d, x[i +  1],  4, -1530992060);
        d = hh(d, a, b, c0, x[i +  4], 11,  1272893353);
        c0 = hh(c0, d, a, b, x[i +  7], 16, -155497632);
        b = hh(b, c0, d, a, x[i + 10], 23, -1094730640);
        a = hh(a, b, c0, d, x[i + 13],  4,  681279174);
        d = hh(d, a, b, c0, x[i +  0], 11, -358537222);
        c0 = hh(c0, d, a, b, x[i +  3], 16, -722521979);
        b = hh(b, c0, d, a, x[i +  6], 23,  76029189);
        a = hh(a, b, c0, d, x[i +  9],  4, -640364487);
        d = hh(d, a, b, c0, x[i + 12], 11, -421815835);
        c0 = hh(c0, d, a, b, x[i + 15], 16,  530742520);
        b = hh(b, c0, d, a, x[i +  2], 23, -995338651);

        a = ii(a, b, c0, d, x[i +  0],  6, -198630844);
        d = ii(d, a, b, c0, x[i +  7], 10,  1126891415);
        c0 = ii(c0, d, a, b, x[i + 14], 15, -1416354905);
        b = ii(b, c0, d, a, x[i +  5], 21, -57434055);
        a = ii(a, b, c0, d, x[i + 12],  6,  1700485571);
        d = ii(d, a, b, c0, x[i +  3], 10, -1894986606);
        c0 = ii(c0, d, a, b, x[i + 10], 15, -1051523);
        b = ii(b, c0, d, a, x[i +  1], 21, -2054922799);
        a = ii(a, b, c0, d, x[i +  8],  6,  1873313359);
        d = ii(d, a, b, c0, x[i + 15], 10, -30611744);
        c0 = ii(c0, d, a, b, x[i +  6], 15, -1560198380);
        b = ii(b, c0, d, a, x[i + 13], 21,  1309151649);
        a = ii(a, b, c0, d, x[i +  4],  6, -145523070);
        d = ii(d, a, b, c0, x[i + 11], 10, -1120210379);
        c0 = ii(c0, d, a, b, x[i +  2], 15,  718787259);
        b = ii(b, c0, d, a, x[i +  9], 21, -343485551);

        a = add(a, oa); b = add(b, ob); c0 = add(c0, oc); d = add(d, od);
    }

    var hex = "0123456789abcdef";
    var out = "", n, k, byte;
    var words = [a, b, c0, d];
    for (k = 0; k < 4; k++) {
        n = words[k];
        for (i = 0; i < 4; i++) {
            byte = (n >>> (i * 8)) & 0xFF;
            out += hex.charAt(byte >> 4) + hex.charAt(byte & 15);
        }
    }
    return out;
}
