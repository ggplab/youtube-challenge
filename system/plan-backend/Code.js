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

/**
 * 스코프 재승인용. 편집기에서 1회 실행 → 권한 검토 → 허용.
 * UrlFetchApp을 실제로 호출하므로 script.external_request 동의를 강제한다.
 * 웹앱(USER_DEPLOYING)은 clasp push/redeploy만으로 새 스코프가 붙지 않는다.
 */
function authorize() {
  var res = UrlFetchApp.fetch(
    'https://www.youtube.com/oembed?format=json&url='
    + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    { muteHttpExceptions: true });
  Logger.log('oEmbed HTTP ' + res.getResponseCode());
  Logger.log('title: ' + String(JSON.parse(res.getContentText() || '{}').title || '(none)'));
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

/**
 * AI 검토 워커(맥미니) 전용 토큰. 갤러리 토큰과 반드시 분리한다 —
 * 갤러리 토큰은 참가자 전원의 접수 메일에 배포되는 값이라, 그걸로 review 계열을
 * 보호하면 참가자가 타인 edit_token·검토 위조에 접근할 수 있다.
 * 이 토큰은 운영자 메일로만 전달되고(action=worker-token-mail) 맥미니 env에만 산다.
 */
function workerToken_() {
  var props = PropertiesService.getScriptProperties();
  var t = props.getProperty('WORKER_TOKEN');
  if (!t) {
    t = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('WORKER_TOKEN', t);
  }
  return t;
}

/**
 * 시각은 Date 객체가 아니라 KST 오프셋이 박힌 ISO 문자열로 저장한다.
 * 이 스프레드시트의 타임존은 Etc/GMT인데 스크립트는 Asia/Seoul이라,
 * Date를 그대로 셀에 넣으면 절대시각이 7시간 어긋난 채 기록된다(2026-07-25 실측).
 * 문자열은 타임존 변환을 타지 않으므로 왕복이 정확하다.
 */
function nowStamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
}

/** 신규(문자열)와 기존(Date) 행이 섞여 있어도 같은 ISO 형태로 내보낸다. */
function isoOf_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v == null ? '' : v);
}

/**
 * 시트 3탭에 흩어진 같은 사람을 묶기 위한 내부 join key.
 * 응답에 실리지 않는다 — 밖으로 나가면 실명과 짝지어 이메일 역산이 가능해진다.
 * upsert 비교가 전부 toLowerCase() 기준이라 같은 정규화를 쓴다.
 */
function joinKey_(email) {
  var normalized = String(email || '').trim().toLowerCase();
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized)
    .map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
    .join('');
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
    var now = nowStamp_();
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
  try {
    var c0 = CacheService.getScriptCache();
    c0.remove('gallery-json'); c0.remove('proposals-json');
    c0.remove('verifications-json'); c0.remove('dashboard-json');
  } catch (err0) {}
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.form === 'proposal') return handleProposalPost_(body);
    if (body.form === 'verify') return handleVerifyPost_(body);
    if (body.form === 'review') return handleReviewPost_(body);
    var row = {};
    FIELDS.forEach(function (f) { row[f] = String(body[f] || '').trim(); });
    if (!row.name) return json_({ ok: false, error: '이름이 없습니다.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return json_({ ok: false, error: '이메일 형식이 올바르지 않습니다.' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = sheet_();
      var now = nowStamp_();
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
    var now = nowStamp_();
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

  // 제출 시점에는 메일을 보내지 않는다 — 맥미니 워커가 review-pending을 폴링해
  // claude로 검토를 생성·저장하면, 그때 접수 전문 + AI 검토를 한 통으로 발송한다.
  // (검토가 계속 실패하면 메일도 밀린다 — 미검토 건수는 action=diag의 review_pending으로 감시)
  return json_({ ok: true, resubmit: submitCount > 1, review: 'queued' });
}

// ── AI 검토 저장 (맥미니 워커 전용, WORKER_TOKEN 필수) ──
function handleReviewPost_(body) {
  if (!body.t || body.t !== workerToken_()) return json_({ ok: false, error: 'invalid token' });
  var editToken = String(body.edit_token || '').trim();
  var submitCount = Number(body.submit_count);
  var aiReview = String(body.ai_review || '').trim();
  if (!editToken) return json_({ ok: false, error: 'edit_token이 없습니다.' });
  // 빈 검토는 저장하지 않는다 — 저장되는 순간 pending에서 빠져 영구 미검토가 된다.
  if (!aiReview) return json_({ ok: false, error: 'ai_review가 비어 있습니다.' });

  var match = proposalRows_().filter(function (r) { return r.edit_token === editToken; })[0];
  if (!match) return json_({ ok: false, error: 'not found' });
  // 검토 생성 중에 재제출이 일어났으면 낡은 검토를 버린다. 새 버전은 다음 폴링이 줍는다.
  if (Number(match.submit_count) !== submitCount) return json_({ ok: true, stale: true });
  if (String(match.ai_review || '').trim()) return json_({ ok: true, already: true });

  saveProposalReview_(editToken, submitCount, aiReview);
  var mailed = sendReviewMail_(match, aiReview, editToken);
  return json_({ ok: true, stale: false, mailed: mailed });
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

  // 외부 호출(UrlFetchApp) 계통 자가진단. 스코프 누락·키 미등록을 구분한다.
  if (p.action === 'diag') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var diag = { ok: true, oembed: '', review_pending: 0 };
    try {
      var oeRes = UrlFetchApp.fetch(
        'https://www.youtube.com/oembed?format=json&url='
        + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
        { muteHttpExceptions: true });
      diag.oembed = 'HTTP ' + oeRes.getResponseCode()
        + ' title=' + String(JSON.parse(oeRes.getContentText() || '{}').title || '(none)');
    } catch (oeErr) {
      diag.oembed = 'ERROR ' + String(oeErr && oeErr.message || oeErr).slice(0, 160);
    }
    // AI 검토는 Gemini에서 맥미니 claude 워커로 이관(2026-07-27) — 미검토 건수만 노출
    diag.review_pending = proposalRows_().filter(function (r) {
      return !String(r.ai_review || '').trim();
    }).length;
    return json_(diag);
  }

  // 워커 토큰 부트스트랩: 토큰 값을 운영자(배포 계정) 메일로만 보낸다.
  // 갤러리 토큰 보유자(=참가자)가 호출해도 얻는 것은 없다 — 메일은 운영자에게만 간다.
  if (p.action === 'worker-token-mail') {
    if (!p.t || p.t !== galleryToken_()) return json_({ ok: false, error: 'invalid token' });
    // Session.getEffectiveUser()는 userinfo.email 스코프를 요구(=브라우저 재승인 함정)라 쓰지 않는다.
    // 이 주소는 MailApp 발신 계정과 동일 — 참가자 메일에 이미 노출되는 값이라 하드코딩해도 새 정보가 아니다.
    MailApp.sendEmail({
      to: 'jayjunglim@gmail.com',
      subject: '[유튜브 챌린지] AI 검토 워커 토큰',
      htmlBody: '<p>WORKER_TOKEN: <code>' + workerToken_()
        + '</code></p><p>맥미니 ~/.config/ytc-review/env 의 YTC_WORKER_TOKEN 에 넣는 값입니다. 외부 공유 금지.</p>'
    });
    try { PropertiesService.getScriptProperties().deleteProperty('GEMINI_API_KEY'); } catch (gpErr) {}
    return json_({ ok: true, mailed_to_operator: true });
  }

  // AI 검토 워커 전용: 미검토 기획안 목록. WORKER_TOKEN 필수 (갤러리 토큰으로는 열리지 않는다 —
  // edit_token이 실리므로 참가자 배포 토큰과 절대 섞지 말 것). 이메일은 싣지 않는다.
  // __ 테스트 행도 포함한다 — e2e 검증 경로 확보 목적.
  if (p.action === 'review-pending') {
    if (!p.t || p.t !== workerToken_()) return json_({ ok: false, error: 'invalid token' });
    var pending = proposalRows_().filter(function (r) {
      return !String(r.ai_review || '').trim();
    }).map(function (r) {
      return {
        name: r.name, cycle: String(r.cycle), target: r.target, topic: r.topic,
        structure: r.structure, links: r.links,
        edit_token: r.edit_token, submit_count: Number(r.submit_count)
      };
    });
    return json_({ ok: true, pending: pending });
  }

  // 공개 대시보드용. 토큰 불요.
  // 내보내는 것: 이름·채널명·사이클별 제출 시각·영상 링크·기획안 본문(타깃·주제·구성·링크).
  // 내보내지 않는 것: 이메일, 이메일 해시, AI 검토(ai_review), 수정토큰.
  // 참가자 매칭은 이메일 해시로 하되 그 키는 서버 안에서만 쓰고 응답에 싣지 않는다.
  // 실명과 해시가 같이 나가면 이름 기반 대입으로 이메일이 역산되기 때문이다.
  if (p.action === 'dashboard') {
    var dCache = CacheService.getScriptCache();
    var dHit = dCache.get('dashboard-json');
    if (dHit) return ContentService.createTextOutput(dHit).setMimeType(ContentService.MimeType.JSON);

    var people = {};
    var order = [];
    // canonical: 채널 기획서(plans)의 이름을 우선한다. 폼마다 표기가 달라도 흔들리지 않게.
    var personOf = function (email, name, channel, isCanonical) {
      var key = joinKey_(email);
      if (!people[key]) {
        people[key] = { name: '', channel_name: '', canonical: false, proposals: [], verifications: [] };
        order.push(key);
      }
      var person = people[key];
      if (name && (isCanonical || !person.canonical)) person.name = name;
      if (isCanonical) person.canonical = true;
      if (channel) person.channel_name = channel;
      return person;
    };

    rows_().filter(function (r) { return !/^__/.test(String(r.name)); })
      .forEach(function (r) { personOf(r.email, r.name, r.channel_name, true); });

    proposalRows_().filter(function (r) { return !/^__/.test(String(r.name)); })
      .forEach(function (r) {
        personOf(r.email, r.name, '', false).proposals.push({
          cycle: String(r.cycle), updated_at: isoOf_(r.updated_at), submit_count: r.submit_count,
          target: r.target, topic: r.topic, structure: r.structure, links: r.links
        });
      });

    verifyRows_().filter(function (r) { return !/^__/.test(String(r.name)); })
      .forEach(function (r) {
        personOf(r.email, r.name, '', false).verifications.push({
          cycle: String(r.cycle), video_url: r.video_url, video_title: r.video_title,
          updated_at: isoOf_(r.updated_at), submit_count: r.submit_count
        });
      });

    var dPayload = JSON.stringify({
      ok: true,
      participants: order.map(function (k) {
        var person = people[k];
        return {
          name: person.name, channel_name: person.channel_name,
          proposals: person.proposals, verifications: person.verifications
        };
      })
    });
    // 본문 포함으로 payload가 커졌다 — CacheService 100KB 한도 초과 시 put이 던지므로
    // 캐시 실패는 무시하고 응답은 반드시 반환한다.
    try { dCache.put('dashboard-json', dPayload, 60); } catch (cErr) {}
    return ContentService.createTextOutput(dPayload).setMimeType(ContentService.MimeType.JSON);
  }

  if (p.action === 'proposals') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var pCache = CacheService.getScriptCache();
    var pHit = pCache.get('proposals-json');
    if (pHit) return ContentService.createTextOutput(pHit).setMimeType(ContentService.MimeType.JSON);
    var proposals = proposalRows_().map(function (r) {
      return {
        created_at: isoOf_(r.created_at), updated_at: isoOf_(r.updated_at),
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
        updated_at: isoOf_(r.updated_at), submit_count: r.submit_count };
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
        updated_at: isoOf_(r.updated_at), submit_count: r.submit_count
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

/**
 * 접수 전문 + AI 검토를 한 통으로 발송 (검토 저장 직후, 제출자 본인에게만).
 * 제출 시점에는 메일이 없으므로 이 메일이 유일한 확인 메일이다.
 * 실패해도 저장은 유지 — Logger로만 남긴다.
 */
function sendReviewMail_(match, aiReview, editToken) {
  try {
    var editUrl = SITE + '/submit/?edit=' + editToken;
    var galleryUrl = SITE + '/submit/gallery/?t=' + galleryToken_();
    var isResubmit = Number(match.submit_count) > 1;

    var itemsHtml = [
      ['사이클', '사이클 ' + match.cycle],
      ['타깃 시청자', match.target],
      ['영상 주제', match.topic],
      ['구성 개요', match.structure],
      ['참고 링크', match.links]
    ].map(function (pair) {
      var val = pair[1] ? escHtml_(pair[1]).replace(/\n/g, '<br>') : '<span style="color:#999">(미작성)</span>';
      return '<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;vertical-align:top;width:150px;font-weight:700;color:#334;">'
        + pair[0] + '</td><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#222;">' + val + '</td></tr>';
    }).join('');

    var html =
      '<div style="font-family:-apple-system,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;">'
      + '<h2 style="margin:24px 0 4px;">' + escHtml_(match.name) + '님, 사이클 ' + escHtml_(match.cycle) + ' 기획안이 ' + (isResubmit ? '다시 ' : '') + '접수됐습니다 📮</h2>'
      + '<p style="color:#555;line-height:1.7;">아래는 제출하신 내용 전문과 AI 검토 결과입니다.<br>'
      + '반영해서 마감 전까지 얼마든지 다듬어 다시 제출할 수 있어요.</p>'
      + '<div style="margin:20px 0;">'
      + '<a href="' + editUrl + '" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;margin-right:8px;">✏️ 기획안 다듬어 재제출</a>'
      + '<a href="' + galleryUrl + '" style="display:inline-block;background:#f1f5f9;color:#2563EB;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;">👀 기획안 갤러리</a>'
      + '</div>'
      + '<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:8px;">' + itemsHtml + '</table>'
      + '<div style="margin-top:22px;padding:18px 20px;background:#f6f5f4;border:1px solid #ddd;border-radius:10px;">'
      + '<h3 style="margin:0 0 10px;font-size:16px;color:#1D4ED8;">AI 기획안 검토</h3>'
      + '<div style="line-height:1.75;color:#222;">' + mdToHtml_(aiReview) + '</div></div>'
      + '<p style="color:#888;font-size:13px;line-height:1.7;margin-top:20px;">갤러리와 수정 링크는 챌린지 참여자 전용입니다. 외부에 공유하지 말아주세요.</p>'
      + '<p style="color:#bbb;font-size:12px;margin-top:28px;">© 2026 BuildnWrite. All rights reserved.</p></div>';
    MailApp.sendEmail({
      to: match.email,
      subject: '[유튜브 챌린지] 사이클 ' + match.cycle + ' 기획안 ' + (isResubmit ? '재' : '') + '접수 — AI 검토 포함',
      htmlBody: html,
      name: 'BuildnWrite 유튜브 챌린지'
    });
    return true;
  } catch (err) {
    Logger.log('review mail failed: ' + String(err && err.message || err));
    return false;
  }
}

// Gemini 응답은 마크다운으로 온다. 메일에서 기호가 그대로 보이지 않도록 최소 변환한다.
function mdToHtml_(text) {
  return escHtml_(text).split('\n').map(function (line) {
    var t = line.trim();
    if (!t) return '<div style="height:8px;"></div>';
    if (/^-{3,}$/.test(t)) return '<hr style="border:none;border-top:1px solid #ddd;margin:16px 0;">';
    var heading = t.match(/^#{2,4}\s*(.+)$/);
    if (heading) {
      return '<div style="font-weight:800;font-size:15px;color:#1D4ED8;margin:18px 0 6px;">'
        + mdInline_(heading[1]) + '</div>';
    }
    var bullet = t.match(/^[-*]\s+(.+)$/);
    if (bullet) return '<div style="margin:4px 0 4px 14px;">• ' + mdInline_(bullet[1]) + '</div>';
    return '<div style="margin:6px 0;">' + mdInline_(t) + '</div>';
  }).join('');
}

function mdInline_(s) {
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code style="background:#eee;padding:1px 4px;border-radius:3px;">$1</code>');
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
