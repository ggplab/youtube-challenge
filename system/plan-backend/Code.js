/**
 * youtube-challenge 채널 한 장 기획서 백엔드 (Apps Script Web App)
 *
 * - 저장: 이 스크립트가 바인딩된 구글시트 (비공개, 운영자 소유)
 * - doPost: 기획서 제출 (email 기준 upsert) + 확인 이메일 발송
 * - doGet action=gallery&t=<공유토큰>: 참여자 갤러리 JSON (이메일 제외)
 * - doGet action=mine&edit=<개인토큰>: 본인 제출분 반환 (재제출 프리필용)
 *
 * 최초 1회 setup() 실행 → 시트 헤더 생성 + 갤러리 공유토큰 발급(Script Properties)
 */

var SHEET_NAME = 'plans';
var HEADERS = [
  'created_at', 'updated_at', 'name', 'email', 'channel_name', 'concept',
  'reason', 'pipeline', 'audience', 'cta', 'message', 'edit_token', 'submit_count'
];
var FIELDS = ['name', 'email', 'channel_name', 'concept', 'reason', 'pipeline', 'audience', 'cta', 'message'];
var SITE = 'https://challenge.buildnwrite.com';
var OT_INFO = '7월 25일(토) 오전 10시 · 온라인 OT';
var PROPOSAL_SHEET_NAME = 'proposals';
var PROPOSAL_HEADERS = [
  'created_at', 'updated_at', 'name', 'email', 'cycle', 'target', 'topic',
  'structure', 'links', 'ai_review', 'edit_token', 'submit_count'
];
var PROPOSAL_FIELDS = ['name', 'email', 'cycle', 'target', 'topic', 'structure', 'links'];

var VERIFY_SHEET = 'verifications';
var VERIFY_HEADERS = [
  'created_at', 'updated_at', 'name', 'email', 'cycle',
  'video_url', 'video_title', 'edit_token', 'submit_count'
];
var VERIFY_FIELDS = ['name', 'email', 'cycle', 'video_url'];

function setup() {
  sheet_();
  proposalSheet_();
  Logger.log('GALLERY_TOKEN: ' + galleryToken_());
}

// 시트·토큰은 첫 요청 때 lazy 초기화 — 에디터에서 별도 실행 없이 배포만으로 동작
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function proposalSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROPOSAL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PROPOSAL_SHEET_NAME);
    sh.getRange(1, 1, 1, PROPOSAL_HEADERS.length).setValues([PROPOSAL_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function galleryToken_() {
  var props = PropertiesService.getScriptProperties();
  var t = props.getProperty('GALLERY_TOKEN');
  if (!t) {
    t = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('GALLERY_TOKEN', t);
  }
  return t;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function rows_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return values.map(function (v, i) {
    var o = { _row: i + 2 };
    HEADERS.forEach(function (h, j) { o[h] = v[j]; });
    return o;
  });
}

function proposalRows_() {
  var sh = proposalSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, PROPOSAL_HEADERS.length).getValues();
  return values.map(function (v, i) {
    var o = { _row: i + 2 };
    PROPOSAL_HEADERS.forEach(function (h, j) { o[h] = v[j]; });
    return o;
  });
}

// ── 제출 (upsert by email) ──

function verifySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VERIFY_SHEET);
  if (!sh) {
    sh = ss.insertSheet(VERIFY_SHEET);
    sh.getRange(1, 1, 1, VERIFY_HEADERS.length).setValues([VERIFY_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function verifyRows_() {
  var sh = verifySheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, VERIFY_HEADERS.length).getValues();
  return values.map(function (v, i) {
    var o = { _row: i + 2 };
    VERIFY_HEADERS.forEach(function (h, j) { o[h] = v[j]; });
    return o;
  });
}

// ── 영상 인증 (upsert by email + cycle) ──
function handleVerifyPost_(body) {
  var row = {};
  VERIFY_FIELDS.forEach(function (f) { row[f] = String(body[f] || '').trim(); });
  if (!row.name) return json_({ ok: false, error: '이름이 없습니다.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json_({ ok: false, error: '이메일 형식이 올바르지 않습니다.' });
  if (!/^[1-6]$/.test(row.cycle)) return json_({ ok: false, error: '사이클은 1~6 중 하나여야 합니다.' });

  // 유튜브 롱폼 URL 검증: watch/youtu.be/live 허용, shorts 거부
  var url = row.video_url;
  if (/youtube\.com\/shorts\//i.test(url)) {
    return json_({ ok: false, error: '쇼츠는 인정되지 않습니다. 롱폼 영상 URL을 제출해주세요.' });
  }
  var idMatch = url.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/live\/)([A-Za-z0-9_-]{6,20})/);
  if (!idMatch) {
    return json_({ ok: false, error: '유튜브 영상 URL이 아닙니다. youtube.com/watch?v=... 또는 youtu.be/... 형식으로 제출해주세요.' });
  }
  var canonical = 'https://www.youtube.com/watch?v=' + idMatch[1];

  // oEmbed로 제목 수집 (실패해도 인증은 계속)
  var title = '';
  try {
    var oe = UrlFetchApp.fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(canonical),
      { muteHttpExceptions: true });
    if (oe.getResponseCode() === 200) title = String(JSON.parse(oe.getContentText()).title || '');
    else if (oe.getResponseCode() === 404 || oe.getResponseCode() === 401) {
      return json_({ ok: false, error: '영상을 찾을 수 없습니다. 공개(또는 일부공개) 상태인지 확인해주세요.' });
    }
  } catch (err) { Logger.log('oEmbed failed: ' + err); }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var editToken, submitCount;
  try {
    var sh = verifySheet_();
    var now = new Date();
    var existing = verifyRows_().filter(function (r) {
      return String(r.email).toLowerCase() === row.email.toLowerCase()
        && String(r.cycle) === row.cycle;
    })[0];
    if (existing) {
      editToken = existing.edit_token || Utilities.getUuid().replace(/-/g, '');
      submitCount = (Number(existing.submit_count) || 0) + 1;
      sh.getRange(existing._row, 1, 1, VERIFY_HEADERS.length).setValues([[
        existing.created_at || now, now, row.name, row.email, row.cycle,
        canonical, title, editToken, submitCount
      ]]);
    } else {
      editToken = Utilities.getUuid().replace(/-/g, '');
      submitCount = 1;
      sh.appendRow([now, now, row.name, row.email, row.cycle, canonical, title, editToken, submitCount]);
    }
  } finally {
    lock.releaseLock();
  }

  sendVerifyConfirmMail_(row, canonical, title, submitCount);
  return json_({ ok: true, resubmit: submitCount > 1, video_title: title });
}

function sendVerifyConfirmMail_(row, canonical, title, submitCount) {
  try {
    var statusUrl = SITE + '/verify/?t=' + galleryToken_();
    var html =
      '<div style="font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">'
      + '<h2 style="margin:24px 0 4px;">' + escHtml_(row.name) + '님, 사이클 ' + escHtml_(row.cycle) + ' 영상 인증 완료 🎬</h2>'
      + '<p style="color:#555;line-height:1.7;">' + (title ? '<b>' + escHtml_(title) + '</b><br>' : '')
      + '<a href="' + canonical + '">' + canonical + '</a></p>'
      + (submitCount > 1 ? '<p style="color:#777;">같은 사이클 재제출로 기록이 갱신됐습니다.</p>' : '')
      + '<p style="margin:20px 0;"><a href="' + statusUrl + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;">👀 전체 인증 현황 보기</a></p>'
      + '<p style="color:#999;font-size:13px;">© 2026 BuildnWrite. All rights reserved.</p></div>';
    MailApp.sendEmail({
      to: row.email,
      subject: '[유튜브 챌린지] 사이클 ' + row.cycle + ' 영상 인증 완료',
      htmlBody: html
    });
  } catch (err) { Logger.log('verify mail failed: ' + err); }
}

function doPost(e) {
  try { var c0 = CacheService.getScriptCache(); c0.remove('gallery-json'); c0.remove('proposals-json'); c0.remove('verifications-json'); } catch (err0) {}
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.form === 'proposal') return handleProposalPost_(body);
    if (body.form === 'verify') return handleVerifyPost_(body);
    var row = {};
    FIELDS.forEach(function (f) { row[f] = String(body[f] || '').trim(); });
    if (!row.name) return json_({ ok: false, error: '이름이 없습니다.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json_({ ok: false, error: '이메일 형식이 올바르지 않습니다.' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = sheet_();
      var now = new Date();
      var existing = rows_().filter(function (r) {
        return String(r.email).toLowerCase() === row.email.toLowerCase();
      })[0];

      var editToken, submitCount, createdAt;
      if (existing) {
        editToken = existing.edit_token || Utilities.getUuid().replace(/-/g, '');
        submitCount = (Number(existing.submit_count) || 0) + 1;
        createdAt = existing.created_at || now;
        var vals = [createdAt, now, row.name, row.email, row.channel_name, row.concept,
          row.reason, row.pipeline, row.audience, row.cta, row.message, editToken, submitCount];
        sh.getRange(existing._row, 1, 1, HEADERS.length).setValues([vals]);
      } else {
        editToken = Utilities.getUuid().replace(/-/g, '');
        submitCount = 1;
        sh.appendRow([now, now, row.name, row.email, row.channel_name, row.concept,
          row.reason, row.pipeline, row.audience, row.cta, row.message, editToken, submitCount]);
      }
    } finally {
      lock.releaseLock();
    }

    sendConfirmMail_(row, editToken, submitCount);
    return json_({ ok: true, resubmit: submitCount > 1 });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ── 사이클 기획안 제출 (upsert by email + cycle) ──
function handleProposalPost_(body) {
  var row = {};
  PROPOSAL_FIELDS.forEach(function (f) { row[f] = String(body[f] || '').trim(); });
  if (!row.name) return json_({ ok: false, error: '이름이 없습니다.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json_({ ok: false, error: '이메일 형식이 올바르지 않습니다.' });
  if (!/^[1-6]$/.test(row.cycle)) return json_({ ok: false, error: '사이클은 1~6 중 하나여야 합니다.' });
  if (!row.target) return json_({ ok: false, error: '타깃 시청자가 없습니다.' });
  if (!row.topic) return json_({ ok: false, error: '영상 주제가 없습니다.' });
  if (!row.structure) return json_({ ok: false, error: '구성 개요가 없습니다.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var editToken, submitCount;
  try {
    var sh = proposalSheet_();
    var now = new Date();
    var existing = proposalRows_().filter(function (r) {
      return String(r.email).toLowerCase() === row.email.toLowerCase()
        && String(r.cycle) === row.cycle;
    })[0];

    var createdAt;
    if (existing) {
      editToken = existing.edit_token || Utilities.getUuid().replace(/-/g, '');
      submitCount = (Number(existing.submit_count) || 0) + 1;
      createdAt = existing.created_at || now;
      sh.getRange(existing._row, 1, 1, PROPOSAL_HEADERS.length).setValues([[
        createdAt, now, row.name, row.email, row.cycle, row.target, row.topic,
        row.structure, row.links, '', editToken, submitCount
      ]]);
    } else {
      editToken = Utilities.getUuid().replace(/-/g, '');
      submitCount = 1;
      sh.appendRow([
        now, now, row.name, row.email, row.cycle, row.target, row.topic,
        row.structure, row.links, '', editToken, submitCount
      ]);
    }
  } finally {
    lock.releaseLock();
  }

  // 저장을 먼저 끝낸 뒤 AI를 호출한다. AI 실패는 빈 검토로 처리하고 메일 발송을 계속한다.
  var aiReview = reviewProposalWithGemini_(row);
  if (aiReview) saveProposalReview_(editToken, submitCount, aiReview);

  sendProposalConfirmMail_(row, aiReview, editToken, submitCount);
  return json_({ ok: true, resubmit: submitCount > 1, ai_reviewed: !!aiReview });
}

function reviewProposalWithGemini_(row) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      Logger.log('Proposal AI review skipped: GEMINI_API_KEY is not set.');
      return '';
    }

    var prompt = [
      '다음은 유튜브 챌린지에 제출된 사이클 기획안입니다.',
      '',
      '[타깃 시청자]', row.target,
      '',
      '[영상 주제]', row.topic,
      '',
      '[구성 개요]', row.structure,
      '',
      '이 기획안을 한국어로 검토해 주세요.',
      '① 후킹 ② 타깃 적합성 ③ 구성의 세 관점에서 각각 2~3문장으로 구체적으로 검토하고,',
      '마지막에 가장 중요한 개선 제안 1개를 명확하게 제시해 주세요.'
    ].join('\n');
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='
      + encodeURIComponent(apiKey);
    var response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      }),
      muteHttpExceptions: true
    });
    var status = response.getResponseCode();
    if (status < 200 || status >= 300) {
      throw new Error('Gemini HTTP ' + status + ': ' + response.getContentText().slice(0, 300));
    }
    var data = JSON.parse(response.getContentText());
    var parts = data.candidates && data.candidates[0]
      && data.candidates[0].content && data.candidates[0].content.parts;
    if (!parts || !parts.length) throw new Error('Gemini 응답에 검토 내용이 없습니다.');
    return parts.map(function (part) { return part.text || ''; }).join('\n').trim();
  } catch (err) {
    Logger.log('Proposal AI review failed: ' + String(err && err.message || err));
    return '';
  }
}

function saveProposalReview_(editToken, submitCount, aiReview) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var match = proposalRows_().filter(function (r) {
      return r.edit_token === editToken && Number(r.submit_count) === Number(submitCount);
    })[0];
    if (!match) return;
    var aiReviewColumn = PROPOSAL_HEADERS.indexOf('ai_review') + 1;
    proposalSheet_().getRange(match._row, aiReviewColumn).setValue(aiReview);
  } finally {
    lock.releaseLock();
  }
}

// ── 조회 ──
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.action === 'proposals') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var pCache = CacheService.getScriptCache();
    var pHit = pCache.get('proposals-json');
    if (pHit) return ContentService.createTextOutput(pHit).setMimeType(ContentService.MimeType.JSON);
    var proposals = proposalRows_().map(function (r) {
      return {
        created_at: r.created_at, updated_at: r.updated_at,
        name: r.name, cycle: r.cycle, target: r.target, topic: r.topic,
        structure: r.structure, links: r.links, ai_review: r.ai_review,
        submit_count: r.submit_count
      };
    }).filter(function (r) { return !/^__/.test(String(r.name)); });
    var pPayload = JSON.stringify({ ok: true, proposals: proposals });
    pCache.put('proposals-json', pPayload, 60);
    return ContentService.createTextOutput(pPayload).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'verifications') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var vCache = CacheService.getScriptCache();
    var vHit = vCache.get('verifications-json');
    if (vHit) return ContentService.createTextOutput(vHit).setMimeType(ContentService.MimeType.JSON);
    var verifs = verifyRows_().map(function (r) {
      return { name: r.name, cycle: r.cycle, video_url: r.video_url, video_title: r.video_title,
        updated_at: r.updated_at, submit_count: r.submit_count };
    }).filter(function (r) { return !/^__/.test(String(r.name)); });
    var vPayload = JSON.stringify({ ok: true, verifications: verifs });
    vCache.put('verifications-json', vPayload, 60);
    return ContentService.createTextOutput(vPayload).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'proposal-mine') {
    if (!p.edit) return json_({ ok: false, error: 'no token' });
    var myProposal = proposalRows_().filter(function (r) { return r.edit_token === p.edit; })[0];
    if (!myProposal) return json_({ ok: false, error: 'not found' });
    var proposalOut = {};
    PROPOSAL_FIELDS.forEach(function (f) { proposalOut[f] = myProposal[f]; });
    return json_({ ok: true, proposal: proposalOut });
  }

  if (p.action === 'gallery') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var gCache = CacheService.getScriptCache();
    var gHit = gCache.get('gallery-json');
    if (gHit) return ContentService.createTextOutput(gHit).setMimeType(ContentService.MimeType.JSON);
    var list = rows_().map(function (r) {
      return {
        name: r.name, channel_name: r.channel_name, concept: r.concept,
        reason: r.reason, pipeline: r.pipeline, audience: r.audience,
        cta: r.cta, message: r.message,
        updated_at: r.updated_at, submit_count: r.submit_count
      };
    }).filter(function (r) { return !/^__/.test(String(r.name)); });
    var gPayload = JSON.stringify({ ok: true, plans: list });
    gCache.put('gallery-json', gPayload, 60);
    return ContentService.createTextOutput(gPayload).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'mine') {
    if (!p.edit) return json_({ ok: false, error: 'no token' });
    var mine = rows_().filter(function (r) { return r.edit_token === p.edit; })[0];
    if (!mine) return json_({ ok: false, error: 'not found' });
    var out = {};
    FIELDS.forEach(function (f) { out[f] = mine[f]; });
    return json_({ ok: true, plan: out });
  }

  return json_({ ok: true, service: 'youtube-challenge plan backend' });
}

// ── 확인 이메일 ──
function sendConfirmMail_(row, editToken, submitCount) {
  var galleryUrl = SITE + '/plan/gallery/?t=' + galleryToken_();
  var editUrl = SITE + '/plan/?edit=' + editToken;
  var isResubmit = submitCount > 1;

  var itemsHtml = [
    ['채널명 (가안)', row.channel_name],
    ['채널 콘셉트 한 문장', row.concept],
    ['① 유튜브를 하는 이유', row.reason],
    ['② 사업 파이프라인', row.pipeline],
    ['③ 주 목적 시청층', row.audience],
    ['④ 유입 첫 단계 (CTA·랜딩)', row.cta],
    ['⑤ 채널이 전달하려는 메시지', row.message]
  ].map(function (pair) {
    var val = pair[1] ? escHtml_(pair[1]).replace(/\n/g, '<br>') : '<span style="color:#999">(미작성)</span>';
    return '<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;width:180px;font-weight:700;color:#334;">'
      + pair[0] + '</td><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#222;">' + val + '</td></tr>';
  }).join('');

  var html =
    '<div style="font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">'
    + '<h2 style="margin:24px 0 4px;">' + escHtml_(row.name) + '님, 채널 한 장 기획서가 ' + (isResubmit ? '다시 ' : '') + '접수됐습니다 📮</h2>'
    + '<p style="color:#555;line-height:1.7;">아래는 제출하신 내용 전문입니다. <b>' + OT_INFO + '</b>에서 이 기획서를 직접 발표합니다.<br>'
    + 'OT 전까지 얼마든지 다듬어서 다시 제출할 수 있어요.</p>'
    + '<div style="margin:20px 0;">'
    + '<a href="' + galleryUrl + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;margin-right:8px;">👀 다른 참여자 기획서 보기</a>'
    + '<a href="' + editUrl + '" style="display:inline-block;background:#f1f5f9;color:#2563EB;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;">✏️ 내 기획서 수정하기</a>'
    + '</div>'
    + '<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:8px;">' + itemsHtml + '</table>'
    + '<p style="color:#888;font-size:13px;line-height:1.7;margin-top:20px;">위 링크는 챌린지 참여자 전용입니다. 외부에 공유하지 말아주세요.<br>'
    + '기획서를 바탕으로 참고할 레퍼런스 유튜브 채널 3개를 이 메일로 회신해 드립니다.</p>'
    + '<p style="color:#bbb;font-size:12px;margin-top:28px;">© 2026 BuildnWrite. All rights reserved.</p>'
    + '</div>';

  MailApp.sendEmail({
    to: row.email,
    subject: '[유튜브 챌린지] 기획서 ' + (isResubmit ? '재' : '') + '접수 — ' + OT_INFO + '에서 발표해요',
    htmlBody: html,
    name: 'BuildnWrite 유튜브 챌린지'
  });
}

function sendProposalConfirmMail_(row, aiReview, editToken, submitCount) {
  var galleryUrl = SITE + '/submit/gallery/?t=' + galleryToken_();
  var editUrl = SITE + '/submit/?edit=' + editToken;
  var isResubmit = submitCount > 1;

  var itemsHtml = [
    ['사이클', '사이클 ' + row.cycle],
    ['타깃 시청자', row.target],
    ['영상 주제', row.topic],
    ['구성 개요', row.structure],
    ['참고 링크', row.links]
  ].map(function (pair) {
    var val = pair[1] ? escHtml_(pair[1]).replace(/\n/g, '<br>') : '<span style="color:#999">(미작성)</span>';
    return '<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;width:150px;font-weight:700;color:#334;">'
      + pair[0] + '</td><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#222;">' + val + '</td></tr>';
  }).join('');
  var reviewHtml = aiReview
    ? '<div style="white-space:normal;line-height:1.75;color:#222;">' + escHtml_(aiReview).replace(/\n/g, '<br>') + '</div>'
    : '<p style="margin:0;color:#777;">AI 검토는 잠시 후 다시 시도됩니다</p>';

  var html =
    '<div style="font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">'
    + '<h2 style="margin:24px 0 4px;">' + escHtml_(row.name) + '님, 사이클 ' + escHtml_(row.cycle) + ' 기획안이 ' + (isResubmit ? '다시 ' : '') + '접수됐습니다 📮</h2>'
    + '<p style="color:#555;line-height:1.7;">아래는 제출하신 내용 전문과 AI 검토 결과입니다.<br>수정 링크에서 같은 사이클 기획안을 얼마든지 다듬어 다시 제출할 수 있어요.</p>'
    + '<div style="margin:20px 0;">'
    + '<a href="' + galleryUrl + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;margin-right:8px;">👀 기획안 갤러리 보기</a>'
    + '<a href="' + editUrl + '" style="display:inline-block;background:#f1f5f9;color:#2563EB;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;">✏️ 내 기획안 수정하기</a>'
    + '</div>'
    + '<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:8px;">' + itemsHtml + '</table>'
    + '<div style="margin-top:22px;padding:18px 20px;background:#f6f5f4;border:1px solid #ddd;border-radius:10px;">'
    + '<h3 style="margin:0 0 10px;font-size:16px;color:#1D4ED8;">AI 기획안 검토</h3>' + reviewHtml + '</div>'
    + '<p style="color:#888;font-size:13px;line-height:1.7;margin-top:20px;">갤러리와 수정 링크는 챌린지 참여자 전용입니다. 외부에 공유하지 말아주세요.</p>'
    + '<p style="color:#bbb;font-size:12px;margin-top:28px;">© 2026 BuildnWrite. All rights reserved.</p>'
    + '</div>';

  MailApp.sendEmail({
    to: row.email,
    subject: '[유튜브 챌린지] 사이클 ' + row.cycle + ' 기획안 ' + (isResubmit ? '재' : '') + '접수',
    htmlBody: html,
    name: 'BuildnWrite 유튜브 챌린지'
  });
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
