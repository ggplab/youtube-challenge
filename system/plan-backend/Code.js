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

function setup() {
  sheet_();
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

// ── 제출 (upsert by email) ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
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

// ── 조회 ──
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.action === 'gallery') {
    if (!p.t || p.t !== galleryToken_()) {
      return json_({ ok: false, error: 'invalid token' });
    }
    var list = rows_().map(function (r) {
      return {
        name: r.name, channel_name: r.channel_name, concept: r.concept,
        reason: r.reason, pipeline: r.pipeline, audience: r.audience,
        cta: r.cta, message: r.message,
        updated_at: r.updated_at, submit_count: r.submit_count
      };
    }).filter(function (r) { return !/^__/.test(String(r.name)); });
    return json_({ ok: true, plans: list });
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

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
