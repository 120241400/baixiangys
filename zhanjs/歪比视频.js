var rule = {
    author: '书虫/250613/第2版',
    title: '歪比巴卜',
    类型: '影视',
    //https://www.歪比巴卜.com/
    //https://wbbb1.com/
    host: 'https://v.wbbb1.com',
    hostJs: ``,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://v.wbbb1.com/'
    },
    编码: 'utf-8',
    timeout: 5000,
    homeUrl: '/',
    
    // 分类页URL格式待确认，先用占位
    url: 'https://v.wbbb1.com/fyfilter/',
    filter_url: '{{fl.cateId}}-{{fl.area}}-------fypage---{{fl.year}}',
    
    // 详情页: /detail/111696.html
    detailUrl: 'https://v.wbbb1.com/detail/fyid.html',
    
    // 搜索: /search/关键词-------------.html
    // 注意：后面有13个"-"占位符
    searchUrl: '/search/**-------------.html',
    搜索: '*',
    
    searchable: 1,
    quickSearch: 1,
    filterable: 1,
    limit: 10,
    double: false,
    class_name: '电影&电视剧&综艺&动漫',
    class_url: '1&2&3&4',

    filter_def: {
        1: { cateId: '1' },
        2: { cateId: '2' },
        3: { cateId: '3' },
        4: { cateId: '4' }
    },
    
    // 推荐 - 需要根据首页实际HTML结构调整
    推荐: 'a:has(.lazyload);a&&title;.lazyload&&data-original;.module-item-note&&Text;a&&href',
    
    // 一级 - 需要根据分类页实际HTML结构调整
    一级: 'a:has(.module-item-pic);a&&title;.lazyload&&data-original;.module-item-note&&Text;a&&href',

    // 二级 - 详情页解析（由于无法抓取HTML，以下为推测结构）
    // 如果实际HTML结构不同，需要调整选择器
    二级: `js:
let html = request(input);
VOD = {};
VOD.vod_id = input;
VOD.vod_name = pdfh(html, 'h1&&Text') || pdfh(html, '.title&&Text') || pdfh(html, '.video-title&&Text');
VOD.type_name = pdfh(html, '.type&&Text') || pdfh(html, '.tag&&Text') || '';
VOD.vod_pic = pd(html, '.lazyload&&data-original', input) || pd(html, '.pic&&img&&src', input) || '';
VOD.vod_remarks = pdfh(html, '.status&&Text') || pdfh(html, '.update&&Text') || '';
VOD.vod_year = pdfh(html, '.year&&Text') || '';
VOD.vod_area = pdfh(html, '.area&&Text') || '';
VOD.vod_director = pdfh(html, '.director&&Text') || '';
VOD.vod_actor = pdfh(html, '.actor&&Text') || '';
VOD.vod_content = '剧情介绍:' + (pdfh(html, '.content&&Text') || pdfh(html, '.desc&&Text') || '');

// 提取播放线路和选集
// 播放页URL格式: /vplay/{id}-{source}-{episode}.html
let id = input.match(/detail\\/(\\d+)\\.html/)[1];

// 尝试从详情页提取所有播放源链接
let playLinks = pdfa(html, 'a[href*="/vplay/"]');
let sources = {};
playLinks.forEach(it => {
    let href = pdfh(it, 'a&&href');
    let match = href.match(/vplay\\/(\\d+)-(\\d+)-(\\d+)\\.html/);
    if (match) {
        let sourceId = match[2];
        let ep = match[3];
        let text = pdfh(it, 'a&&Text');
        if (!sources[sourceId]) sources[sourceId] = [];
        sources[sourceId].push(text + '$' + href);
    }
});

// 如果没有提取到，构造默认播放链接（从播放页反推）
let sourceIds = [];
let sourceTexts = [];
let playUrls = [];

if (Object.keys(sources).length === 0) {
    // 尝试常见线路ID: 9(推荐), 10(蓝光4K) 等
    // 这里需要根据实际情况调整
    let knownSources = {'9': '推荐', '10': '蓝光4K'};
    for (let sid in knownSources) {
        sourceIds.push(knownSources[sid]);
        // 先放1集作为占位，实际集数需要从详情页获取
        playUrls.push('第1集$' + 'https://v.wbbb1.com/vplay/' + id + '-' + sid + '-1.html');
    }
} else {
    for (let sid in sources) {
        let sourceName = sid === '9' ? '推荐' : (sid === '10' ? '蓝光4K' : '线路' + sid);
        sourceIds.push(sourceName);
        playUrls.push(sources[sid].join('#'));
    }
}

VOD.vod_play_from = sourceIds.join('$$$');
VOD.vod_play_url = playUrls.join('$$$');
`,

    sniffer: 0,
    isVideo: 'http((?!http).){26,}\\.(m3u8|mp4|flv|avi|mkv|wmv|mpg|mpeg|mov|ts|3gp|rm|rmvb|asf|m4a|mp3|wma)',

    play_parse: true,
    
    // 播放解析 - 从播放页提取真实视频地址
    lazy: `js:
let html = request(input);
let kurl = '';
try {
    // 尝试常见播放器变量
    let kcode = html.match(/var player_.*?=(.*?)</);
    if (kcode) {
        kcode = JSON.parse(kcode[1]);
        kurl = kcode.url;
        if (kcode.encrypt == '1') {
            kurl = unescape(kurl);
        } else if (kcode.encrypt == '2') {
            kurl = unescape(base64Decode(kurl));
        }
    }
} catch(e) {
    // 尝试其他方式提取
    kurl = html.match(/url["']?\\s*[:=]\\s*["']([^"']+\\.m3u8|[^"']+\\.mp4)/)?.[1] || '';
}

if (kurl && /\\.(m3u8|mp4)/.test(kurl)) {
    input = { jx: 0, parse: 0, url: kurl };
} else {
    input = { jx: 0, parse: 1, url: input };
}
`,

    filter: {
        "1": [
            {
                "key": "cateId",
                "name": "类型",
                "value": [
                    {"n": "全部", "v": "1"},
                    {"n": "动作片", "v": "6"},
                    {"n": "喜剧片", "v": "7"},
                    {"n": "爱情片", "v": "8"},
                    {"n": "科幻片", "v": "9"},
                    {"n": "奇幻片", "v": "10"},
                    {"n": "恐怖片", "v": "11"},
                    {"n": "剧情片", "v": "12"},
                    {"n": "战争片", "v": "20"},
                    {"n": "纪录片", "v": "21"},
                    {"n": "动画片", "v": "26"},
                    {"n": "悬疑片", "v": "22"},
                    {"n": "冒险片", "v": "23"},
                    {"n": "犯罪片", "v": "24"},
                    {"n": "惊悚片", "v": "45"},
                    {"n": "歌舞片", "v": "46"},
                    {"n": "灾难片", "v": "47"},
                    {"n": "网络片", "v": "48"}
                ]
            },
            {
                "key": "area",
                "name": "地区",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "大陆", "v": "大陆"},
                    {"n": "香港", "v": "香港"},
                    {"n": "台湾", "v": "台湾"},
                    {"n": "美国", "v": "美国"},
                    {"n": "欧美", "v": "欧美"},
                    {"n": "日本", "v": "日本"},
                    {"n": "韩国", "v": "韩国"},
                    {"n": "泰国", "v": "泰国"},
                    {"n": "其他", "v": "其他"}
                ]
            },
            {
                "key": "year",
                "name": "年份",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "2026", "v": "2026"},
                    {"n": "2025", "v": "2025"},
                    {"n": "2024", "v": "2024"},
                    {"n": "2023", "v": "2023"},
                    {"n": "2022", "v": "2022"},
                    {"n": "2021", "v": "2021"},
                    {"n": "2020", "v": "2020"},
                    {"n": "2019", "v": "2019"},
                    {"n": "2018", "v": "2018"},
                    {"n": "2017", "v": "2017"},
                    {"n": "2016", "v": "2016"},
                    {"n": "2015", "v": "2015"},
                    {"n": "2014", "v": "2014"},
                    {"n": "2013", "v": "2013"},
                    {"n": "2012", "v": "2012"}
                ]
            }
        ],
        "2": [
            {
                "key": "cateId",
                "name": "类型",
                "value": [
                    {"n": "全部", "v": "2"},
                    {"n": "国产剧", "v": "13"},
                    {"n": "港台剧", "v": "14"},
                    {"n": "日剧", "v": "15"},
                    {"n": "韩剧", "v": "33"},
                    {"n": "欧美剧", "v": "16"},
                    {"n": "泰剧", "v": "34"},
                    {"n": "新马剧", "v": "35"},
                    {"n": "其他剧", "v": "25"}
                ]
            },
            {
                "key": "area",
                "name": "地区",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "内地", "v": "内地"},
                    {"n": "韩国", "v": "韩国"},
                    {"n": "香港", "v": "香港"},
                    {"n": "台湾", "v": "台湾"},
                    {"n": "日本", "v": "日本"},
                    {"n": "美国", "v": "美国"},
                    {"n": "泰国", "v": "泰国"},
                    {"n": "英国", "v": "英国"},
                    {"n": "新加坡", "v": "新加坡"},
                    {"n": "其他", "v": "其他"}
                ]
            },
            {
                "key": "year",
                "name": "年份",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "2026", "v": "2026"},
                    {"n": "2025", "v": "2025"},
                    {"n": "2024", "v": "2024"},
                    {"n": "2023", "v": "2023"},
                    {"n": "2022", "v": "2022"},
                    {"n": "2021", "v": "2021"},
                    {"n": "2020", "v": "2020"},
                    {"n": "2019", "v": "2019"},
                    {"n": "2018", "v": "2018"},
                    {"n": "2017", "v": "2017"},
                    {"n": "2016", "v": "2016"},
                    {"n": "2015", "v": "2015"},
                    {"n": "2014", "v": "2014"},
                    {"n": "2013", "v": "2013"},
                    {"n": "2012", "v": "2012"}
                ]
            }
        ],
        "3": [
            {
                "key": "cateId",
                "name": "类型",
                "value": [
                    {"n": "全部", "v": "3"},
                    {"n": "内地综艺", "v": "27"},
                    {"n": "港台综艺", "v": "28"},
                    {"n": "日本综艺", "v": "29"},
                    {"n": "韩国综艺", "v": "36"},
                    {"n": "欧美综艺", "v": "30"},
                    {"n": "新马泰综艺", "v": "37"},
                    {"n": "其他综艺", "v": "38"}
                ]
            },
            {
                "key": "area",
                "name": "地区",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "内地", "v": "内地"},
                    {"n": "港台", "v": "港台"},
                    {"n": "日韩", "v": "日韩"},
                    {"n": "欧美", "v": "欧美"}
                ]
            },
            {
                "key": "year",
                "name": "年份",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "2026", "v": "2026"},
                    {"n": "2025", "v": "2025"},
                    {"n": "2024", "v": "2024"},
                    {"n": "2023", "v": "2023"},
                    {"n": "2022", "v": "2022"},
                    {"n": "2021", "v": "2021"},
                    {"n": "2020", "v": "2020"},
                    {"n": "2019", "v": "2019"},
                    {"n": "2018", "v": "2018"},
                    {"n": "2017", "v": "2017"},
                    {"n": "2016", "v": "2016"},
                    {"n": "2015", "v": "2015"},
                    {"n": "2014", "v": "2014"},
                    {"n": "2013", "v": "2013"},
                    {"n": "2012", "v": "2012"}
                ]
            }
        ],
        "4": [
            {
                "key": "cateId",
                "name": "类型",
                "value": [
                    {"n": "全部", "v": "4"},
                    {"n": "国产动漫", "v": "31"},
                    {"n": "日本动漫", "v": "32"},
                    {"n": "韩国动漫", "v": "39"},
                    {"n": "港台动漫", "v": "40"},
                    {"n": "新马泰动漫", "v": "41"},
                    {"n": "欧美动漫", "v": "42"},
                    {"n": "其他动漫", "v": "43"}
                ]
            },
            {
                "key": "area",
                "name": "地区",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "国产", "v": "国产"},
                    {"n": "日本", "v": "日本"},
                    {"n": "欧美", "v": "欧美"},
                    {"n": "其他", "v": "其他"}
                ]
            },
            {
                "key": "year",
                "name": "年份",
                "value": [
                    {"n": "全部", "v": ""},
                    {"n": "2026", "v": "2026"},
                    {"n": "2025", "v": "2025"},
                    {"n": "2024", "v": "2024"},
                    {"n": "2023", "v": "2023"},
                    {"n": "2022", "v": "2022"},
                    {"n": "2021", "v": "2021"},
                    {"n": "2020", "v": "2020"},
                    {"n": "2019", "v": "2019"},
                    {"n": "2018", "v": "2018"},
                    {"n": "2017", "v": "2017"},
                    {"n": "2016", "v": "2016"},
                    {"n": "2015", "v": "2015"},
                    {"n": "2014", "v": "2014"},
                    {"n": "2013", "v": "2013"},
                    {"n": "2012", "v": "2012"}
                ]
            }
        ]
    }
}