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
