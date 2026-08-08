/**
 * Session timeout manager
 * - 19분 무활동: 연장/로그아웃 팝업
 * - 20분 무활동: 자동 로그아웃
 */
(function(global) {
  'use strict';

  var WARN_MS    = 19 * 60 * 1000;  // 19분
  var LOGOUT_MS  = 20 * 60 * 1000;  // 20분
  var CHECK_INTERVAL = 15 * 1000;   // 15초마다 체크
  var HEARTBEAT_INTERVAL = 60 * 1000; // 1분마다 서버 heartbeat
  var logoutUrl    = '/';
  var heartbeatUrl = '/api/auth/heartbeat';
  var warningShown = false;
  var warnDialog   = null;
  var warnTimer    = null;
  var lastActivity = Date.now();

  var activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
  activityEvents.forEach(function(evt) {
    document.addEventListener(evt, function() {
      lastActivity = Date.now();
      if (warningShown && warnDialog) {
        // 활동 감지 시 자동으로 팝업 닫고 연장
        closeWarning();
        sendHeartbeat();
      }
    }, { passive: true });
  });

  function sendHeartbeat() {
    fetch(heartbeatUrl, { method: 'POST' }).catch(function() {});
  }

  function closeWarning() {
    warningShown = false;
    if (warnDialog) { warnDialog.remove(); warnDialog = null; }
    clearTimeout(warnTimer);
  }

  function doLogout(silent) {
    closeWarning();
    fetch('/api/auth/logout', { method: 'POST' }).finally(function() {
      if (!silent) MxAlert.toast('세션이 만료되어 로그아웃되었습니다.', 'warning', 2500);
      setTimeout(function() { window.location.href = logoutUrl; }, 400);
    });
  }

  function showWarning(remaining) {
    if (warningShown) return;
    warningShown = true;

    var style = document.createElement('style');
    style.id  = 'mx-session-style';
    style.textContent = `
      .mx-session-overlay {
        position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
        z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;
        animation:mxFadeIn .18s ease;
      }
      .mx-session-dialog {
        background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.22);
        width:100%;max-width:400px;overflow:hidden;padding:32px 28px 24px;text-align:center;
        animation:mxSlideUp .22s ease;font-family:'Noto Sans KR',sans-serif;
      }
      .mx-session-icon { font-size:44px;margin-bottom:12px;display:block; }
      .mx-session-title { font-size:18px;font-weight:700;color:#111827;margin-bottom:8px; }
      .mx-session-msg   { font-size:14px;color:#4b5563;line-height:1.6;margin-bottom:8px; }
      .mx-session-counter { font-size:32px;font-weight:800;color:#dc2626;margin:12px 0; }
      .mx-session-btns  { display:flex;gap:10px;justify-content:center;margin-top:20px; }
      .mx-session-btn {
        padding:11px 26px;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;
        border:none;transition:all .14s;font-family:inherit;
      }
      .mx-session-btn-extend  { background:#2563eb;color:#fff; }
      .mx-session-btn-extend:hover  { background:#1d4ed8; }
      .mx-session-btn-logout  { background:#f3f4f6;color:#374151; }
      .mx-session-btn-logout:hover  { background:#e5e7eb; }
    `;
    if (!document.getElementById('mx-session-style')) document.head.appendChild(style);

    warnDialog = document.createElement('div');
    warnDialog.className = 'mx-session-overlay';

    var countSec = Math.ceil((LOGOUT_MS - WARN_MS) / 1000); // 60초

    warnDialog.innerHTML = `
      <div class="mx-session-dialog">
        <span class="mx-session-icon">⏱️</span>
        <div class="mx-session-title">세션 만료 경고</div>
        <div class="mx-session-msg">장시간 활동이 없어 곧 자동 로그아웃됩니다.<br>계속 이용하시겠습니까?</div>
        <div class="mx-session-counter" id="mx-countdown">${countSec}</div>
        <div class="mx-session-btns">
          <button class="mx-session-btn mx-session-btn-logout">로그아웃</button>
          <button class="mx-session-btn mx-session-btn-extend">계속 이용하기</button>
        </div>
      </div>
    `;
    document.body.appendChild(warnDialog);

    // 카운트다운
    var countEl = document.getElementById('mx-countdown');
    var interval = setInterval(function() {
      countSec--;
      if (countEl) countEl.textContent = countSec;
      if (countSec <= 0) { clearInterval(interval); }
    }, 1000);

    warnDialog.querySelector('.mx-session-btn-extend').addEventListener('click', function() {
      clearInterval(interval);
      lastActivity = Date.now();
      closeWarning();
      sendHeartbeat();
    });
    warnDialog.querySelector('.mx-session-btn-logout').addEventListener('click', function() {
      clearInterval(interval);
      doLogout(false);
    });

    // 1분 뒤 자동 로그아웃
    warnTimer = setTimeout(function() {
      clearInterval(interval);
      doLogout(false);
    }, LOGOUT_MS - WARN_MS);
  }

  function checkSession() {
    var idle = Date.now() - lastActivity;
    if (!warningShown && idle >= WARN_MS) {
      showWarning(LOGOUT_MS - idle);
    }
    if (idle >= LOGOUT_MS) {
      doLogout(false);
    }
  }

  setInterval(checkSession, CHECK_INTERVAL);
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // 관리자용 로그아웃 URL 변경
  global.SessionManager = {
    setLogoutUrl: function(url) { logoutUrl = url; },
    setHeartbeatUrl: function(url) { heartbeatUrl = url; },
    reset: function() { lastActivity = Date.now(); },
  };
})(window);
