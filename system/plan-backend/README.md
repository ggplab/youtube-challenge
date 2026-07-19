# plan-backend — 기획서·사이클 기획안 백엔드

Google Apps Script Web App + 구글시트. `/plan/`의 채널 한 장 기획서와 `/submit/`의 격주 사이클 기획안을 저장하고 확인 이메일을 발송한다. 사이클 기획안은 Gemini 검토도 함께 제공한다.

## 구성

| 항목 | 값 |
|------|-----|
| 스크립트 | https://script.google.com/d/10d4YebiJYUwxn1qujzg32b5fz0smXjxLBLEcvSdYxNXRJY1cQjkQZQ4Y/edit |
| 데이터 시트 (비공개) | https://drive.google.com/open?id=1R8oCmjfn-TeMinl6Hyhm0kMbGxPTTpDxYwSnA8eKtxs |
| 웹앱 배포 ID | `AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs` (@1) |
| 웹앱 URL | `https://script.google.com/macros/s/<배포ID>/exec` |
| 실행 계정 | jayjunglim@gmail.com (MailApp 발신, 일 100통 한도) |

## API

모든 POST 요청은 CORS preflight를 피하기 위해 `Content-Type: text/plain;charset=utf-8`로 JSON 문자열을 전송한다. `form`이 없으면 기존 plans 경로, `form: "proposal"`이면 사이클 기획안 경로로 처리한다.

| 구분 | 요청 | 동작 | 응답 |
|------|------|------|------|
| 기존 | `POST /exec` | 채널 한 장 기획서를 email 기준 upsert하고 확인 메일 발송 | `{ok, resubmit}` |
| 기존 | `GET /exec?action=gallery&t=<공유토큰>` | plans 참여자 갤러리. email·수정토큰 제외, `__` 접두 이름 필터 | `{ok, plans}` |
| 기존 | `GET /exec?action=mine&edit=<개인토큰>` | plans 본인 제출분 반환(재제출 프리필) | `{ok, plan}` |
| 추가 | `POST /exec` + body `form: "proposal"` | email+cycle 기준 기획안 upsert, Gemini 검토 저장, 확인 메일 발송 | `{ok, resubmit, ai_reviewed}` |
| 추가 | `GET /exec?action=proposals&t=<공유토큰>` | 사이클 기획안 전체 목록. email·수정토큰 제외, cycle 포함 | `{ok, proposals}` |
| 추가 | `GET /exec?action=proposal-mine&edit=<개인토큰>` | 해당 수정토큰의 기획안 반환(재제출 프리필) | `{ok, proposal}` |

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
| 10 | `ai_review` | Gemini 검토 결과. 호출 실패 시 빈 값 |
| 11 | `edit_token` | 행 최초 생성 시 발급되는 개인 수정토큰. 재제출 시 유지 |
| 12 | `submit_count` | 같은 email+cycle의 누적 제출 횟수 |

## 토큰 (리포에 커밋 금지)

- 갤러리 공유토큰: Script Properties `GALLERY_TOKEN` (확인 이메일의 갤러리 링크에도 포함)
- 개인 수정토큰: 시트 `edit_token` 컬럼 (확인 이메일의 수정 링크)

## Gemini API 키 등록

키는 코드나 HTML에 넣지 않고 Apps Script의 Script Properties에만 등록한다.

| 단계 | 작업 |
|------|------|
| 1 | Apps Script 편집기에서 **프로젝트 설정**(톱니바퀴)을 연다. |
| 2 | **스크립트 속성**에서 **스크립트 속성 추가**를 누른다. |
| 3 | 속성 이름에 `GEMINI_API_KEY`, 값에 발급받은 Gemini API 키를 입력하고 저장한다. |
| 4 | 필요하면 `setup()`을 한 번 실행해 `plans`, `proposals` 시트와 `GALLERY_TOKEN` 생성을 확인한다. |

`GEMINI_API_KEY`가 없거나 Gemini 요청이 실패해도 기획안 저장과 확인 메일 발송은 계속된다. 이때 `ai_review`는 빈 값이고 메일에는 "AI 검토는 잠시 후 다시 시도됩니다"가 표시된다.

## 코드 수정 → 재배포

| 순서 | 위치 | 명령 |
|------|------|------|
| 1 | 리포 루트 | `cd system/plan-backend` |
| 2 | `system/plan-backend` | `clasp push -f` |
| 3 | `system/plan-backend` | `clasp redeploy AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs -d "설명"` |

배포 ID가 바뀌면 웹앱 URL도 바뀌므로 `docs/plan/index.html`·`docs/plan/gallery/index.html`·`docs/submit/index.html`·`docs/submit/gallery/index.html`의 `API_URL`을 함께 갱신할 것.
새 배포(`clasp deploy`) 대신 반드시 `redeploy`(기존 배포 업데이트)를 쓸 것 — URL 유지.
