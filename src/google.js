import { stripHtml } from "./utils.js";

/**
 * 구글 뉴스 RSS 피드 파싱
 * @param {string} keyword
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function fetchGoogleNews(keyword, limit = 10) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.error(`Google RSS Error: HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < limit) {
      const itemContent = match[1];

      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);

      if (titleMatch && linkMatch) {
        let rawTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");
        let rawLink = linkMatch[1].trim();
        let pressName = sourceMatch ? stripHtml(sourceMatch[1]) : "";

        articles.push({
          title: stripHtml(rawTitle),
          link: rawLink,
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : "",
          pressName: pressName,
          source: "구글 뉴스",
        });
      }
    }

    return articles;
  } catch (err) {
    console.error(`Google News fetch failed for keyword [${keyword}]:`, err);
    return [];
  }
}
