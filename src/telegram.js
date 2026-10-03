import { escapeHtml } from "./utils.js";

/**
 * 텔레그램 메시지 발송 기본 함수
 */
export async function sendTelegramMessage(text, env, options = {}) {
  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
      chat_id: options.chat_id || env.TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: options.parse_mode || "HTML",
      disable_web_page_preview: options.disable_web_page_preview ?? false,
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
 * 뉴스 알림 메시지 발송
 */
export async function sendArticleNotification(article, keyword, env) {
  let message = `🔔 <b>[${escapeHtml(keyword)}] 새 뉴스 알림</b> (<i>${article.source}</i>)\n\n`;
  message += `📰 <b><a href="${article.link}">${escapeHtml(article.title)}</a></b>\n`;

  if (article.description) {
    const desc = article.description.length > 140
      ? article.description.slice(0, 140) + "..."
      : article.description;
    message += `\n💬 ${escapeHtml(desc)}\n`;
  }

  message += `\n🔗 <a href="${article.link}">원문 기사 바로가기</a>`;

  return await sendTelegramMessage(message, env, { disable_web_page_preview: false });
}
