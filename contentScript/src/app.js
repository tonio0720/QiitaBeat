import axios from 'axios';
import $ from 'jquery';
import moment from 'moment';

import './style.scss';

// LGTMボタンを探す
let intervalid = setInterval(() => {
    if ($('.it-Actions_item-like').length > 0) {
        clearInterval(intervalid);
        setBeat();
    }
}, 100);

// storageからトークンを取得
async function getToken() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({ token: '' }, (items) => {
            resolve(items.token);
        });
    });
}

// QiitaAPIで記事情報取得
async function getItem(itemId, token) {
    const response = await axios.get(`https://qiita.com/api/v2/items/${itemId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    return response.data;
}

// QiitaAPIでLikeをすべて取得
async function getAllLikes(itemId, token) {
    const limit = 100;
    let page = 1;
    let likes = [];

    // APIで100件ずつ取得する
    let totalCnt;
    do {
        const response = await axios.get(`https://qiita.com/api/v2/items/${itemId}/likes?page=${page}&per_page=${limit}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        totalCnt = Number(response.headers['total-count']);
        likes = likes.concat(response.data);
    } while (page++ * limit < totalCnt);

    return likes;
}

async function setBeat() {
    // URLからitemidを取得
    const { pathname } = new URL(location.href);
    const { 2: itemid } = pathname.match(/\/(.*?)\/items\/(.*?)($|\/)/) || [];

    // トークン取得
    const token = await getToken();

    if (!token) {
        // トークンがないということは設定ができていない
        let $el = $(`
            <div class="qiitabeat-setting">
                <a>設定が必要です！</a>
            </div>
        `).insertAfter('.it-Actions_item-like');
        $el.find('a').click(() => {
            chrome.runtime.sendMessage({ options: true });
        });

        return;
    }

    // データ取得
    const item = await getItem(itemid, token);
    const likes = await getAllLikes(itemid, token);

    // 週ごとに集計
    const data = {};
    likes.forEach(({ created_at: createdAt }) => {
        const ymd = moment(createdAt).format('YYYY-WW');
        if (!data[ymd]) {
            data[ymd] = 0;
        }
        data[ymd]++;
    });

    const yws = [];
    const now = moment().add(1, 'days');
    const m = moment(item.created_at).add(-1, 'days');
    while (m < now) {
        yws.push(m.format('YYYY-WW'));
        m.add(1, 'days');
    }

    // チャート用のデータ作成
    const chartData = yws.map((ymd) => data[ymd] || 0);
    const max = Math.max(10, ...chartData);

    const points = chartData.map((value, i) => {
        return `${i * (50 / (chartData.length - 1))}, ${50 - (value / max) * 50}`
    });

    // グラフを挿入
    $(`
        <div class="qiitabeat-action">
            <svg width="50" height="50">
                <defs>
                    <linearGradient id="gradient" x1="0" x2="0" y1="1" y2="0">
                        <stop offset="10%" stop-color="#a89be9"></stop>
                        <stop offset="33%" stop-color="#6340c4"></stop>
                        <stop offset="66%" stop-color="#4e30a1"></stop>
                        <stop offset="90%" stop-color="#39216e"></stop>
                    </linearGradient>
                    <mask id="sparkline" x="0" y="0" width="50" height="50">
                        <polyline
                            points="${points.join(' ')}"
                            fill="transparent" stroke="#8cc665" stroke-width="2">
                        </polyline>
                    </mask>
                </defs>
                <g>
                    <rect width="50" height="50"
                        style="stroke: none; fill: url(#gradient); mask: url(#sparkline)"></rect>
                </g>
            </svg>
        </div>
    `).insertAfter('.it-Actions_item-like');
}