import { escapeHtml, truncateSummary, formatDate } from "./utils.js";

/**
 * 텔레그램 메시지 발송 기본 함수
 */
export async function sendTelegramMessage(text, env, options = {}) {
  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const disablePreview = options.disable_web_page_preview ?? true;
    const payload = {
      chat_id: options.chat_id || env.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: options.parse_mode || "HTML",
      disable_web_page_preview: disablePreview,
      link_preview_options: { is_disabled: disablePreview },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`Telegram API error: HTTP ${res.status} - ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send Telegram message:", err);
    return false;
  }
}

/**
 * 뉴스 알림 메시지 발송 (키워드, 제목, 일시, 주요내용 2~3줄, 링크)
 * targetChatIds가 주어지면 등록된 모든 방(개인방 + 채널들)으로 동시 전송
 */
export async function sendArticleNotification(article, keyword, env, targetChatIds = null) {
  let sourceText = article.source;
  if (article.pressName) {
    sourceText = `${article.source} · ${article.pressName}`;
  }

  let message = `🔔 <b>[${escapeHtml(keyword)}]</b> (${escapeHtml(sourceText)})\n\n`;
  message += `📰 <b>${escapeHtml(article.title)}</b>\n`;

  const dateFormatted = formatDate(article.pubDate);
  if (dateFormatted) {
    message += `🕒 <code>${escapeHtml(dateFormatted)}</code>\n\n`;
  } else {
    message += `\n`;
  }

  const summary = truncateSummary(article.description, 110);
  if (summary) {
    message += `💬 ${escapeHtml(summary)}\n\n`;
  }

  message += `🔗 <a href="${article.link}">기사 바로가기</a>`;

  const targets = Array.isArray(targetChatIds) && targetChatIds.length > 0
    ? targetChatIds
    : [{ id: env.TELEGRAM_CHAT_ID }];

  let anySuccess = false;
  for (const t of targets) {
    const cid = typeof t === "object" ? t.id : t;
    const ok = await sendTelegramMessage(message, env, {
      chat_id: cid,
      disable_web_page_preview: true,
    });
    if (ok) anySuccess = true;
  }

  return anySuccess;
}
