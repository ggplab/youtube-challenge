export const meta = {
  name: 'kr-creator-positioning-research',
  description: '국내 AI/IT 유튜버·인플루언서 포지셔닝 딥리서치 — 스윕·스코어·기회영역 합성',
  phases: [
    { title: 'Sweep', detail: '카테고리별 국내 채널 발굴 (Sonnet ×8)', model: 'sonnet' },
    { title: 'Score', detail: '2축 좌표 스코어링', model: 'sonnet' },
    { title: 'Synthesize', detail: '빈 포지션·기회의 땅 도출' },
  ],
}

// AXES: 대표 차원 2개 (Phase 2에서 선정한 X·Y축). 요청 도메인에 맞게 축 정의를 교체하라.
const AXES = {
  x: '타겟의 기술 배경 — 0: 완전 비개발자·일반 직장인 대상, 50: 반기술적(노코드 파워유저), 100: 전문 개발자 대상',
  y: '콘텐츠 산출 깊이 — 0: 도구 소개·뉴스·리뷰(정보 소비), 50: 단일 기능 튜토리얼, 100: 엔드투엔드 시스템 구축·실전 비즈니스 산출물(따라 만들면 결과물이 남음)',
}

const CHANNELS_SCHEMA = {
  type: 'object', required: ['channels'],
  properties: {
    channels: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'subscribers_text', 'target', 'format', 'topic'],
        properties: {
          name: { type: 'string' },
          subscribers_text: { type: ['string', 'null'], description: '예: "68.6만 (2026-01 기준)" — 확인 못하면 null. 절대 추정 금지' },
          subscribers_num: { type: ['number', 'null'], description: '구독자수 숫자 (만 단위 아님, 명 단위). 미확인 null' },
          target: { type: 'string', description: '주 시청층 한 줄' },
          format: { type: 'string', description: '콘텐츠 포맷 한 줄' },
          topic: { type: 'string', description: '주력 주제 한 줄' },
          evidence_url: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
        },
      },
    },
  },
}

const SCORES_SCHEMA = {
  type: 'object', required: ['scores'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object', required: ['name', 'x', 'y', 'rationale'],
        properties: {
          name: { type: 'string' },
          x: { type: 'number', description: '0=완전 비개발자 대상, 100=전문 개발자 대상' },
          y: { type: 'number', description: '0=도구 소개·뉴스·리뷰, 100=엔드투엔드 시스템 구축·실전 산출물' },
          rationale: { type: 'string' },
        },
      },
    },
  },
}

const SYNTH_SCHEMA = {
  type: 'object', required: ['empty_zones', 'recommendation', 'crowded_zones'],
  properties: {
    empty_zones: {
      type: 'array',
      items: {
        type: 'object', required: ['label', 'x_center', 'y_center', 'why_empty', 'opportunity', 'risk'],
        properties: {
          label: { type: 'string' }, x_center: { type: 'number' }, y_center: { type: 'number' },
          why_empty: { type: 'string' }, opportunity: { type: 'string' }, risk: { type: 'string' },
        },
      },
    },
    crowded_zones: { type: 'array', items: { type: 'object', required: ['label', 'channels'], properties: { label: { type: 'string' }, channels: { type: 'array', items: { type: 'string' } } } } },
    recommendation: { type: 'string', description: '의뢰인에게 권하는 포지션 1개와 근거' },
  },
}

// CATEGORIES: 스윕 카테고리 목록. 요청 도메인에 맞게 조정하라 —
// 아래는 AI/IT 크리에이터 지형용 예시. 다른 도메인(예: 재테크·요리·교육)이면
// key·q를 그 지형의 대표 하위 카테고리 6~8개로 교체하고, q에는 앵커 채널명을 2~3개 넣어주면 스윕 품질이 오른다.
const CATEGORIES = [
  { key: 'ai-productivity', q: 'AI 도구 활용·직장인 생산성 (예: 일잘러 장피엠, 알린, 유튜브신쌤 류의 현재 지형)' },
  { key: 'nocode-automation', q: '노코드·업무 자동화 (n8n, Make, Zapier, 기묘한 자동화, 시민개발자 구씨 류)' },
  { key: 'coding-edu', q: '코딩 교육·개발 입문 (조코딩, 노마드 코더, 코딩애플, 생활코딩 류)' },
  { key: 'ai-deep-tech', q: 'AI/ML 기술 심화·개발자 대상 (테디노트, 빵형의 개발도상국 류)' },
  { key: 'ai-news-review', q: 'AI 뉴스·트렌드·리뷰 (안될공학, AI 관련 시사·리뷰 채널)' },
  { key: 'ai-monetize', q: 'AI 수익화·1인 창업·사이드프로젝트 (AI로 돈벌기, 자동화 수익 류)' },
  { key: 'agentic-claude', q: 'Claude·Claude Code·바이브코딩·에이전틱 코딩 특화 국내 채널 (신규 포함)' },
  { key: 'rising-2026', q: '2025~2026 급성장·신흥 국내 AI 크리에이터 (구독자 급증, 새 채널)' },
]

phase('Sweep')
const sweeps = await parallel(CATEGORIES.map(c => () =>
  agent(
    `너는 시장조사 리서처다. 한국(한국어) 유튜브/인플루언서 지형에서 다음 카테고리의 **현재 활동 중인 국내 채널**을 발굴하라: "${c.q}".\n\n` +
    `- WebSearch를 최소 4회 이상, 서로 다른 한국어 검색어로 수행하라 (채널명 직접 검색 포함).\n` +
    `- 국내(한국어 콘텐츠) 채널만. 해외 채널 제외.\n` +
    `- 구독자 수는 검색 결과에서 실제로 확인된 값만 기록하고 기준 시점을 함께 적어라. 확인 못하면 null — **절대 추정·조작 금지**.\n` +
    `- 채널당: 이름, 구독자, 주 시청층, 콘텐츠 포맷, 주력 주제, 근거 URL.\n` +
    `- 5~12개 채널을 목표로 하되, 무리해서 채우지 말 것.\n` +
    `최종 출력은 구조화 스키마로만.`,
    { label: `sweep:${c.key}`, phase: 'Sweep', schema: CHANNELS_SCHEMA, model: 'sonnet' }
  )
))

const seen = new Map()
for (const r of sweeps.filter(Boolean)) {
  for (const ch of r.channels) {
    const key = ch.name.replace(/\s+/g, '').toLowerCase()
    if (!seen.has(key)) seen.set(key, ch)
    else {
      const prev = seen.get(key)
      if (!prev.subscribers_num && ch.subscribers_num) seen.set(key, { ...ch, notes: [prev.notes, ch.notes].filter(Boolean).join(' / ') })
    }
  }
}
const channels = [...seen.values()]
log(`스윕 완료: 중복 제거 후 ${channels.length}개 채널`)

phase('Score')
const BATCH = 8
const batches = []
for (let i = 0; i < channels.length; i += BATCH) batches.push(channels.slice(i, i + BATCH))
const scoreResults = await parallel(batches.map((b, i) => () =>
  agent(
    `다음 국내 유튜브 채널들을 2차원 포지셔닝 축에 스코어링하라.\n\n` +
    `X축 (0~100): ${AXES.x}\nY축 (0~100): ${AXES.y}\n\n` +
    `채널 데이터:\n${JSON.stringify(b, null, 2)}\n\n` +
    `- 각 채널의 target/format/topic 정보를 근거로 판단하고, 불확실하면 WebSearch로 해당 채널의 대표 영상 몇 개를 확인한 뒤 판단하라.\n` +
    `- rationale은 한 줄로.\n- 모든 채널을 빠짐없이 스코어링하라.`,
    { label: `score:batch${i + 1}`, phase: 'Score', schema: SCORES_SCHEMA, model: 'sonnet' }
  )
))
const scores = new Map()
for (const r of scoreResults.filter(Boolean)) for (const s of r.scores) scores.set(s.name.replace(/\s+/g, '').toLowerCase(), s)
const positioned = channels.map(ch => {
  const s = scores.get(ch.name.replace(/\s+/g, '').toLowerCase())
  return s ? { ...ch, x: s.x, y: s.y, rationale: s.rationale } : null
}).filter(Boolean)
log(`스코어링 완료: ${positioned.length}/${channels.length}개 좌표 확정`)

phase('Synthesize')
// 의뢰인 컨텍스트는 args.client_context로 주입한다 — Phase 1에서 작성한
// 채널 한 장 기획서 초안을 3~5줄로 요약해 넘길 것 (이름/브랜드, 자산, 시그니처, 강점 스택).
const synth = await agent(
  `국내 AI/IT 유튜버 포지셔닝 맵 데이터가 주어진다. 빈 포지션(기회의 땅)을 도출하라.\n\n` +
  `X축 (0~100): ${AXES.x}\nY축 (0~100): ${AXES.y}\n\n` +
  `채널 좌표:\n${JSON.stringify(positioned.map(p => ({ name: p.name, x: p.x, y: p.y, subs: p.subscribers_text, topic: p.topic })), null, 2)}\n\n` +
  `의뢰인 컨텍스트: ${args.client_context}\n\n` +
  `- 밀집 구역(crowded)과 빈 구역(empty)을 좌표로 특정하라.\n` +
  `- 빈 구역마다: 왜 비었는지(수요가 없어서인지, 어려워서인지), 기회, 리스크.\n` +
  `- 의뢰인에게 권하는 포지션 1개를 좌표와 함께 제시하라.`,
  { label: 'synthesize', phase: 'Synthesize', schema: SYNTH_SCHEMA }
)

return { axes: AXES, positioned, synthesis: synth }
