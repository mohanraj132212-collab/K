/**
 * KAARIGAI – Standalone Create User Controller (create-user.html)
 * ---------------------------------------------------------------------------
 * Enforces setup administrator authentication before allowing creation of
 * Admin or Workers accounts through the trusted backend API.
 * Never embeds Admin SDK secrets or exposes internal @admin.kaarigai.com emails.
 */

import { formatAdminRoleLabel } from '../firebase-config.js';
import {
  createUserAccount,
  ensureSessionPersistence,
  listAdminMembers,
  observeAdminAuth,
  signInAdminWithCredentials,
  signOutAdmin
} from './admin-service.js';

function $(id) {
  return document.getElementById(id);
}

let cachedExistingUsernames = null;

function setHidden(id, hide) {
  const el = $(id);
  if (el) el.hidden = Boolean(hide);
}

function showGateError(message) {
  const el = $('cu-gate-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function clearGateError() {
  const el = $('cu-gate-error');
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

function showFormError(message) {
  const errEl = $('cu-error-box');
  const okEl = $('cu-success-box');
  if (okEl) {
    okEl.hidden = true;
    okEl.innerHTML = '';
  }
  if (errEl) {
    errEl.textContent = message;
    errEl.hidden = false;
  }
}

function showFormSuccess({ username, role, uid }) {
  const errEl = $('cu-error-box');
  const okEl = $('cu-success-box');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  if (okEl) {
    okEl.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'User Created Successfully';
    const detail = document.createElement('div');
    detail.style.marginTop = '0.25rem';
    detail.textContent = `Username: ${username} • Role: ${role} • UID: ${uid}`;
    okEl.appendChild(title);
    okEl.appendChild(detail);
    okEl.hidden = false;
  }
}

function clearFormFeedback() {
  const errEl = $('cu-error-box');
  const okEl = $('cu-success-box');
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = '';
  }
  if (okEl) {
    okEl.hidden = true;
    okEl.innerHTML = '';
  }
}

function setGateLoading(loading) {
  const btn = $('cu-gate-submit');
  const spinner = $('cu-gate-spinner');
  const label = $('cu-gate-btn-label');
  if (btn) {
    btn.disabled = Boolean(loading);
    btn.setAttribute('aria-busy', String(Boolean(loading)));
  }
  if (spinner) spinner.hidden = !loading;
  if (label) label.textContent = loading ? 'Verifying...' : 'Verify & Continue';
}

function setCreateLoading(loading) {
  const btn = $('cu-submit-btn');
  const spinner = $('cu-submit-spinner');
  const label = $('cu-submit-label');
  if (btn) {
    btn.disabled = Boolean(loading);
    btn.setAttribute('aria-busy', String(Boolean(loading)));
  }
  if (spinner) spinner.hidden = !loading;
  if (label) label.textContent = loading ? 'Creating User...' : 'Submit';
}

async function refreshExistingUsernames() {
  try {
    const list = await listAdminMembers();
    if (Array.isArray(list)) {
      cachedExistingUsernames = new Set(
        list.map((m) => String(m.username || '').trim().toLowerCase()).filter(Boolean)
      );
    }
  } catch (_err) {
    // Authoritative server-side uniqueness check still executes on submit
  }
}

function renderAuthView(authState) {
  setHidden('cu-checking-screen', true);

  if (authState.status === 'authorized' && authState.isPrimaryAdmin) {
    setHidden('cu-auth-gate', true);
    setHidden('cu-restricted-screen', true);
    setHidden('cu-main-screen', false);

    if ($('cu-active-username')) {
      $('cu-active-username').textContent = authState.username || 'Admin';
    }
    if ($('cu-active-role-pill')) {
      $('cu-active-role-pill').textContent = formatAdminRoleLabel(authState.role);
    }

    refreshExistingUsernames();
    return;
  }

  cachedExistingUsernames = null;

  if (authState.status === 'authorized' && !authState.isPrimaryAdmin) {
    setHidden('cu-auth-gate', true);
    setHidden('cu-main-screen', true);
    setHidden('cu-restricted-screen', false);
    if ($('cu-restricted-identity')) {
      $('cu-restricted-identity').textContent = `${authState.username || 'User'} (${formatAdminRoleLabel(
        authState.role
      )})`;
    }
    return;
  }

  setHidden('cu-main-screen', true);
  setHidden('cu-restricted-screen', true);
  setHidden('cu-auth-gate', false);
}

function bindToggle(btnId, inputId) {
  const btn = $(btnId);
  const input = $(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.textContent = reveal ? 'Hide' : 'Show';
  });
}

function validateCreateFields({ username, password, role }) {
  const cleanName = String(username || '').trim().replace(/\s+/g, ' ');
  if (!cleanName || cleanName.length < 2) {
    return { valid: false, error: 'Username must be at least 2 characters long.', focusId: 'cu-username' };
  }
  if (cleanName.length > 50) {
    return { valid: false, error: 'Username must be 50 characters or fewer.', focusId: 'cu-username' };
  }
  if (/[\x00-\x1f\x7f<>@]/.test(cleanName)) {
    return { valid: false, error: 'Enter a valid username without email (@) symbols or angle brackets.', focusId: 'cu-username' };
  }
  if ((cleanName.match(/[a-zA-Z0-9]/g) || []).length < 2) {
    return { valid: false, error: 'Username must contain at least 2 letters or numbers.', focusId: 'cu-username' };
  }
  if (!password) {
    return { valid: false, error: 'Please enter a password.', focusId: 'cu-password' };
  }
  if (password.length > 512) {
    return { valid: false, error: 'Password exceeds maximum supported length (512 characters).', focusId: 'cu-password' };
  }
  if (/[\x00-\x1f\x7f]/.test(password)) {
    return { valid: false, error: 'Password contains unsupported control characters.', focusId: 'cu-password' };
  }
  if (role !== 'Admin' && role !== 'Workers') {
    return { valid: false, error: 'Please select a valid role (Admin or Workers).', focusId: 'cu-role' };
  }
  return { valid: true, username: cleanName, password, role };
}

function bindEvents() {
  bindToggle('cu-gate-toggle-pwd', 'cu-gate-password');
  bindToggle('cu-toggle-pwd', 'cu-password');

  const gateForm = $('cu-gate-form');
  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearGateError();

      const username = $('cu-gate-username')?.value.trim() || '';
      const password = $('cu-gate-password')?.value || '';

      if (!username) {
        showGateError('Please enter your setup Admin username.');
        $('cu-gate-username')?.focus();
        return;
      }
      if (/@/.test(username)) {
        showGateError('Enter your username (not an email address).');
        $('cu-gate-username')?.focus();
        return;
      }
      if (!password) {
        showGateError('Please enter your password.');
        $('cu-gate-password')?.focus();
        return;
      }

      setGateLoading(true);
      try {
        const signInRes = await signInAdminWithCredentials(username, password);
        gateForm.reset();
        const roleLabel = String(signInRes.role || '');
        if (roleLabel !== 'Admin' && roleLabel !== 'primary_admin') {
          await signOutAdmin();
          showGateError('Only an authorized Admin account can create users.');
        }
      } catch (err) {
        showGateError((err && err.message) || 'Invalid setup administrator credentials.');
      } finally {
        setGateLoading(false);
      }
    });
  }

  const createForm = $('create-user-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormFeedback();

      const rawUsername = $('cu-username')?.value || '';
      const rawPassword = $('cu-password')?.value || '';
      const rawRole = $('cu-role')?.value || '';

      const check = validateCreateFields({
        username: rawUsername,
        password: rawPassword,
        role: rawRole
      });
      if (!check.valid) {
        showFormError(check.error);
        if (check.focusId) $(check.focusId)?.focus();
        return;
      }

      // Fast client-side check against known users before invoking backend
      if (cachedExistingUsernames && cachedExistingUsernames.has(check.username.toLowerCase())) {
        showFormError(`Username "${check.username}" already exists. Please choose another username.`);
        $('cu-username')?.focus();
        return;
      }

      setCreateLoading(true);
      try {
        const res = await createUserAccount({
          username: check.username,
          password: check.password,
          role: check.role
        });

        if (Array.isArray(res.members)) {
          cachedExistingUsernames = new Set(
            res.members.map((m) => String(m.username || '').trim().toLowerCase()).filter(Boolean)
          );
        } else if (cachedExistingUsernames) {
          cachedExistingUsernames.add(check.username.toLowerCase());
        }

        const created = res.user || res.member || {};
        createForm.reset();
        const pwdInput = $('cu-password');
        const toggleBtn = $('cu-toggle-pwd');
        if (pwdInput) pwdInput.type = 'password';
        if (toggleBtn) toggleBtn.textContent = 'Show';

        showFormSuccess({
          username: created.username || check.username,
          role: created.role || check.role,
          uid: res.uid || created.uid || '-'
        });
      } catch (err) {
        showFormError((err && err.message) || 'Unable to create user account.');
      } finally {
        setCreateLoading(false);
      }
    });
  }

  const handleLogout = async () => {
    cachedExistingUsernames = null;
    clearFormFeedback();
    clearGateError();
    try {
      await signOutAdmin();
    } catch (_err) {
      // Ignore transient sign-out failure
    }
  };

  if ($('cu-logout-btn')) {
    $('cu-logout-btn').addEventListener('click', handleLogout);
  }
  if ($('cu-restricted-logout-btn')) {
    $('cu-restricted-logout-btn').addEventListener('click', handleLogout);
  }
}

async function init() {
  bindEvents();
  await ensureSessionPersistence();
  observeAdminAuth(async (authState) => {
    if (authState.status === 'unauthorized') {
      await signOutAdmin();
    }
    renderAuthView(authState);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

