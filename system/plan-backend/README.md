# plan-backend — 채널 한 장 기획서 백엔드

Google Apps Script Web App + 구글시트. `/plan/` 폼 제출을 저장하고 확인 이메일(작성 내용 전문 + 갤러리·수정 링크)을 발송한다.

## 구성

| 항목 | 값 |
|------|-----|
| 스크립트 | https://script.google.com/d/10d4YebiJYUwxn1qujzg32b5fz0smXjxLBLEcvSdYxNXRJY1cQjkQZQ4Y/edit |
| 데이터 시트 (비공개) | https://drive.google.com/open?id=1R8oCmjfn-TeMinl6Hyhm0kMbGxPTTpDxYwSnA8eKtxs |
| 웹앱 배포 ID | `AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs` (@1) |
| 웹앱 URL | `https://script.google.com/macros/s/<배포ID>/exec` |
| 실행 계정 | jayjunglim@gmail.com (MailApp 발신, 일 100통 한도) |

## API

- `POST /exec` — body: 폼 필드 JSON (`Content-Type: text/plain` — CORS preflight 회피). email 기준 upsert + 확인 메일 발송. `{ok, resubmit}`
- `GET /exec?action=gallery&t=<공유토큰>` — 참여자 갤러리 JSON. **email 필드 제외**, `__` 접두 이름 필터
- `GET /exec?action=mine&edit=<개인토큰>` — 본인 제출분 반환 (재제출 프리필)

## 토큰 (리포에 커밋 금지)

- 갤러리 공유토큰: Script Properties `GALLERY_TOKEN` (확인 이메일의 갤러리 링크에도 포함)
- 개인 수정토큰: 시트 `edit_token` 컬럼 (확인 이메일의 수정 링크)

## 코드 수정 → 재배포

```bash
cd system/plan-backend
clasp push -f
clasp redeploy AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs -d "설명"
```

배포 ID가 바뀌면 웹앱 URL도 바뀌므로 `docs/plan/index.html`·`docs/plan/gallery/index.html`의 `API_URL`을 함께 갱신할 것.
새 배포(`clasp deploy`) 대신 반드시 `redeploy`(기존 배포 업데이트)를 쓸 것 — URL 유지.
