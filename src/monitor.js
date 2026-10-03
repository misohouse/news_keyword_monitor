import { fetchNaverNews } from "./naver.js";
import { fetchGoogleNews } from "./google.js";
import { sendArticleNotification } from "./telegram.js";
import { normalizeTitle, sleep } from "./utils.js";

const KEYWORDS_KV_KEY = "config:keywords";
const TTL_7_DAYS = 604800; // 7일 (초)

/**
 * 등록된 키워드 목록 조회
 */
export async function getKeywords(env) {
  try {
    const data = await env.NEWS_KV.get(KEYWORDS_KV_KEY, "json");
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  } catch (err) {
    console.error("Failed to get keywords from KV:", err);
    return [];
  }
}

/**
 * 키워드 목록 저장
 */
export async function saveKeywords(keywords, env) {
  const unique = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean)));
  await env.NEWS_KV.put(KEYWORDS_KV_KEY, JSON.stringify(unique));
  return unique;
}

/**
 * 키워드 추가
 */
export async function addKeywords(newKeywords, env) {
  const current = await getKeywords(env);
  const combined = [...current, ...newKeywords];
  return await saveKeywords(combined, env);
}

/**
 * 키워드 삭제
 */
export async function removeKeywords(keywordsToRemove, env) {
  const current = await getKeywords(env);
  const toRemoveSet = new Set(keywordsToRemove.map((k) => k.trim()));
  const filtered = current.filter((k) => !toRemoveSet.has(k));
  return await saveKeywords(filtered, env);
}

/**
 * 모든 키워드 삭제
 */
export async function clearKeywords(env) {
  await env.NEWS_KV.put(KEYWORDS_KV_KEY, JSON.stringify([]));
  return [];
}

/**
 * 뉴스 검색 및 새 뉴스 알림 발송 메인 루프
 * @param {object} env
 * @param {object} options
 * @returns {Promise<{ totalChecked: number, totalSent: number, errors: string[] }>}
 */
export async function checkAndNotify(env, options = {}) {
  const maxPerKeyword = options.maxPerKeyword || 3;
  const keywords = await getKeywords(env);

  if (keywords.length === 0) {
    console.log("No keywords registered. Skipping news check.");
    return { totalChecked: 0, totalSent: 0, errors: [] };
  }

  let totalSent = 0;
  let totalChecked = 0;
  const errors = [];

  for (const keyword of keywords) {
    try {
      // 1. 네이버 & 구글 뉴스 병렬 호출
      const [naverNews, googleNews] = await Promise.all([
        fetchNaverNews(keyword, env, 8),
        fetchGoogleNews(keyword, 8),
      ]);

      const candidateList = [...naverNews, ...googleNews];
      totalChecked += candidateList.length;

      let sentForThisKeyword = 0;

      for (const article of candidateList) {
        if (sentForThisKeyword >= maxPerKeyword) {
          break; // 키워드당 한 주기에 최대 개수 초과 시 스킵 (도배 방지)
        }

        const urlKey = `sent:url:${article.link}`;
        const titleKey = `sent:title:${normalizeTitle(article.title)}`;

        // 중복 검사: URL 또는 유사 제목이 이미 발송되었는지 확인
        const [isUrlSent, isTitleSent] = await Promise.all([
          env.NEWS_KV.get(urlKey),
          env.NEWS_KV.get(titleKey),
        ]);

        if (isUrlSent || isTitleSent) {
          continue;
        }

        // 새 뉴스 전송
        const success = await sendArticleNotification(article, keyword, env);
        if (success) {
          sentForThisKeyword++;
          totalSent++;

          // 7일간 중복 방지 저장
          await Promise.all([
            env.NEWS_KV.put(urlKey, "1", { expirationTtl: TTL_7_DAYS }),
            env.NEWS_KV.put(titleKey, "1", { expirationTtl: TTL_7_DAYS }),
          ]);

          // 텔레그램 Rate limit 보호를 위한 짧은 딜레이
          await sleep(350);
        }
      }
    } catch (err) {
      console.error(`Error processing keyword [${keyword}]:`, err);
      errors.push(`${keyword}: ${err.message}`);
    }
  }

  return { totalChecked, totalSent, errors };
}
