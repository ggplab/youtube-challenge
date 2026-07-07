# TODO: 참여자 신청 폼 + 자동 반영 (보류 — 나중에)

> 상태: **보류 (2026-07-08 결정)**. 아래 스펙대로 나중에 구현. 지금은 참여자 3명 정적 카드까지만 라이브.
> 요청 맥락: 제안서(`docs/index.html`, challenge.buildnwrite.com)를 사람들이 클릭해 구경하고 직접 참여 신청까지 하는 인터랙티브 랜딩페이지로 확장.

## 해야 할 일 3가지

1. **시즌1 대시보드 스크린샷 링크 연결**
   - `season1-dashboard.png` · `season1-recent.png` 2장을 클릭하면 **라이브 시즌1 대시보드**로 이동 (`<a>`로 감싸기).
   - ⚠️ **미정: 링크 대상 URL** — 시즌1 공개 대시보드 실제 주소 필요 (content-designer-challenge `web/` 배포처). 사용자에게 URL 받아야 함.

2. **CTA "참여 신청하기" 버튼 + 모달 팝업 폼**
   - 섹션 중간중간에 CTA 버튼 배치 (예: 참여자 섹션 아래 / 08 모집 섹션 / 09 액션 근처).
   - 클릭 시 모달 팝업. 폼 필드:
     - `이름`
     - `스레드 URL`
     - `링크드인 URL`
     - `기타 대표 프로필 URL`
   - (이메일 등 민감정보 미수집 — 시즌1 PII 교훈)

3. **제출 시 사이트에 참여자 카드 자동 반영**
   - 정적 사이트(GitHub Pages)라 백엔드 필요.

## 아키텍처 (제안, 미확정)

```
[모달 폼 제출] → Supabase participants 테이블 insert (status=pending)
[페이지 로드]  → status=approved 인 행 fetch → 카드 동적 렌더
                 (기존 3명 강슬기·오준엽·임정은 정적 HTML seed로 유지,
                  그 아래로 신규 승인 신청자가 붙음 → JS/Supabase 꺼져도 코어 3명은 보임 + PNG 내보내기 안전)
```

- 테이블 `participants`: id, name, threads_url, linkedin_url, other_url, status(pending/approved), created_at
- RLS: anon INSERT 허용(status는 pending 강제), anon SELECT는 status=approved만
- 클라이언트: `@supabase/supabase-js` (CDN/esm) — GitHub Pages는 CSP 제약 없어 외부 스크립트 OK
- Supabase 프로젝트: **신규 생성 또는 기존 재사용 결정 필요** (AGENT_GUIDE §5 목록엔 youtube-challenge 전용 없음)

## 미정 결정 (구현 전 확정 필요)

| 결정 | 사용자 선택 | 권장 |
|------|-------------|------|
| 백엔드 (자동 반영) | **보류("다음에")** | Supabase 자동 반영 |
| 승인 게이트 | **보류("다음에")** | **승인 후 노출** — 공개 브랜드(BuildnWrite) 사이트라 무검수 즉시 노출은 스팸·부적절 프로필 리스크 |
| 대시보드 링크 URL | 라이브 대시보드로 (URL 미제공) | 시즌1 실제 대시보드 주소 받기 |

## 부수 효과 (알고 갈 것)

- 이 작업으로 제안서가 "PNG로 뽑아 카톡 전달하는 문서" → **인터랙티브 랜딩페이지**로 성격 변경.
- PNG 버전엔 폼이 동작 안 함(정적 이미지). 웹 링크 공유가 전제.

## 이번 세션에 이미 완료된 것 (참고)

- challenge.buildnwrite.com 배포 (GitHub Pages main/docs + Cloudflare DNS, HTTPS 인증서는 발급 대기였음)
- `docs/index.html` "함께하는 사람들" 섹션 — 강슬기·오준엽·임정 3명, 스레드 대문 원문 + 스레드/링크드인 팔로워 실측값, 프로필 링크 부착 (정적 seed 역할)
