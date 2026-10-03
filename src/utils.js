/**
 * HTML 태그 및 엔티티 제거
 */
export function stripHtml(str = "") {
  return str
    .replace(/<[^>]*>?/gm, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/**
 * 텔레그램 HTML parse_mode용 이스케이프
 */
export function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 구글/네이버 간 중복 방지를 위한 제목 정규화
 * (특수문자, 언론사명 접미사, 공백 제거 후 비교용 키 생성)
 */
export function normalizeTitle(title = "") {
  return stripHtml(title)
    .replace(/\s*-\s*[^-]+$/, "") // 구글 뉴스 끝의 "- 언론사명" 제거
    .replace(/\[[^\]]*\]/g, "")   // [단독], [속보] 등 대괄호 내용 제거
    .replace(/\([^\)]*\)/g, "")   // (종합) 등 소괄호 내용 제거
    .replace(/[^a-zA-Z0-9가-힣]/g, "") // 특수문자 및 공백 제거
    .toLowerCase();
}

/**
 * 지정된 시간(ms) 동안 대기
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 키워드가 텍스트 내에 정확하게 순서대로 포함되어 있는지 확인
 * (단어 사이의 불필요한 개입 차단 및 조사 처리, 유사 이름(조윤우 등) 오매칭 방지)
 */
export function matchesKeyword(text = "", keyword = "") {
  if (!text || !keyword) return false;
  const words = keyword
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  // 한국어 조사 및 호칭 허용 (조윤이, 조윤의, 조윤씨 등은 매칭하고, 조윤우/조윤수는 차단)
  const particles = "(?:이|가|을|를|은|는|의|와|과|도|로|으로|에|에게|에서|씨|씨가|씨는|씨의|씨와|님|님이|님은|들|들도|들을|들의|들에게)?";
  const pattern = new RegExp(`(?<![가-힣a-zA-Z0-9])${words.join("\\s+")}${particles}(?![가-힣a-zA-Z0-9])`, "i");
  return pattern.test(text);
}

/**
 * 2~3줄 분량(약 120자) 깔끔한 요약 생성
 */
export function truncateSummary(text = "", maxLength = 120) {
  if (!text) return "";
  const cleaned = stripHtml(text).replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/\s+[^\s]*$/, "") + "...";
}

/**
 * 기사 발행일시 포맷팅 (한국 시간 KST 기준: YYYY.MM.DD HH:mm)
 */
export function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const formatter = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || "";
    return `${getPart("year")}.${getPart("month")}.${getPart("day")} ${getPart("hour")}:${getPart("minute")}`;
  } catch {
    return dateStr;
  }
}
