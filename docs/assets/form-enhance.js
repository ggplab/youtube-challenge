/**
 * 제출 폼 공통 보강 — /submit 과 /verify 가 함께 쓴다.
 *
 * 1) 이름 드롭다운: 대시보드 공개 API의 참가자 이름으로 채운다.
 * 2) 이메일 기억: 이메일은 서버가 이름으로 찾아주지 않는다. 그렇게 하면 화면에 뜬
 *    이름을 고르는 것만으로 남의 기록을 덮을 수 있게 되기 때문이다(공개 페이지다).
 *    대신 본인 기기에 본인 것만 저장해 두 번째 제출부터 자동으로 채운다.
 * 3) embed 모드(?embed=1): 대시보드 모달 안에서 iframe으로 열릴 때 상단 탭을 숨기고,
 *    제출 성공을 부모 창에 알린다.
 */
(function (global) {
  'use strict';

  var IDENTITY_KEY = 'ytc_identity_v1';
  var CUSTOM = '__custom';

  function readIdentity() {
    try {
      var raw = localStorage.getItem(IDENTITY_KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      return (v && v.name && v.email) ? v : null;
    } catch (e) { return null; }
  }

  function rememberIdentity(name, email) {
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: name, email: email }));
    } catch (e) {}
  }

  var isEmbed = new URLSearchParams(location.search).get('embed') === '1';

  function applyEmbedMode() {
    if (!isEmbed) return;
    document.documentElement.classList.add('is-embed');
    var style = document.createElement('style');
    // 탭 링크만 숨긴다. topnav 자체를 지우면 그 안에 있는 'AI와 같이 쓰기' 버튼까지 사라진다.
    style.textContent =
      '.is-embed .topnav a { display:none !important; }' +
      '.is-embed .topnav { border-bottom:none !important; margin-bottom:14px !important; }' +
      '.is-embed .doc { padding-top:18px !important; }' +
      '.is-embed body { max-width:none !important; }';
    document.head.appendChild(style);
  }

  /** 제출 성공을 부모(대시보드)에 알린다. 같은 오리진에만 보낸다. */
  function notifySubmitted(kind) {
    if (!isEmbed || global.parent === global) return;
    try {
      global.parent.postMessage({ source: 'ytc-form', type: 'submitted', kind: kind }, location.origin);
    } catch (e) {}
  }

  /**
   * 이름 드롭다운을 폼에 붙인다.
   * nameInput 은 그대로 남겨둔다 — 기존 오토세이브·프리필·제출 로직이 form.elements['name']을 쓴다.
   */
  function setupNamePicker(opts) {
    var nameInput = document.getElementById(opts.nameInputId);
    var emailInput = document.getElementById(opts.emailInputId);
    if (!nameInput) return;

    var select = document.createElement('select');
    select.id = opts.nameInputId + '-pick';   // name 속성 없음: form.elements 에 잡히면 안 된다
    select.setAttribute('aria-label', '참가자 선택');
    select.innerHTML = '<option value="">불러오는 중…</option>';
    nameInput.parentNode.insertBefore(select, nameInput);
    nameInput.style.display = 'none';

    var saved = readIdentity();

    function showCustom(show) {
      nameInput.style.display = show ? '' : 'none';
      if (show) nameInput.focus();
    }

    function fillFor(name) {
      nameInput.value = name;
      // 저장된 본인 이름과 일치할 때만 이메일을 채운다. 남의 이메일은 애초에 이 기기에 없다.
      if (emailInput && saved && saved.name === name) emailInput.value = saved.email;
      else if (emailInput && (!emailInput.value || (saved && emailInput.value === saved.email))) emailInput.value = '';
    }

    select.addEventListener('change', function () {
      if (select.value === CUSTOM) { nameInput.value = ''; showCustom(true); return; }
      showCustom(false);
      fillFor(select.value);
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));  // 오토세이브 반영
    });

    function render(names) {
      var options = ['<option value="">— 이름을 선택하세요 —</option>'];
      names.forEach(function (n) {
        options.push('<option value="' + n.replace(/"/g, '&quot;') + '">' + n + '</option>');
      });
      options.push('<option value="' + CUSTOM + '">직접 입력 (처음 참여)</option>');
      select.innerHTML = options.join('');

      // 이미 값이 있으면(수정 모드 프리필·오토세이브 복원) 그 이름을 고른 상태로 맞춘다
      var current = nameInput.value.trim() || (saved && saved.name) || '';
      if (current && names.indexOf(current) !== -1) {
        select.value = current;
        fillFor(current);
      } else if (current) {
        select.value = CUSTOM;
        showCustom(true);
      }
    }

    fetch(opts.apiUrl + '?action=dashboard')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var names = (d && d.ok && d.participants ? d.participants : [])
          .map(function (p) { return String(p.name || '').trim(); })
          .filter(function (n) { return n; });
        names = names.filter(function (n, i) { return names.indexOf(n) === i; });  // 중복 제거
        render(names);
      })
      .catch(function () {
        // 목록을 못 받아도 제출은 가능해야 한다 — 직접 입력으로 떨어뜨린다
        select.innerHTML = '<option value="' + CUSTOM + '">직접 입력</option>';
        select.value = CUSTOM;
        showCustom(true);
      });
  }

  global.YTCForm = {
    isEmbed: isEmbed,
    applyEmbedMode: applyEmbedMode,
    notifySubmitted: notifySubmitted,
    setupNamePicker: setupNamePicker,
    rememberIdentity: rememberIdentity,
    readIdentity: readIdentity
  };
})(window);
