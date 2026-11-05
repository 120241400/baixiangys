/**
 * 凤凰直播 - 酷9专用脚本
 * 用法：保存到酷9的 js 文件夹，在频道列表中使用
 * http://你的域名/ku9/js/feng-live.js?id=任意值
 */

function main(item) {
    // 1. 配置 API 地址（可保留原样）
    var apiUrl = 'https://api.fengshows.cn/hub/live/auth-url?live_qa=hd&live_id=f7f48462-9b13-485b-8101-7b54716411ec';

    // 2. 使用酷9内置的 request 方法请求接口
    // ku9.request(url, method, headers, body) 是酷9提供的网络请求函数
    var res = ku9.request(apiUrl, 'GET', {
        'Cache-Control': 'no-store'
    });

    // 3. 处理请求失败的情况
    if (!res || res.code !== 200) {
        // 返回空地址，酷9会提示播放失败
        return { url: '' };
    }

    // 4. 解析响应数据
    var data;
    try {
        // 酷9的 res.body 可能是字符串或已解析的对象，这里做兼容处理
        data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
    } catch (e) {
        return { url: '' };
    }

    // 5. 递归查找 flv 地址（逻辑与浏览器端一致）
    var flvUrl = extractFlv(data);

    // 6. 返回酷9标准格式的播放地址对象
    if (flvUrl) {
        return { url: flvUrl };
    } else {
        return { url: '' };
    }
}

/**
 * 递归查找 flv 地址（保留原逻辑）
 */
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