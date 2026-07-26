# 세션 핸드오프 2026-07-26

챌린지 안내 메일 발송 실패 대응으로 시작해, 원인이 맥미니 launchd 환경변수 문제로 드러나면서 자동화 계층 정리까지 이어진 세션.

## 이번 세션 산출물

### 챌린지 운영
- 12주 진행 안내 메일 발송 완료 — messageId `19f9d47343ab1f89`, To 본인 + **Bcc 4명**, 2026-07-26 16:15 KST
- 본문·수신자는 맥미니에 준비돼 있던 원본 그대로. 내용 수정 없음
- 예약 잡(`com.limjung.ytc-guide-mail`)은 임무 완료로 은퇴 처리

### 인프라 (커밋은 `~/Projects/shared`)
- `9c8832d` docs(governance): 은퇴 잡 디커미션 로그 + sweep-automation 스킬 등록
- AGENT_GUIDE §12에 launchd 환경변수·은퇴 규칙 추가

### 신규 자산
| 위치 | 내용 |
|------|------|
| `~/Projects/shared/governance/decommission-log.md` | 은퇴 컨벤션 SSOT + 절차 + 잡 3건 기록 |
| `~/.claude/skills/sweep-automation/` | 스킬 + `collect.py` + `lint_env.py` + 회귀 테스트 |

> 사고 원인·타임라인·근거는 위 두 문서에 있다. 여기에 복사하지 않는다.

## 처리된 것

| 항목 | 결과 |
|------|------|
| 맥미니 gws 재인증 | 완료. **launchd 동일 환경**(`env -i` + plist 변수)에서 API 호출 성공 + 크리덴셜 생존 확인 |
| gmail-router 복구 | 16:24 주기부터 정상 (`erp=4 inquiry=8 both-route=3`, 오류 0) |
| 은퇴 plist 3건 | `.plist.disabled` 리네임 + bootout + 미로드 확인 |
| 컨벤션 통일 | 3종 난립 → `.plist.disabled` 인플레이스로 수렴 |

## 미완 항목

1. **첫 스위프 결과 판정 대기** — `/sweep-automation` 첫 실행은 끝났고 조치는 안 함(dry-run).
   - `com.limjung.claude-code-ping` (맥북): **조치필요.** 파일은 `.disabled`인데 아직 로드 중 — bootout 누락. 지금도 실행 중
   - `ai.handoff.oneshot.*` 4건 (맥미니): 유예. handoff `--cleanup` 소관인지 확인 필요
   - `wifi-monitor`(양쪽)·`wake-macbook`·`projects-autopull`: 유예. 로그 44~95일 침묵이 **근거 1개뿐**이라 근거 2개 규칙 미충족
   - 첫 단계: `cd ~/.claude/skills/sweep-automation && python3 scripts/collect.py --report`

2. **`knu-triage-worker` SSL 오류** — 맥미니, 07-26 10:01 `URLError: EOF ... _ssl.c:1129`. gws와 무관한 별건. 미조치

3. **`sweep-automation` 스킬이 버전관리 밖** — `~/.claude`가 git 레포가 아니라 스킬이 추적되지 않는다. dotfiles 레포로 옮길지 결정 필요

## 결정 보류

- **다중 기록자 탐지의 코드 기본값 미커버** — `collect.py`는 `--config` env 파일 선언만 본다. 스크립트에 하드코딩된 state 경로(`erp-ingest.env`가 실제 그렇다)와 n8n 워크플로는 안 잡힌다. `없음` 출력에 경고를 붙여뒀지만, 재활성 판정 전에는 수동 grep이 필요하다. 근본 해결은 스크립트 AST/grep 스캔 추가
- **`~/Projects/shared/scripts/gmail_draft.py` 미커밋 변경** — 이 세션 밖(08:40)에서 생긴 것. 손대지 않음. 원 작성자 의도 확인 필요

## 다음 세션 첫 작업 거점

`com.limjung.claude-code-ping` 부터. 파일을 은퇴시켜놓고 bootout을 안 해서 지금도 도는 상태 — 오늘 정리한 규칙(bootout이 리네임보다 먼저)의 위반 사례가 그대로 남아 있다. 무슨 잡인지 확인하고 판정.

## 추천 스킬

- `/sweep-automation` — 위 미완 1번 판정
- `/healthcheck` — 조치 후 인증·환경 재확인 (스위프 종료 조건)
