# plan-backend — 기획서·사이클 기획안 백엔드

Google Apps Script Web App + 구글시트. `/plan/`의 채널 한 장 기획서와 `/submit/`의 격주 사이클 기획안을 저장하고 확인 이메일을 발송한다. 사이클 기획안의 AI 검토는 맥미니 claude 워커가 비동기로 처리한다(`../review-worker/README.md`).

## 구성

| 항목 | 값 |
|------|-----|
| 스크립트 | https://script.google.com/d/10d4YebiJYUwxn1qujzg32b5fz0smXjxLBLEcvSdYxNXRJY1cQjkQZQ4Y/edit |
| 데이터 시트 (비공개) | https://drive.google.com/open?id=1R8oCmjfn-TeMinl6Hyhm0kMbGxPTTpDxYwSnA8eKtxs |
| 웹앱 배포 ID | `AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs` (@10) |
| 웹앱 URL | `https://script.google.com/macros/s/<배포ID>/exec` |
| 실행 계정 | jayjunglim@gmail.com (MailApp 발신, 일 100통 한도) |

## API

모든 POST 요청은 CORS preflight를 피하기 위해 `Content-Type: text/plain;charset=utf-8`로 JSON 문자열을 전송한다. `form`이 없으면 기존 plans 경로, `form: "proposal"`이면 사이클 기획안 경로로 처리한다.

| 구분 | 요청 | 동작 | 응답 |
|------|------|------|------|
| 기존 | `POST /exec` | 채널 한 장 기획서를 email 기준 upsert하고 확인 메일 발송 | `{ok, resubmit}` |
| 기존 | `GET /exec?action=gallery&t=<공유토큰>` | plans 참여자 갤러리. email·수정토큰 제외, `__` 접두 이름 필터 | `{ok, plans}` |
| 기존 | `GET /exec?action=mine&edit=<개인토큰>` | plans 본인 제출분 반환(재제출 프리필) | `{ok, plan}` |
| 추가 | `POST /exec` + body `form: "proposal"` | email+cycle 기준 기획안 upsert. **제출 시점 메일 없음** — 워커의 검토 완료 시 접수 전문+AI 검토를 한 통으로 발송 | `{ok, resubmit, review:"queued"}` |
| 워커 | `GET /exec?action=review-pending&t=<워커토큰>` | 미검토 기획안 목록(edit_token 포함, 이메일 제외, `__` 행 포함). **갤러리 토큰으로는 열리지 않는다** | `{ok, pending}` |
| 워커 | `POST /exec` + body `form: "review", t:<워커토큰>` | ai_review 저장(빈 값 거부, submit_count 불일치 시 stale 스킵) + **접수 전문+검토 통합 확인 메일** 발송 | `{ok, stale, mailed}` |
| 워커 | `GET /exec?action=worker-token-mail&t=<공유토큰>` | WORKER_TOKEN을 운영자 메일로만 발송 (부트스트랩) | `{ok, mailed_to_operator}` |
| 추가 | `GET /exec?action=proposals&t=<공유토큰>` | 사이클 기획안 전체 목록. email·수정토큰 제외, cycle 포함 | `{ok, proposals}` |
| 추가 | `GET /exec?action=proposal-mine&edit=<개인토큰>` | 해당 수정토큰의 기획안 반환(재제출 프리필) | `{ok, proposal}` |
| 인증 | `POST /exec` + body `form: "verify"` | email+cycle 기준 영상 인증 upsert. 쇼츠·비유튜브 URL 거부, oEmbed 제목 수집. **제출 시점 메일 없음** — 워커의 영상 검토 완료 시 인증 확인+검토를 한 통으로 발송 | `{ok, resubmit, video_title, review:"queued"}` |
| 워커 | `GET /exec?action=verify-pending&t=<워커토큰>` | 미검토 영상 인증 목록 + 같은 사이클 기획안 조인(대조용, 이메일 제외) | `{ok, pending}` |
| 워커 | `POST /exec` + body `form: "video-review", t:<워커토큰>` | verifications.ai_review 저장(빈 값 거부, stale 스킵) + 인증 확인+검토 통합 메일 발송 | `{ok, stale, mailed}` |
| 인증 | `GET /exec?action=verifications&t=<공유토큰>` | 인증 현황 목록. email·수정토큰 제외 | `{ok, verifications}` |
| 진단 | `GET /exec?action=diag&t=<공유토큰>` | 자가진단 — oEmbed 호출 결과, 미검토 기획안 건수 | `{ok, oembed, review_pending}` |
| 공개 | `GET /exec?action=dashboard` | **토큰 불요.** 메인 대시보드용. 참가자별로 제출 내역을 중첩해 반환 | `{ok, participants:[{name, channel_name, proposals[], verifications[]}]}` |

### 두 번째 통로 (CLI)

웹앱은 `access: ANYONE_ANONYMOUS`라 API가 인증 없이 열려 있고, 이 리포도 public이라 스펙은 이미 공개다. 이를 정돈해 `docs/skills/proposal.md`·`verify.md`에 Claude용 지시서로 문서화했다(대시보드 하단에서 URL 한 줄로 배포). 제출용 별도 키는 두지 않는다 — 키를 두면 공개 리포에 커밋되는 자기모순이고, "이메일을 알아야 남의 기록을 덮을 수 있다"는 장벽은 `action=dashboard`가 이메일·해시를 싣지 않는 설계가 지탱하므로 스펙 공개와 무관하다.

**curl 주의**: `-L`은 필수이고 `-X POST`는 쓰면 안 된다. 둘을 같이 쓰면 리다이렉트된 주소에도 POST가 가서 405가 나는데, **그 시점에 제출은 이미 처리된 상태**라 실패로 오인해 재시도하면 중복 제출이 된다(2026-07-26 실측, `submit_count` 2로 재현). `-d`만 주면 curl이 302에서 GET으로 전환해 정상 응답을 받는다.

### `action=dashboard`가 내보내지 않는 것

이메일, **이메일 해시**, AI 검토(`ai_review`), 수정토큰. 기획안 본문(`target`·`topic`·`structure`·`links`)은 **2026-07-27부터 공개로 전환**했다 — 대시보드에서 기획 칸을 눌러 세부를 볼 수 있게 하기 위함이며, 운영자 결정 사항이다. AI 검토는 제출자 본인 메일에만 간다. 시트 3탭에 흩어진 같은 사람을 묶는 join key는 `joinKey_()`(정규화 후 SHA-256)로 만들지만 **응답에 싣지 않는다** — 실명과 해시가 한 줄에 같이 나가면 이름 기반 대입으로 이메일이 역산되기 때문이다. 그래서 매칭을 서버 안에서 끝내고 참가자 객체에 제출 내역을 중첩시킨다. 표시 이름은 `plans`(채널 기획서)의 것을 canonical로 쓴다 — 폼마다 표기가 달라도 흔들리지 않게.

## ⚠️ UrlFetchApp 스코프 (2026-07-25 트러블슈팅)

`appsscript.json`에 `oauthScopes`를 명시하면 **그 목록으로 권한이 고정된다.** 초기 배포에 `script.external_request`가 빠져 있어 AI 검토와 영상 제목 수집이 조용히 실패했다 — 코드의 `try/catch`가 권한 예외를 삼켜 저장·메일은 정상 동작하고 `ai_review`·`video_title`만 빈 값으로 남는 형태였다.

스코프를 추가한 뒤에는 `clasp push`·`redeploy`만으로는 반영되지 않는다. 웹앱이 `USER_DEPLOYING`이라 **배포 계정이 브라우저에서 1회 재승인**해야 새 스코프가 붙는다: 편집기에서 아무 함수(`setup`)를 실행 → 권한 검토 → 고급 → 허용. 반영 여부는 `action=diag`로 확인한다.

## `proposals` 시트 스키마

시트 탭이 없으면 첫 요청 또는 `setup()` 실행 시 자동 생성되고 첫 행이 아래 헤더로 고정된다.

| 순서 | 컬럼 | 설명 |
|------|------|------|
| 1 | `created_at` | 최초 제출 시각. 재제출 시 유지 |
| 2 | `updated_at` | 마지막 제출 시각 |
| 3 | `name` | 이름 또는 활동명 |
| 4 | `email` | 확인 메일 수신 주소. 갤러리 API에서 제외 |
| 5 | `cycle` | 사이클 번호(1~6) |
| 6 | `target` | 타깃 시청자 |
| 7 | `topic` | 영상 주제 |
| 8 | `structure` | 구성 개요 |
| 9 | `links` | 참고 링크(선택) |
| 10 | `ai_review` | AI 검토 결과 (맥미니 claude 워커가 비동기 기입). 미검토면 빈 값 |
| 11 | `edit_token` | 행 최초 생성 시 발급되는 개인 수정토큰. 재제출 시 유지 |
| 12 | `submit_count` | 같은 email+cycle의 누적 제출 횟수 |

## 토큰 (리포에 커밋 금지)

- 갤러리 공유토큰: Script Properties `GALLERY_TOKEN` (확인 이메일의 갤러리 링크에도 포함)
- 개인 수정토큰: 시트 `edit_token` 컬럼 (확인 이메일의 수정 링크)

## AI 검토 워커 (Gemini → claude 이관, 2026-07-27)

Gemini 동기 검토는 GCP 월 지출 한도 초과(429)로 폐기했다. 현재 검토는 맥미니 launchd 잡
`com.ggplab.ytc-review`가 `claude -p`로 비동기 처리한다 — 구조·프로비저닝·보안 설계는
`../review-worker/README.md` (SSOT). `WORKER_TOKEN`은 Script Properties에 자동 생성되며
`action=worker-token-mail`로 운영자 메일로만 전달된다. **갤러리 토큰과 절대 겸용하지 말 것** —
갤러리 토큰은 참가자 전원에게 배포되는 값이다.

## 코드 수정 → 재배포

| 순서 | 위치 | 명령 |
|------|------|------|
| 1 | 리포 루트 | `cd system/plan-backend` |
| 2 | `system/plan-backend` | `clasp push -f` |
| 3 | `system/plan-backend` | `clasp redeploy AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs -d "설명"` |

배포 ID가 바뀌면 웹앱 URL도 바뀌므로 `docs/plan/index.html`·`docs/plan/gallery/index.html`·`docs/submit/index.html`·`docs/submit/gallery/index.html`의 `API_URL`을 함께 갱신할 것.
새 배포(`clasp deploy`) 대신 반드시 `redeploy`(기존 배포 업데이트)를 쓸 것 — URL 유지.
