# review-worker — 기획안 AI 검토 워커 (맥미니 claude -p)

기획안 AI 검토를 Gemini 동기 호출에서 **맥미니 `claude -p`(구독 인증) 비동기 폴링**으로 이관한 워커 (2026-07-27).
이관 사유: Gemini GCP 프로젝트 월 지출 한도 초과(429)로 검토 전면 중단 + Gemini 의존 축소.

## 흐름

```
참가자 제출(기획안·영상 공통) → GAS: 저장만 (제출 시점 메일 없음)
맥미니 launchd(10분 주기):
  기획안 — review-pending 폴링 → claude -p (sonnet) 검토 → form:"review" 저장
           → GAS가 접수 전문+검토 통합 메일 발송
  영상   — verify-pending 폴링(같은 사이클 기획안 조인) → yt-dlp로 자막 추출·정제(60k자 캡)
           → claude -p (sonnet): 기획-영상 일치·훅·구성·CTA 검토 → form:"video-review" 저장
           → GAS가 인증 확인+검토 통합 메일 발송. 자막 없으면 제목·기획안 기반 제한 검토로 폴백(메일에 고지)
```

실패(claude 비정상 종료·빈 출력·재제출 경합 stale)는 **저장하지 않고 다음 주기에 자동 재시도**된다.
주의: 확인 메일이 검토에 묶여 있으므로, 검토가 계속 실패하면 참가자는 메일을 못 받는다 — `action=diag`의 `review_pending`이 감시 지표.

## 파일

| 파일 | 위치 |
|------|------|
| `review-worker.sh` | 리포 커밋 (시크릿 없음). 맥미니 클론 `~/Projects/youtube-challenge/system/review-worker/` 에서 실행 |
| `com.ggplab.ytc-review.plist` | 리포는 템플릿. 실물은 맥미니 `~/Library/LaunchAgents/` |
| `~/.config/ytc-review/env` | **맥미니 전용, 커밋 금지.** `YTC_WORKER_TOKEN=<값>` (선택: `YTC_CLAUDE_MODEL`, `YTC_EXEC_URL`) |
| `~/.config/ytc-review/worker.log` | 건별 처리 로그 (SAVED/SKIP, claude rc, GAS 응답) |

## 보안 설계 (변경 시 반드시 유지)

- **WORKER_TOKEN ≠ 갤러리 토큰.** 갤러리 토큰은 참가자 전원의 접수 메일에 배포되는 값이라, 그걸로 review 계열을 보호하면 참가자가 `review-pending`의 edit_token 목록(→ 타인 기획안 덮어쓰기·`proposal-mine`으로 이메일 조회)과 검토 위조에 접근한다. 워커 토큰 발급: `GET ?action=worker-token-mail&t=<갤러리토큰>` → 운영자 메일로만 발송.
- **claude 실행은 빈 mktemp cwd + `--disallowedTools` 전면 차단.** 기획안 본문은 비신뢰 입력 — 프롬프트 인젝션으로 로컬 파일을 읽어 검토 텍스트에 실어 유출하는 경로를 막는다.
- **참가자 텍스트는 jq로만 프롬프트에 조립.** unquoted heredoc에 넣으면 `$()`·백틱이 셸에서 실행된다.
- **빈 검토는 POST 금지** (GAS도 거부). 저장되는 순간 pending에서 빠져 영구 미검토가 된다.
- **curl은 `-sL`, `-X POST` 금지** (plan-backend README의 302/405 함정과 동일).

## 맥미니 프로비저닝 (1회)

```bash
ssh macmini
mkdir -p ~/.config/ytc-review && chmod 700 ~/.config/ytc-review
printf 'YTC_WORKER_TOKEN=<운영자 메일로 받은 값>\n' > ~/.config/ytc-review/env && chmod 600 ~/.config/ytc-review/env
cd ~/Projects/youtube-challenge && git pull
cp system/review-worker/com.ggplab.ytc-review.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ggplab.ytc-review.plist
launchctl kickstart gui/$(id -u)/com.ggplab.ytc-review
```

주의: `claude -p`는 **launchd gui 도메인에서만** 키체인 인증이 된다. ssh에서 스크립트를 직접 실행하면 조회(curl) 파트는 되지만 claude가 "Not logged in"으로 죽는다 — 디버깅은 `launchctl kickstart` + `worker.log`로 한다. 스크립트 수정은 커밋 → 맥미니 `git pull`(자동 pull은 1시간 주기라 급하면 수동).

## 검증 명령

```bash
# 미검토 건수 (토큰 불요 진단)
curl -sL '<EXEC_URL>?action=diag&t=<갤러리토큰>'   # → review_pending: N
# 워커 로그
ssh macmini tail -20 ~/.config/ytc-review/worker.log
```

## 은퇴 시

`launchctl bootout gui/501/com.ggplab.ytc-review` + plist 삭제 + `~/Projects/shared/governance/decommission-log.md` 기록 (bootout만으로는 다음 로그인에 되살아난다).
