/**
 * Custom Alert / Confirm / Toast system
 * 브라우저 기본 alert() 대신 사용하는 미적인 다이얼로그
 */
(function(global) {
  'use strict';

  // ── 스타일 삽입 ────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .mx-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,.52);
      backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: mxFadeIn .18s ease;
    }
    @keyframes mxFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes mxSlideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .mx-dialog {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,.22);
      width: 100%; max-width: 440px;
      overflow: hidden;
      animation: mxSlideUp .22s ease;
    }
    .mx-icon-wrap {
      width: 60px; height: 60px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 28px auto 16px;
      font-size: 28px;
    }
    .mx-icon-info     { background: #eff6ff; }
    .mx-icon-success  { background: #f0fdf4; }
    .mx-icon-warning  { background: #fffbeb; }
    .mx-icon-error    { background: #fef2f2; }
    .mx-icon-confirm  { background: #f5f3ff; }

    .mx-body { padding: 0 28px 12px; text-align: center; }
    .mx-title {
      font-size: 17px; font-weight: 700; color: #111827;
      margin-bottom: 8px; font-family: 'Noto Sans KR', sans-serif;
    }
    .mx-message {
      font-size: 14px; color: #4b5563; line-height: 1.65;
      font-family: 'Noto Sans KR', sans-serif;
    }
    .mx-footer {
      padding: 16px 24px 24px;
      display: flex; justify-content: center; gap: 10px;
    }
    .mx-btn {
      padding: 10px 28px; border-radius: 7px;
      font-size: 14px; font-weight: 600; cursor: pointer;
      border: none; transition: all .14s;
      font-family: 'Noto Sans KR', sans-serif;
      min-width: 90px;
    }
    .mx-btn-primary   { background: #2563eb; color: #fff; }
    .mx-btn-primary:hover { background: #1d4ed8; }
    .mx-btn-success   { background: #16a34a; color: #fff; }
    .mx-btn-success:hover { background: #15803d; }
    .mx-btn-danger    { background: #dc2626; color: #fff; }
    .mx-btn-danger:hover  { background: #b91c1c; }
    .mx-btn-ghost     { background: #f3f4f6; color: #374151; }
    .mx-btn-ghost:hover   { background: #e5e7eb; }

    /* Toast */
    .mx-toast-container {
      position: fixed; top: 20px; right: 20px;
      z-index: 99998; display: flex; flex-direction: column; gap: 10px;
      min-width: 300px; max-width: 400px;
    }
    .mx-toast {
      background: #fff; border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,.16);
      padding: 14px 18px;
      display: flex; align-items: flex-start; gap: 12px;
      animation: mxSlideUp .2s ease;
      border-left: 4px solid #2563eb;
      font-family: 'Noto Sans KR', sans-serif;
    }
    .mx-toast-info    { border-color: #2563eb; }
    .mx-toast-success { border-color: #16a34a; }
    .mx-toast-warning { border-color: #d97706; }
    .mx-toast-error   { border-color: #dc2626; }
    .mx-toast-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
    .mx-toast-content { flex: 1; }
    .mx-toast-title { font-size: 13.5px; font-weight: 700; color: #111827; margin-bottom: 2px; }
    .mx-toast-msg   { font-size: 13px; color: #4b5563; line-height: 1.5; }
    .mx-toast-close { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 16px; padding: 0; line-height: 1; }
    .mx-toast-close:hover { color: #374151; }
    @keyframes mxToastOut { to { opacity: 0; transform: translateX(20px); } }
    .mx-toast.removing { animation: mxToastOut .2s ease forwards; }
  `;
  document.head.appendChild(style);

  // ── Toast 컨테이너 ─────────────────────────────────────────
  let toastContainer = null;
  function getToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'mx-toast-container';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  const icons = {
    info:    'ℹ️',
    success: '✅',
    warning: '⚠️',
    error:   '❌',
    confirm: '❓',
  };

  // ── MxAlert: alert / confirm ───────────────────────────────
  function showDialog(options) {
    return new Promise(function(resolve) {
      const overlay = document.createElement('div');
      overlay.className = 'mx-overlay';

      const type     = options.type || 'info';
      const iconHtml = icons[type] || icons.info;
      const btnColor = options.confirmColor || (type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary');

      overlay.innerHTML = `
        <div class="mx-dialog">
          <div class="mx-icon-wrap mx-icon-${type}">${iconHtml}</div>
          <div class="mx-body">
            ${options.title ? `<div class="mx-title">${options.title}</div>` : ''}
            <div class="mx-message">${options.message || ''}</div>
          </div>
          <div class="mx-footer">
            ${options.showCancel ? `<button class="mx-btn mx-btn-ghost mx-cancel">${options.cancelText || '취소'}</button>` : ''}
            <button class="mx-btn mx-btn-${btnColor} mx-confirm">${options.confirmText || '확인'}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      function close(result) {
        overlay.remove();
        resolve(result);
      }

      overlay.querySelector('.mx-confirm').addEventListener('click', function() { close(true); });
      const cancelBtn = overlay.querySelector('.mx-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function() { close(false); });

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) close(false);
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────
  const MxAlert = {
    alert: function(message, options) {
      return showDialog(Object.assign({ message, type: 'info', showCancel: false }, options || {}));
    },
    success: function(message, options) {
      return showDialog(Object.assign({ message, type: 'success', showCancel: false }, options || {}));
    },
    error: function(message, options) {
      return showDialog(Object.assign({ message, type: 'error', showCancel: false }, options || {}));
    },
    warning: function(message, options) {
      return showDialog(Object.assign({ message, type: 'warning', showCancel: false }, options || {}));
    },
    confirm: function(message, options) {
      return showDialog(Object.assign({ message, type: 'confirm', showCancel: true }, options || {}));
    },
    toast: function(message, type, duration) {
      type = type || 'info';
      duration = duration === undefined ? 3500 : duration;
      const container = getToastContainer();
      const toast = document.createElement('div');
      toast.className = `mx-toast mx-toast-${type}`;
      toast.innerHTML = `
        <span class="mx-toast-icon">${icons[type] || icons.info}</span>
        <div class="mx-toast-content">
          <div class="mx-toast-msg">${message}</div>
        </div>
        <button class="mx-toast-close">✕</button>
      `;
      container.appendChild(toast);

      function remove() {
        toast.classList.add('removing');
        setTimeout(function() { if (toast.parentNode) toast.remove(); }, 210);
      }
      toast.querySelector('.mx-toast-close').addEventListener('click', remove);
      if (duration > 0) setTimeout(remove, duration);
    },
  };

  global.MxAlert = MxAlert;
})(window);
