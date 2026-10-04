import {
  getKeywords,
  addKeywords,
  removeKeywords,
  clearKeywords,
  getChannels,
  addChannel,
  clearChannels,
  getIntervalMinutes,
  setIntervalMinutes,
  shouldRunNow,
  checkAndNotify,
} from "./monitor.js";
import { sendTelegramMessage } from "./telegram.js";
import { escapeHtml } from "./utils.js";

export default {
  /**
   * Cron Trigger 핸들러 (매분 실행되어 설정된 간격 도달 시 뉴스 검사)
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const isDue = await shouldRunNow(env);
      if (isDue) {
        await checkAndNotify(env);
      }
    })());
  },

  /**
   * HTTP 요청 핸들러 (웹훅, 수동 테스트, 대시보드)
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 텔레그램 봇 웹훅 수신
    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();

        // 봇이 채널/그룹에 초대되거나 관리자로 지정되었을 때 자동 감지
        if (update.my_chat_member) {
          ctx.waitUntil(handleChatMemberUpdate(update.my_chat_member, env));
          return new Response("OK", { status: 200 });
        }

        // 일반 메시지 또는 전달(Forward)된 메시지 수신
        if (update.message) {
          ctx.waitUntil(handleTelegramUpdate(update.message, env));
          return new Response("OK", { status: 200 });
        }
      } catch (err) {
        console.error("Webhook processing error:", err);
      }
      return new Response("OK", { status: 200 });
    }

    // 2. 텔레그램 웹훅 자동 등록 엔드포인트
    if (url.pathname === "/setup-webhook") {
      const webhookUrl = `${url.origin}/webhook`;
      const allowedUpdates = JSON.stringify(["message", "my_chat_member", "channel_post"]);
      const tgRes = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=${encodeURIComponent(allowedUpdates)}`
      );
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 3. 웹훅 상태 확인 엔드포인트
    if (url.pathname === "/webhook-info") {
      const tgRes = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`
      );
      const data = await tgRes.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 4. 수동 뉴스 모니터링 테스트 실행 엔드포인트
    if (url.pathname === "/test-check") {
      const result = await checkAndNotify(env, { maxPerKeyword: 2 });
      return new Response(JSON.stringify(result, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 5. 기본 상태 페이지
    const [keywords, intervalMinutes] = await Promise.all([
      getKeywords(env),
      getIntervalMinutes(env),
    ]);
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>뉴스 키워드 모니터링 봇</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 650px; margin: 0 auto; line-height: 1.6; }
    h1 { color: #38bdf8; font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; background: #22c55e; color: #fff; font-size: 0.75rem; font-weight: bold; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; margin-top: 1.5rem; border: 1px solid #334155; }
    .keywords { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .tag { background: #0284c7; color: white; padding: 0.25rem 0.75rem; border-radius: 6px; font-size: 0.9rem; }
    .empty { color: #94a3b8; font-style: italic; }
    .btn { display: inline-block; background: #2563eb; color: white; padding: 0.6rem 1rem; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 0.9rem; margin-top: 1rem; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <h1>📢 뉴스 키워드 모니터링 <span class="badge">${intervalMinutes}분마다 자동 감시 중</span></h1>
  <div class="card">
    <h3 style="margin-top:0;">📋 현재 감시 중인 키워드 (${keywords.length}개)</h3>
    <div class="keywords">
      ${
        keywords.length > 0
          ? keywords.map((k) => `<span class="tag">#${escapeHtml(k)}</span>`).join("")
          : `<span class="empty">등록된 키워드가 없습니다. 텔레그램에서 <b>/추가 &lt;키워드&gt;</b>를 보내보세요!</span>`
      }
    </div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">🤖 텔레그램 연동 상태</h3>
    <p>텔레그램 봇 채팅방에서 아래 명령어를 사용할 수 있습니다:</p>
    <ul>
      <li><code>/추가 &lt;키워드&gt;</code> - 키워드 등록 (쉼표로 여러 개 가능)</li>
      <li><code>/삭제 &lt;키워드&gt;</code> - 키워드 삭제</li>
      <li><code>/목록</code> - 등록된 키워드 확인</li>
      <li><code>/주기 &lt;분&gt;</code> - 모니터링 시간 간격 변경 (현재: ${intervalMinutes}분)</li>
      <li><code>/테스트</code> - 즉시 뉴스 수집 및 알림 테스트</li>
    </ul>
    <a href="/test-check" class="btn">지금 뉴스 수집 수동 테스트</a>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

/**
 * 텔레그램 봇 명령어 처리 핸들러
 */
async function handleTelegramUpdate(message, env) {
  const chatId = message.chat.id.toString();
  const text = (message.text || "").trim();

  // 보안 검사: 등록된 사용자 본인의 Chat ID만 명령 실행 가능
  if (chatId !== env.TELEGRAM_CHAT_ID.toString()) {
    console.warn(`Unauthorized access attempt from Chat ID: ${chatId}`);
    await sendTelegramMessage(
      "⛔ 접근 권한이 없습니다. 등록된 관리자만 이 봇을 사용할 수 있습니다.",
      env,
      { chat_id: chatId }
    );
    return;
  }

  // 0. 비공개 채널에서 전달(Forward)된 메시지 감지 시 채널 자동 등록!
  const forwardChat = message.forward_from_chat || message.forward_origin?.chat;
  if (forwardChat && (forwardChat.type === "channel" || forwardChat.type === "supergroup" || forwardChat.type === "group")) {
    const channelId = forwardChat.id.toString();
    const channelTitle = forwardChat.title || "비공개 채널";
    await addChannel(channelId, channelTitle, env);

    await sendTelegramMessage(
      `🎉 <b>비공개 채널이 수신 대상으로 자동 등록되었습니다!</b>\n\n📢 <b>채널명:</b> ${escapeHtml(channelTitle)}\n🆔 <b>채널 ID:</b> <code>${channelId}</code>\n\n앞으로 새 뉴스가 나오면 <b>내 개인방과 [${escapeHtml(channelTitle)}] 채널로 동시에</b> 알림이 발송됩니다!\n\n<i>(※ 아직 봇을 채널의 관리자로 초대하지 않으셨다면, 채널 관리자 목록에서 이 봇을 관리자로 추가해 주세요!)</i>`,
      env
    );
    return;
  }

  // 1. /start, /help, /도움말
  if (text.startsWith("/start") || text.startsWith("/help") || text.startsWith("/도움말")) {
    const [keywords, intervalMinutes, channels] = await Promise.all([
      getKeywords(env),
      getIntervalMinutes(env),
      getChannels(env),
    ]);
    const kwText = keywords.length > 0 ? keywords.join(", ") : "없음";
    const channelText = channels.length > 0
      ? channels.map((c) => `📢 ${c.title}`).join(", ")
      : "없음 (개인방으로만 수신)";

    const reply = `👋 <b>안녕하세요! 뉴스 키워드 모니터링 봇입니다.</b>

구글 뉴스 RSS와 네이버 뉴스 API를 통해 <b>${intervalMinutes}분마다</b> 새 뉴스를 찾아 알림을 보내드립니다.

📌 <b>명령어 사용법:</b>
• <code>/추가 &lt;키워드&gt;</code> : 키워드 등록 (예: /추가 인공지능)
• <code>/삭제 &lt;키워드&gt;</code> : 키워드 삭제 (예: /삭제 반도체)
• <code>/목록</code> : 현재 감시 중인 키워드 확인
• <code>/주기 &lt;분&gt;</code> : 모니터링 간격 변경 (예: /주기 10)
• <code>/채널목록</code> : 알림이 전송되는 채널 및 수신처 확인
• <code>/채널삭제</code> : 등록된 모든 채널 삭제
• <code>/테스트</code> : 지금 즉시 뉴스 검색 및 알림 테스트
• <code>/전체삭제</code> : 등록된 모든 키워드 일괄 삭제

💡 <b>비공개 채널 추가 방법:</b>
비공개 채널의 글을 이 봇에게 <b>전달(Forward)</b>하거나, 채널 관리자로 이 봇을 초대하면 자동 등록됩니다!

⏱️ <b>현재 모니터링 주기:</b> ${intervalMinutes}분마다
📋 <b>현재 등록된 키워드:</b> ${escapeHtml(kwText)}
📢 <b>연동된 채널:</b> ${escapeHtml(channelText)}`;

    await sendTelegramMessage(reply, env);
    return;
  }

  // 2. /목록, /list
  if (text === "/목록" || text === "/list") {
    const keywords = await getKeywords(env);
    if (keywords.length === 0) {
      await sendTelegramMessage(
        "📭 <b>현재 등록된 키워드가 없습니다.</b>\n\n<code>/추가 &lt;키워드&gt;</code> 형식으로 관심 키워드를 등록해보세요!",
        env
      );
    } else {
      const listStr = keywords.map((k, idx) => `${idx + 1}. <b>${escapeHtml(k)}</b>`).join("\n");
      await sendTelegramMessage(
        `📋 <b>현재 감시 중인 키워드 (${keywords.length}개):</b>\n\n${listStr}`,
        env
      );
    }
    return;
  }

  // 3. /추가 <키워드>, /add <키워드>
  if (text.startsWith("/추가") || text.startsWith("/add")) {
    const rawArgs = text.replace(/^\/(추가|add)/, "").trim();
    if (!rawArgs) {
      await sendTelegramMessage(
        "⚠️ 추가할 키워드를 입력해 주세요.\n예: <code>/추가 인공지능</code> 또는 <code>/추가 삼성전자, 테슬라</code>",
        env
      );
      return;
    }

    const newKeywords = rawArgs
      .split(/[,，\n]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const updated = await addKeywords(newKeywords, env);
    await sendTelegramMessage(
      `✅ <b>키워드가 등록되었습니다:</b> ${escapeHtml(newKeywords.join(", "))}\n\n📋 <b>전체 키워드 (${updated.length}개):</b>\n${escapeHtml(updated.join(", "))}`,
      env
    );
    return;
  }

  // 4. /삭제 <키워드>, /del, /remove
  if (text.startsWith("/삭제") || text.startsWith("/del") || text.startsWith("/remove")) {
    const rawArgs = text.replace(/^\/(삭제|del|remove)/, "").trim();
    if (!rawArgs) {
      await sendTelegramMessage(
        "⚠️ 삭제할 키워드를 입력해 주세요.\n예: <code>/삭제 인공지능</code>",
        env
      );
      return;
    }

    const toRemove = rawArgs
      .split(/[,，\n]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    const updated = await removeKeywords(toRemove, env);
    await sendTelegramMessage(
      `🗑️ <b>키워드가 삭제되었습니다:</b> ${escapeHtml(toRemove.join(", "))}\n\n📋 <b>남은 키워드 (${updated.length}개):</b>\n${updated.length > 0 ? escapeHtml(updated.join(", ")) : "없음"}`,
      env
    );
    return;
  }

  // 5. /주기 <분>, /간격 <분>, /interval <분>
  if (text.startsWith("/주기") || text.startsWith("/간격") || text.startsWith("/interval")) {
    const rawArgs = text.replace(/^\/(주기|간격|interval)/, "").trim();
    if (!rawArgs) {
      const current = await getIntervalMinutes(env);
      await sendTelegramMessage(
        `⏱️ <b>현재 모니터링 주기: ${current}분마다 실행 중입니다.</b>\n\n주기를 변경하시려면 분 단위 숫자를 함께 입력해 주세요.\n• 예: <code>/주기 10</code> (10분마다 실행)\n• 예: <code>/주기 30</code> (30분마다 실행)\n• 예: <code>/주기 1</code> (1분마다 실행)`,
        env
      );
      return;
    }

    const minutes = parseInt(rawArgs, 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
      await sendTelegramMessage(
        "⚠️ 올바른 시간(분)을 입력해 주세요. (1분 ~ 1440분 사이의 숫자)\n예: <code>/주기 10</code>",
        env
      );
      return;
    }

    const updated = await setIntervalMinutes(minutes, env);
    await sendTelegramMessage(
      `⏱️ <b>모니터링 주기가 [${updated}분]으로 변경되었습니다!</b>\n앞으로 ${updated}분 간격으로 새 뉴스를 자동 확인합니다.`,
      env
    );
    return;
  }

  // 6. /채널목록, /channels
  if (text === "/채널목록" || text === "/channels") {
    const channels = await getChannels(env);
    if (channels.length === 0) {
      await sendTelegramMessage(
        `📋 <b>현재 알림 수신 대상:</b>\n• 👤 내 개인 알림방 (기본)\n\n<i>등록된 채널이 없습니다. 비공개 채널의 글을 이 봇에게 전달(Forward)하거나 봇을 채널 관리자로 추가해 보세요!</i>`,
        env
      );
    } else {
      const listStr = channels.map((c, idx) => `${idx + 1}. 📢 <b>${escapeHtml(c.title)}</b> (<code>${c.id}</code>)`).join("\n");
      await sendTelegramMessage(
        `📋 <b>현재 알림 수신 대상:</b>\n• 👤 내 개인 알림방 (기본)\n${listStr}\n\n<i>채널을 삭제하시려면 <code>/채널삭제</code> 를 입력하세요.</i>`,
        env
      );
    }
    return;
  }

  // 7. /채널삭제
  if (text === "/채널삭제") {
    await clearChannels(env);
    await sendTelegramMessage("🧹 <b>모든 채널이 수신 대상에서 삭제되었습니다.</b> (내 개인 알림방으로만 발송됩니다)", env);
    return;
  }

  // 8. /전체삭제, /clear
  if (text === "/전체삭제" || text === "/clear") {
    await clearKeywords(env);
    await sendTelegramMessage("🧹 <b>모든 키워드가 삭제되었습니다.</b>", env);
    return;
  }

  // 9. /테스트, /test
  if (text === "/테스트" || text === "/test") {
    const keywords = await getKeywords(env);
    if (keywords.length === 0) {
      await sendTelegramMessage(
        "⚠️ 등록된 키워드가 없습니다. 먼저 <code>/추가 &lt;키워드&gt;</code> 로 키워드를 등록한 후 테스트해 주세요.",
        env
      );
      return;
    }

    await sendTelegramMessage(
      `🔍 <b>최근 24시간 뉴스 수집 테스트를 시작합니다...</b>\n• 대상 키워드: ${escapeHtml(keywords.join(", "))}\n• 수집 기준: 최근 24시간 이내 기사 (최대 3건)`,
      env
    );

    const result = await checkAndNotify(env, { isTest: true, maxTotal: 3, maxAgeHours: 24 });
    if (result.totalSent === 0) {
      await sendTelegramMessage(
        `🏁 <b>테스트 완료</b>\n최근 24시간 이내에 발행된 뉴스가 없습니다.\n새 뉴스가 등록되면 설정하신 주기에 맞춰 자동으로 알림을 보내드립니다.`,
        env
      );
    } else {
      await sendTelegramMessage(
        `🏁 <b>테스트 완료!</b>\n최근 24시간 이내 기사 ${result.totalSent}건을 전송했습니다.`,
        env
      );
    }
    return;
  }

  // 10. 슬래시 없이 키워드만 보냈을 때 친절한 안내
  await sendTelegramMessage(
    `💡 <b>"${escapeHtml(text)}"</b> 키워드를 등록하시겠습니까?\n\n등록을 원하시면 아래 명령어를 입력해 주세요:\n<code>/추가 ${escapeHtml(text)}</code>\n\n모든 명령어는 <code>/도움말</code> 을 참고하세요.`,
    env
  );
}

/**
 * 봇이 채널/그룹의 관리자로 추가되었을 때 자동 처리
 */
async function handleChatMemberUpdate(myChatMember, env) {
  try {
    const chat = myChatMember.chat;
    const newStatus = myChatMember.new_chat_member?.status;

    // 관리자(administrator) 또는 멤버(member)로 추가되었을 때
    if (newStatus === "administrator" || newStatus === "member") {
      const channelId = chat.id.toString();
      const channelTitle = chat.title || (chat.type === "channel" ? "비공개 채널" : "그룹방");
      await addChannel(channelId, channelTitle, env);

      await sendTelegramMessage(
        `🎉 <b>[${escapeHtml(channelTitle)}] 채널 관리자로 등록되었습니다!</b>\n\n🆔 <b>채널 ID:</b> <code>${channelId}</code>\n\n이 채널이 뉴스 수신 대상에 자동 등록되었습니다! 앞으로 새 뉴스가 나오면 <b>내 개인방과 이 채널방으로 동시에</b> 알림이 발송됩니다.`,
        env
      );
    }
  } catch (err) {
    console.error("Error handling chat member update:", err);
  }
}
