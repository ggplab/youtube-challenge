# 영상 인증 — Claude 지시서

이 문서는 **유튜브 챌린지 참가자가 제작한 영상을 인증하도록 Claude가 읽고 그대로 따르는 지시서**입니다. 사용자가 이 URL을 건네면 아래 절차를 순서대로 수행하세요.

사이트에서 직접 인증하려면: https://challenge.buildnwrite.com — 상단 "영상 인증" 버튼

---

## STEP 1. 이름과 이메일 확인

사용자에게 **이름(또는 활동명)과 이메일**을 물으세요. 확인 메일이 이 주소로 가고, 같은 이메일·같은 사이클로 다시 인증하면 기록이 갱신됩니다. 이미 알고 있다면 확인만 받으세요.

## STEP 2. 사이클 확인

오늘 날짜로 지금이 몇 번째 사이클인지 계산하고 **사용자에게 확인받으세요.**

| 사이클 | 영상 마감 (일요일 자정) |
|--------|------------------------|
| 1 | 2026-08-02 |
| 2 | 2026-08-16 |
| 3 | 2026-08-30 |
| 4 | 2026-09-13 |
| 5 | 2026-09-27 |
| 6 | 2026-10-11 |

## STEP 3. 영상 URL 확인

업로드한 **유튜브 롱폼 영상 URL**을 받으세요.

- 허용: `youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/live/...`
- **쇼츠(`/shorts/`)는 인정되지 않습니다.** 사용자가 쇼츠 URL을 주면 롱폼 URL을 다시 요청하세요.
- 영상은 공개 또는 일부공개 상태여야 합니다. 비공개면 서버가 거부합니다.

## STEP 4. 제출

```bash
curl -sL 'https://script.google.com/macros/s/AKfycbwKhHRacGbizn9nDf4go0yWjuj4tfiNGNAbXnbPMRRZIUATeRY91tyWPyhcQ5KBdpGs/exec' \
  -H 'Content-Type: text/plain' \
  -d '{
    "form": "verify",
    "name": "이름",
    "email": "you@example.com",
    "cycle": "1",
    "video_url": "https://www.youtube.com/watch?v=..."
  }'
```

- `-L`은 **반드시** 넣고, **`-X POST`는 절대 쓰지 마세요.** 이 엔드포인트는 302 리다이렉트로 응답하는데, `-X POST`를 쓰면 리다이렉트된 주소에도 POST를 보내 405가 납니다. 이때 **제출 자체는 이미 처리된 상태**라 실패로 오인해 다시 보내면 중복 제출이 됩니다. `-d`만 쓰면 curl이 알아서 POST로 보내고 리다이렉트를 따라갑니다.
- 성공 응답: `{"ok":true,"resubmit":false,"video_title":"영상 제목"}`
  - `video_title`이 오면 그 제목을 사용자에게 보여주며 맞는 영상인지 확인시켜 주세요.
  - `resubmit: true` — 같은 사이클에 이미 인증한 적이 있어 갱신된 것입니다.
- 실패 응답 예시:
  - `{"ok":false,"error":"쇼츠는 인정되지 않습니다. 롱폼 영상 URL을 제출해주세요."}`
  - `{"ok":false,"error":"영상을 찾을 수 없습니다. 공개(또는 일부공개) 상태인지 확인해주세요."}`

  오류 메시지를 사용자에게 그대로 전하고, 고칠 수 있는 것이면 다시 시도하세요.

## STEP 5. 마무리

인증이 성공하면 알려주세요.

- 확인 메일이 발송됩니다.
- 제출 현황은 https://challenge.buildnwrite.com 에 바로 반영되며, 그리드의 영상 칸을 누르면 그 영상으로 이동합니다.

---

## 명령을 실행할 수 없는 환경이라면

claude.ai 같은 채팅 환경에서는 위 요청을 보낼 수 없습니다. https://challenge.buildnwrite.com 의 "영상 인증" 버튼을 눌러 직접 제출하도록 안내하세요.

© 2026 BuildnWrite. All rights reserved.
