# 세션 핸드오프 2026-07-13

## 이번 세션 산출물 (커밋 기준)
- `e1f432a` feat: 기획서 백엔드 — Apps Script+구글시트 (upsert·확인메일·갤러리·프리필 API)
- `c98dea5` feat: 기획서 폼 고도화 — AI 프롬프트 복사·이메일 발송·재제출 프리필 + 참여자 갤러리 신설
- `e2ae7bd` docs: 온라인 OT 07-25(토) 오전 10시 확정 — 기획서 숙제·OT 발표 프레임 반영

핵심 결정: 기획서(plans) DB를 Supabase → **구글시트+Apps Script**로 전환 (이메일 발송이 MailApp으로 공짜·간단). 참여 신청 폼(participants)은 Supabase 유지. 백엔드 운영 SSOT: `system/plan-backend/README.md` (재배포는 반드시 `clasp redeploy` — 새 deploy는 URL이 바뀜).

검증 완료: 제출→시트 upsert, 확인 이메일(전문+갤러리·수정 링크), 갤러리 토큰 접근·이메일 비노출, 재제출 프리필, AI 프롬프트 복사 — 전부 라이브 실측. 테스트 행은 시트에서 삭제함.

## 미완 항목
1. **Supabase 구 `plans` 테이블 정리** — 어디까지: 프론트 참조 제거 완료, 테이블은 미사용 상태로 잔존(테스트 행 `__test_button_check` 포함) / 블로커: `SUPABASE_ACCESS_TOKEN`(sbp_) 만료로 Management API 401 / 첫 단계: 대시보드(ggplab_homepage)에서 수동 정리 또는 새 personal access token 발급 후 `~/.zshenv` 갱신
2. **카톡 공유 자산 재생성 (선택)** — 제안서 내용 변경(온라인 OT 확정)으로 `docs/proposal.png`·`docs/kakao/` 카드 4장이 구버전. 공유 다시 돌릴 거면 재생성 필요

## 결정 보류
- 없음 (갤러리 접근=토큰 링크, 배포=clasp, 신청폼=Supabase 유지 모두 이번 세션에 확정)

## 다음 세션 첫 작업 거점
- 모집 마감 07-19(일) → OT 07-25(토) 10:00 온라인. 참여자들에게 기획서 링크(challenge.buildnwrite.com/plan) 배포 시점 결정
- `system/` 본편(Discord `/기획` `/인증` 봇) 개발 착수 여부 — README 부록 참고

## 추천 스킬
- `/delegate` — proposal.png·카톡 카드 재생성 같은 반복 렌더 작업
- `/review-inquiry` 아님 — 봇 개발 착수 시 `/plan`으로 시작
