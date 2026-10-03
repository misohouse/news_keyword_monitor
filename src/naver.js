import { stripHtml } from "./utils.js";

/**
 * 네이버 뉴스 검색 API (NAVER API HUB) 호출
 * @param {string} keyword
 * @param {object} env
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function fetchNaverNews(keyword, env, limit = 10) {
  try {
    const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(keyword)}&display=${limit}&sort=date`;
    const response = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID,
        "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET,
      },
    });

    if (!response.ok) {
      console.error(`Naver API Error: HTTP ${response.status} - ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item) => ({
      title: stripHtml(item.title),
      link: item.originallink || item.link,
      originallink: item.originallink,
      naverlink: item.link,
      description: stripHtml(item.description),
      pubDate: item.pubDate,
      source: "네이버 뉴스",
    }));
  } catch (err) {
    console.error(`Naver News fetch failed for keyword [${keyword}]:`, err);
    return [];
  }
}
