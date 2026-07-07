# 참여자 신청 폼 + 자동 반영 (구현 완료 2026-07-08)

> 상태: **구현·배포 완료**. `docs/index.html` 안에 프론트+Supabase 연동으로 들어감.
> 라이브: https://challenge.buildnwrite.com

## 구현된 것

1. **참여자 3명 정적 seed 카드** — 강슬기·오준엽·임정. 스레드 프로필 사진(`docs/img/{seulki,junyeop,jay}.jpg`) + 대문 원문 + 스레드/링크드인 팔로워 실측.
2. **CTA "참여 신청하기"** 2곳(참여자 섹션 아래 · 마감 배너) → 모달 폼.
   - 필드: 이름(필수) · 희망 콘텐츠 주제/참여동기 · 스레드 URL · 링크드인 URL · 내 링크 (뒤 4개 선택)
3. **제출 즉시 자동 반영** — Supabase insert → 카드 자동 렌더. 신규 신청자 이미지는 이니셜 placeholder 아바타(SVG).
4. **시즌1 대시보드 이미지** → https://ggplab.github.io/content_designer_challenge/ 링크.
5. **HTTPS** — Cloudflare 프록시(주황) + SSL "Full"로 엣지 인증서. (GitHub Pages 자체 인증서는 발급이 안 잡혀서 CF 엣지로 우회)

## 백엔드

- Supabase 프로젝트: **ggplab_homepage** (`tcxtcacibgoancvoiybx`) 재사용. URL/anon 키는 `index.html`에 하드코딩(anon은 공개용).
- 테이블 `public.participants` (id, name, motive, threads_url, linkedin_url, link_url, created_at).
- RLS: anon **insert + select만** 허용 (update/delete 없음 — 그래서 삭제는 SQL Editor에서만 가능).
- 프론트 가드: 이름이 `__`로 시작하는 행은 렌더에서 제외(테스트/예약 접두).

## 남은 선택 항목 (필요 시)

- **테스트 행 정리(선택)**: 검증용 2행이 DB에 남아있음(프론트에서 숨겨져 공개엔 안 뜸). SQL Editor에서:
  ```sql
  delete from public.participants where name like '\_\_%';
  ```
- **승인 게이트(선택)**: 현재 **무검수 즉시 공개**. 스팸/부적절 신청 우려 시 `status` 컬럼 + select 정책을 `status='approved'`로 좁히고, 승인 UI(대시보드 또는 별도)로 전환. 인스타 공개 모집이라 유입량 보고 판단.
- **anon 키 노출 범위**: ggplab_homepage 프로젝트를 공유하므로, 이 프로젝트의 **다른 테이블 RLS가 안전한지** 한 번 점검 권장(anon 키가 challenge 사이트에 공개됨).
