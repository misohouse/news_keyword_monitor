# 📢 뉴스 키워드 모니터링 텔레그램 봇 (News Keyword Monitor)

> **Cloudflare Workers**와 **Cloudflare KV**를 기반으로 24시간 365일 상시 가동되는 서버리스 뉴스 모니터링 텔레그램 봇입니다.  
> **구글 뉴스 RSS**와 **네이버 뉴스 검색 API(NAVER API HUB)**를 동시에 수집하여 관심 키워드의 새 뉴스를 실시간으로 알려줍니다.

---

## ✨ 주요 기능

- 🌐 **구글 뉴스 RSS & 네이버 뉴스 동시 수집**: 국내 포털과 글로벌 검색 엔진의 뉴스를 모두 놓치지 않고 커버합니다.
- ⚡ **100% 무료 서버리스 (Cloudflare Workers)**: PC나 별도 서버를 켜둘 필요 없이 클라우드에서 자동 실행됩니다.
- ⏰ **5분 주기 자동 감시 (Cron Trigger)**: 5분마다 새 뉴스를 찾아 자동으로 텔레그램 알림을 발송합니다.
- 🛡️ **스마트 중복 방지 (Cloudflare KV & 7일 TTL)**: 
  - 링크 URL 및 정규화된 기사 제목을 7일간 보관하여 중복 발송을 완벽히 차단합니다.
  - 7일이 지난 이력은 자동으로 삭제되어 저장 용량을 신경 쓸 필요가 없습니다.
- 💬 **텔레그램 채팅방에서 간편한 키워드 관리**:
  - `/추가 <키워드>` : 키워드 등록 (쉼표로 한 번에 여러 개 등록 가능)
  - `/삭제 <키워드>` : 키워드 삭제
  - `/목록` : 등록된 키워드 목록 확인
  - `/테스트` : 즉시 뉴스 수집 및 알림 테스트
  - `/전체삭제` : 등록된 키워드 전체 삭제

---

## 🛠️ 기술 스택

- **Runtime**: Cloudflare Workers (V8 JavaScript ES Modules)
- **Database**: Cloudflare KV (Key-Value Storage)
- **Scheduler**: Cloudflare Cron Triggers (`*/5 * * * *`)
- **News APIs**:
  - Naver Cloud Platform (NAVER API HUB - Search News API)
  - Google News RSS
- **Notification**: Telegram Bot API (Webhook + sendMessage)

---

## 🚀 배포 및 설정 방법

### 1. 패키지 설치 및 로그인

```bash
npm install
npx wrangler login
```

### 2. KV Namespace 생성 및 `wrangler.toml` 바인딩

```bash
npx wrangler kv namespace create NEWS_KV
```
출력된 ID 값을 `wrangler.toml` 파일의 `id` 항목에 입력합니다.

### 3. 보안 환경 변수(Secret) 등록

> **보안 주의**: API 키와 토큰은 Git에 커밋되지 않도록 Cloudflare Secret으로 등록합니다.

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
```

### 4. 배포

```bash
npx wrangler deploy
```

배포가 완료되면 Worker 주소(예: `https://news-keyword-monitor.<subdomain>.workers.dev`)가 출력됩니다.

### 5. 텔레그램 웹훅 등록

Worker 배포 후, 브라우저에서 아래 주소로 접속하면 텔레그램 봇 웹훅이 자동으로 연결됩니다:

```text
https://news-keyword-monitor.<subdomain>.workers.dev/setup-webhook
```

---

## 📱 텔레그램 명령어 사용 예시

| 명령어 | 설명 | 예시 |
| :--- | :--- | :--- |
| `/추가 <키워드>` | 감시할 키워드를 등록합니다. | `/추가 인공지능, 테슬라, 반도체` |
| `/삭제 <키워드>` | 감시 중인 키워드를 삭제합니다. | `/삭제 테슬라` |
| `/목록` | 현재 등록된 키워드를 확인합니다. | `/목록` |
| `/테스트` | 지금 바로 뉴스를 검색하여 알림을 테스트합니다. | `/테스트` |
| `/전체삭제` | 등록된 모든 키워드를 초기화합니다. | `/전체삭제` |
| `/도움말` | 사용법 가이드를 확인합니다. | `/도움말` |

---

## 📄 라이선스
MIT License
