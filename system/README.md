# system — 챌린지 운영 시스템 (placeholder)

> **아직 코드 없음.** 진행 확정 시 이 문서의 아키텍처대로 개발한다.
> 원칙: 새로 만들지 않고, 실운영으로 검증된 두 시스템에서 차용한다.

## 아키텍처 (계획)

```
Discord (전용 서버)
  ├── /기획  ─→ Edge Function: plan-review
  │             ├── 기획안 파싱 (타깃·주제·구성)
  │             ├── AI 검토 (Gemini) — 후킹·타깃 적합성·구성 관점 코멘트
  │             └── follow-up 회신 + 기획 로그 시트 기록
  ├── /인증  ─→ Edge Function: video-verify
  │             ├── YouTube URL 검증 (롱폼만 — /shorts/ 거부)
  │             ├── oEmbed로 제목·채널 수집 + AI 간단 회신
  │             └── 인증 시트 기록 + 갤러리 반영
  └── 사이클 정산 ─→ Edge Function: cycle-summary (pg_cron, 격주 월요일)
                ├── 사이클별 ✅/❌ + 🔥연속 사이클 집계
                └── Discord 정산 카드 게시
GitHub Pages: 공개 갤러리 (영상 아카이브 + 스트릭)
```

## 차용 매핑

| 이 시스템 | 차용원 | 원본 위치 | 바꿀 것 |
|-----------|--------|-----------|---------|
| `video-verify` | 시즌1 `discord-verify` | content-designer-challenge `supabase/functions/discord-verify/` | 플랫폼 분류 → 롱폼 YouTube 단일 검증, 메달 → 스트릭 (시즌2 준비 커밋에 이미 반영됨) |
| `plan-review` | n8n 도서 챌린지 `/피드백` | n8n-book-challenge `supabase/functions/discord-n8n-challenge-verify/` | 입력을 워크플로우 JSON → 기획안 텍스트로, 검토 프롬프트를 기획 관점(후킹·타깃·구성)으로 교체 |
| `cycle-summary` | 시즌1 `weekly-summary` | content-designer-challenge `supabase/functions/weekly-summary/` | 주간 → 격주(사이클) 집계, 달성/미달성 + 스트릭 포맷 |
| 갤러리 | 시즌1 대시보드 | content-designer-challenge `web/` | 사이클 단위 표기, 시즌2 배너 |

## 재사용 인프라 (시즌1 보존분)

- Supabase 프로젝트·Edge Function·Secrets: 보존 상태 — 복원 절차는 content-designer-challenge `docs/season1-pause.md`
- 데이터: Google Sheets (시즌2 전용 탭 분리 필수 — 주차 레이블 충돌 방지)
- 봇: 시즌1 Discord 봇 재사용, 새 서버(길드)에 커맨드 재등록

## 개발 착수 조건

1. 모집 방식·인원 확정
2. 전용 Discord 서버 개설 (서버 ID·채널 ID 확보)
3. 시즌2 시트 탭 생성 + Secrets 갱신
