/**
 * KAARIGAI – Multi-Admin Name + Password Login Controller
 * ---------------------------------------------------------------------------
 * Collects Admin Name and Password only (never exposing internal auth emails),
 * authenticates via server-backed Firebase Authentication + Custom Role Claims,
 * and redirects authorized admins directly to admin.html.
 */

import {
  ensureSessionPersistence,
  observeAdminAuth,
  signInAdminWithCredentials,
  signOutAdmin
} from './admin-service.js';

function $(id) {
  return document.getElementById(id);
}

let isRedirecting = false;

function redirectToAdmin() {
  if (isRedirecting) return;
  isRedirecting = true;
  window.location.replace('admin.html');
}

function showError(message) {
  const errBox = $('admin-login-error');
  if (!errBox) return;
  errBox.textContent = message;
  errBox.hidden = false;
}

function clearError() {
  const errBox = $('admin-login-error');
  if (!errBox) return;
  errBox.hidden = true;
  errBox.textContent = '';
}

function setLoadingState(loading) {
  const submitBtn = $('admin-login-submit');
  const spinner = $('admin-login-spinner');
  const btnLabel = $('admin-login-btn-label');

  if (submitBtn) {
    submitBtn.disabled = Boolean(loading);
    submitBtn.setAttribute('aria-busy', String(Boolean(loading)));
  }
  if (spinner) {
    spinner.hidden = !loading;
  }
  if (btnLabel) {
    btnLabel.textContent = loading ? 'Signing In...' : 'Login';
  }
}

function bindEvents() {
  const form = $('admin-login-form');
  const nameInput = $('admin-login-username');
  const pwdInput = $('admin-login-password');
  const toggleBtn = $('admin-toggle-password');

  if (toggleBtn && pwdInput) {
    toggleBtn.addEventListener('click', () => {
      const reveal = pwdInput.type === 'password';
      pwdInput.type = reveal ? 'text' : 'password';
      toggleBtn.textContent = reveal ? 'Hide' : 'Show';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError();

      const username = nameInput ? nameInput.value.trim() : '';
      const password = pwdInput ? pwdInput.value : '';

      if (!username) {
        showError('Please enter your username.');
        if (nameInput) nameInput.focus();
        return;
      }

      if (/@/.test(username)) {
        showError('Enter your username (not an email address).');
        if (nameInput) nameInput.focus();
        return;
      }

      if (!password) {
        showError('Please enter your password.');
        if (pwdInput) pwdInput.focus();
        return;
      }

      setLoadingState(true);

      try {
        await signInAdminWithCredentials(username, password);
        redirectToAdmin();
      } catch (err) {
        showError((err && err.message) || 'Invalid username or password. Please try again.');
        if (pwdInput) {
          pwdInput.focus();
          pwdInput.select();
        }
      } finally {
        setLoadingState(false);
      }
    });
  }
}

async function init() {
  bindEvents();
  await ensureSessionPersistence();

  const params = new URLSearchParams(window.location.search);
  const reason = params.get('reason');

  let handledInitial = false;
  observeAdminAuth(async (authState) => {
    if (authState.status === 'authorized') {
      redirectToAdmin();
      return;
    }

    if (authState.status === 'unauthorized') {
      await signOutAdmin();
    }

    if (!handledInitial) {
      handledInitial = true;
      const checkingEl = $('login-checking-screen');
      const loginEl = $('admin-login-screen');
      if (checkingEl) checkingEl.hidden = true;
      if (loginEl) loginEl.hidden = false;

      if (reason === 'session_expired') {
        showError('Your previous admin session was invalidated after a password update. Please sign in again.');
      } else if (reason === 'account_removed') {
        showError('Your administrator access has been revoked or removed.');
      } else if (reason === 'unauthorized') {
        showError('Your account or session is not authorized for admin access. Please sign in.');
      }

      const nameInput = $('admin-login-username');
      if (nameInput) {
        window.setTimeout(() => {
          if (!document.activeElement || document.activeElement === document.body) {
            nameInput.focus();
          }
        }, 60);
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
