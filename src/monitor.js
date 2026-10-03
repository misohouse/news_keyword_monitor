import { fetchNaverNews } from "./naver.js";
import { fetchGoogleNews } from "./google.js";
import { sendArticleNotification } from "./telegram.js";
import { normalizeTitle, sleep, isWithinPastHours } from "./utils.js";

const KEYWORDS_KV_KEY = "config:keywords";
const INTERVAL_KV_KEY = "config:interval_minutes";
const LAST_RUN_KV_KEY = "state:last_run_timestamp";
const DEFAULT_INTERVAL_MINUTES = 5;
const TTL_7_DAYS = 604800; // 7일 (초)

/**
 * 모니터링 주기(분) 조회 (기본값: 5분)
 */
export async function getIntervalMinutes(env) {
  try {
    const val = await env.NEWS_KV.get(INTERVAL_KV_KEY);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      return parsed;
    }
  } catch (err) {
    console.error("Failed to get interval from KV:", err);
  }
  return DEFAULT_INTERVAL_MINUTES;
}

/**
 * 모니터링 주기(분) 설정
 */
export async function setIntervalMinutes(minutes, env) {
  const m = Math.max(1, Math.min(1440, parseInt(minutes, 10) || DEFAULT_INTERVAL_MINUTES));
  await env.NEWS_KV.put(INTERVAL_KV_KEY, m.toString());
  return m;
}

/**
 * 설정된 간격에 따라 지금 실행해야 하는지 검사
 */
export async function shouldRunNow(env) {
  const now = Date.now();
  const intervalMinutes = await getIntervalMinutes(env);
  const intervalMs = intervalMinutes * 60 * 1000;

  const lastRunStr = await env.NEWS_KV.get(LAST_RUN_KV_KEY);
  const lastRun = lastRunStr ? parseInt(lastRunStr, 10) : 0;

  // 크론 지연 오차 감안 (15초 허용)
  if (lastRun && (now - lastRun < intervalMs - 15000)) {
    return false;
  }

  await env.NEWS_KV.put(LAST_RUN_KV_KEY, now.toString());
  return true;
}

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
 * @param {object} options - { isTest: boolean, maxTotal: number, maxAgeHours: number, maxPerKeyword: number }
 * @returns {Promise<{ totalChecked: number, totalSent: number, errors: string[] }>}
 */
export async function checkAndNotify(env, options = {}) {
  const isTest = options.isTest || false;
  const maxTotal = options.maxTotal || (isTest ? 3 : 999);
  const maxPerKeyword = options.maxPerKeyword || 3;
  const maxAgeHours = options.maxAgeHours || (isTest ? 24 : 48); // 테스트: 24시간, 일반: 48시간

  const keywords = await getKeywords(env);

  if (keywords.length === 0) {
    console.log("No keywords registered. Skipping news check.");
    return { totalChecked: 0, totalSent: 0, errors: [] };
  }

  let totalSent = 0;
  let totalChecked = 0;
  const errors = [];
  const seenTitlesInRun = new Set();

  for (const keyword of keywords) {
    if (totalSent >= maxTotal) break;

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
        if (totalSent >= maxTotal || sentForThisKeyword >= maxPerKeyword) {
          break;
        }

        // 1. 시간 필터: 최근 N시간(테스트: 24시간) 이내에 발행된 기사만 통과
        if (!isWithinPastHours(article.pubDate, maxAgeHours)) {
          continue;
        }

        const normTitle = normalizeTitle(article.title);
        // 동일 회차 내 네이버/구글 중복 전송 방지
        if (seenTitlesInRun.has(normTitle)) {
          continue;
        }
        seenTitlesInRun.add(normTitle);

        const urlKey = `sent:url:${article.link}`;
        const titleKey = `sent:title:${normTitle}`;

        // 일반 모니터링 모드일 때는 과거 전송 이력 검사 (테스트 모드는 최근 24시간 기사 보여줌)
        if (!isTest) {
          const [isUrlSent, isTitleSent] = await Promise.all([
            env.NEWS_KV.get(urlKey),
            env.NEWS_KV.get(titleKey),
          ]);

          if (isUrlSent || isTitleSent) {
            continue;
          }
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
