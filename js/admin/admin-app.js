/**
 * KAARIGAI – Admin Dashboard & Atelier Management Application
 * ---------------------------------------------------------------------------
 * Coordinates Firebase Authentication, strict Admin authorization guards,
 * real-time Cloud Firestore subscriptions, Dashboard KPIs, Product CRUD,
 * Categories, Per-Color/Per-Size Inventory Stock updates, Storefront Contact
 * Management (with Live Preview), and Server-Verified Password Security.
 */

import {
  ADMIN_ROLES,
  CONTACT_FIELD_KEYS,
  DEFAULT_LOW_STOCK_THRESHOLD,
  buildPhoneHref,
  buildWhatsappHref,
  formatAdminRoleLabel,
  formatBusinessHours,
  formatFullAddress,
  formatINR,
  formatInstagramHandle,
  getStockStatus,
  hasContactConfigured,
  isFullAdminRole,
  isValidHttpUrl,
  normalizeContactDoc,
  validateContactPayload
} from '../firebase-config.js';
import {
  changeAdminMemberPassword,
  changeAdminPassword,
  computeDashboardMetrics,
  createAdminMember,
  deleteAdminMember,
  deleteCategory,
  deleteProduct,
  ensureSessionPersistence,
  getFirebaseProjectInfo,
  listAdminMembers,
  mapFirestoreError,
  observeAdminAuth,
  renameCategoryAndProducts,
  saveCategory,
  saveContactSettings,
  saveStoreSettings,
  seedDefaultCategories,
  setProductActive,
  signOutAdmin,
  subscribeAdminSessionValidity,
  subscribeAdminUsersList,
  subscribeAllProducts,
  subscribeCategories,
  subscribeContactSettings,
  subscribeSecurityMeta,
  subscribeStoreSettings,
  updateAdminMemberName,
  updateProductVariantStocks
} from './admin-service.js';
import { ProductFormController } from './product-form.js';

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    function adminProfileExists() {
      return isSignedIn()
        && exists(/databases/$(database)/documents/adminUsers/$(request.auth.uid));
    }

    function adminProfileData() {
      return get(/databases/$(database)/documents/adminUsers/$(request.auth.uid)).data;
    }

    function isAdmin() {
      return isSignedIn()
        && request.auth.token.admin == true
        && request.auth.token.role in ['primary_admin', 'admin_member', 'Admin', 'Workers']
        && adminProfileExists()
        && adminProfileData().get('isActive', false) == true
        && adminProfileData().get('role', '') in ['primary_admin', 'admin_member', 'Admin', 'Workers']
        && adminProfileData().get('sessionVersion', -1) == request.auth.token.get('sessionVersion', -1);
    }

    function isPrimaryAdmin() {
      return isAdmin()
        && request.auth.token.role in ['primary_admin', 'Admin']
        && adminProfileData().get('role', '') in ['primary_admin', 'Admin'];
    }

    // Products & Categories: Active Admins & Workers manage catalogue & stock; Admin only deletes
    match /products/{productId} {
      allow read: if resource.data.isActive == true || isAdmin();
      allow create, update: if isAdmin();
      allow delete: if isPrimaryAdmin();
    }

    match /categories/{categoryId} {
      allow read: if true;
      allow create, update: if isAdmin();
      allow delete: if isPrimaryAdmin();
    }

    // Server-side password hashes, internal emails & bootstrap locks: strictly server-only
    match /adminCredentials/{uid} {
      allow read, write: if false;
    }
    match /settings/adminBootstrap {
      allow read, write: if false;
    }
    match /settings/adminSecurity {
      allow read, write: if false;
    }

    // Storefront settings ('contact', 'store', 'public'): Primary Admin write only
    match /settings/{settingId} {
      allow read: if settingId in ['store', 'public', 'contact'] || (settingId == 'security' && isAdmin());
      allow write: if isPrimaryAdmin() && (settingId in ['store', 'public', 'contact']);
    }

    // Admin directory without secrets: self read, or Primary Admin read all; server writes only
    match /adminUsers/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isPrimaryAdmin());
      allow write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

const VALID_VIEWS = ['dashboard', 'products', 'add-product', 'categories', 'inventory', 'settings'];

const CONTACT_INPUT_MAP = {
  boutiqueName: 'ct-boutique-name',
  businessName: 'ct-business-name',
  fullAddress: 'ct-full-address',
  city: 'ct-city',
  state: 'ct-state',
  pinCode: 'ct-pin-code',
  googleMapsUrl: 'ct-google-maps-url',
  mobileNumber: 'ct-mobile-number',
  whatsappNumber: 'ct-whatsapp-number',
  contactEmail: 'ct-contact-email',
  instagramUsername: 'ct-instagram-username',
  instagramUrl: 'ct-instagram-url',
  facebookUrl: 'ct-facebook-url',
  openingTime: 'ct-opening-time',
  closingTime: 'ct-closing-time',
  workingDays: 'ct-working-days',
  additionalInfo: 'ct-additional-info'
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateShort(ms) {
  if (!ms) return 'Pending timestamp';
  try {
    return new Date(ms).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (_e) {
    return 'Just added';
  }
}

function formatDateTimeShort(ms) {
  if (!ms) return 'Initial setup pending update';
  try {
    return new Date(ms).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (_e) {
    return 'Recently updated';
  }
}

function stockBadgeClass(status) {
  if (status === 'Out of Stock') return 'pill-danger';
  if (status === 'Low Stock') return 'pill-warning';
  return 'pill-success';
}

const state = {
  authStatus: 'checking', // 'checking' | 'signed-out' | 'unauthorized' | 'authorized'
  user: null,
  subscribedUid: null,
  role: null,
  username: '',
  isPrimaryAdmin: false,
  profileUpdatedAtMs: 0,
  authMethod: null,
  mustChangePassword: false,
  passwordJustChanged: false,
  isChangingPassword: false,
  isRedirecting: false,
  pendingRedirectUrl: null,
  currentView: 'dashboard',
  currentSettingsTab: 'contact', // 'contact' | 'security'
  products: [],
  categories: [],
  adminMembers: [],
  membersLoaded: false,
  editingMemberUid: null,
  settings: {
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    storeName: 'Kaarigai Clothing for Women'
  },
  contactExists: false,
  contactDirty: false,
  savedContact: normalizeContactDoc(null),
  securityMeta: {
    exists: false,
    mustChangePassword: false,
    passwordUpdatedAtMs: 0
  },
  unsubscribers: [],
  productFilters: {
    query: '',
    category: 'All',
    status: 'All',
    stockHealth: 'All',
    sort: 'newest'
  },
  inventoryFilters: {
    query: '',
    category: 'All',
    productId: 'All',
    stockHealth: 'All'
  },
  dirtyInventory: {},
  renamingCategoryId: null,
  confirmResolver: null
};

let productFormCtrl = null;

function $(id) {
  return document.getElementById(id);
}

function showToast(message) {
  const container = $('admin-toast-container');
  if (!container) return;
  container.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'admin-toast';
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('is-leaving');
    window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 260);
  }, 3000);
}

function setSyncStatus(mode, text) {
  const badge = $('admin-sync-pill');
  if (!badge) return;
  badge.className = `sync-pill sync-${mode}`;
  badge.textContent = text;
}

function openConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true }) {
  const modal = $('admin-confirm-modal');
  const titleEl = $('confirm-modal-title');
  const msgEl = $('confirm-modal-message');
  const okBtn = $('confirm-modal-ok');

  if (!modal || !okBtn) return Promise.resolve(false);
  titleEl.textContent = title;
  msgEl.textContent = message;
  okBtn.textContent = confirmLabel;
  okBtn.className = danger ? 'admin-btn admin-btn-danger' : 'admin-btn admin-btn-primary';
  modal.hidden = false;

  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function closeConfirmModal(result) {
  const modal = $('admin-confirm-modal');
  if (modal) modal.hidden = true;
  if (state.confirmResolver) {
    const fn = state.confirmResolver;
    state.confirmResolver = null;
    fn(Boolean(result));
  }
}

function resetPasswordFieldsInContainer(container) {
  if (!container) return;
  container.querySelectorAll('[data-toggle-target]').forEach((btn) => {
    const targetId = btn.getAttribute('data-toggle-target');
    const input = targetId ? $(targetId) : null;
    if (input) input.type = 'password';
    btn.textContent = 'Show';
  });
}

function openMemberRenameModal(member) {
  const modal = $('member-rename-modal');
  const titleEl = $('member-rename-title');
  const errBox = $('edit-member-name-error');
  const input = $('edit-member-name-input');
  if (!modal || !input || !member) return;

  state.editingMemberUid = member.uid;
  if (titleEl) titleEl.textContent = `Edit Admin Name — ${member.username}`;
  if (errBox) {
    errBox.hidden = true;
    errBox.textContent = '';
  }
  input.value = member.username || '';
  modal.hidden = false;
  window.setTimeout(() => {
    input.focus();
    input.select();
  }, 40);
}

function closeMemberRenameModal() {
  const modal = $('member-rename-modal');
  if (modal) modal.hidden = true;
  state.editingMemberUid = null;
  const errBox = $('edit-member-name-error');
  if (errBox) {
    errBox.hidden = true;
    errBox.textContent = '';
  }
}

function openMemberPasswordModal(member) {
  const modal = $('member-password-modal');
  const subEl = $('member-password-subtitle');
  const errBox = $('edit-member-pwd-error');
  const form = $('edit-member-pwd-form');
  const pwdInput = $('edit-member-pwd-input');
  if (!modal || !form || !member) return;

  state.editingMemberUid = member.uid;
  if (subEl) {
    subEl.textContent = `Set a new password in Firebase Authentication for ${member.username}. Active sessions on their other devices will be revoked.`;
  }
  if (errBox) {
    errBox.hidden = true;
    errBox.textContent = '';
  }
  form.reset();
  resetPasswordFieldsInContainer(form);
  modal.hidden = false;
  if (pwdInput) {
    window.setTimeout(() => pwdInput.focus(), 40);
  }
}

function closeMemberPasswordModal() {
  const modal = $('member-password-modal');
  const form = $('edit-member-pwd-form');
  if (modal) modal.hidden = true;
  if (form) {
    form.reset();
    resetPasswordFieldsInContainer(form);
  }
  state.editingMemberUid = null;
  const errBox = $('edit-member-pwd-error');
  if (errBox) {
    errBox.hidden = true;
    errBox.textContent = '';
  }
}

/* ============================================================================
   VIEW SWITCHING & NAVIGATION
   ============================================================================ */

function switchSettingsTab(tabName) {
  const nextTab = tabName === 'security' ? 'security' : 'contact';
  state.currentSettingsTab = nextTab;

  const contactPanel = $('settings-panel-contact');
  const securityPanel = $('settings-panel-security');
  if (contactPanel) contactPanel.hidden = nextTab !== 'contact';
  if (securityPanel) securityPanel.hidden = nextTab !== 'security';

  document.querySelectorAll('[data-settings-tab]').forEach((btn) => {
    const active = btn.getAttribute('data-settings-tab') === nextTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

function switchView(viewName, options = {}) {
  const target = VALID_VIEWS.includes(viewName) ? viewName : 'dashboard';
  state.currentView = target;

  VALID_VIEWS.forEach((v) => {
    const panel = $(`view-${v}`);
    if (panel) panel.hidden = v !== target;
  });

  const activeSidebarKey = target === 'categories' ? 'products' : target;
  document.querySelectorAll('.sidebar-nav-item[data-admin-nav]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-admin-nav') === activeSidebarKey);
  });

  const viewTitles = {
    dashboard: 'Admin Dashboard',
    products: 'All Products',
    'add-product': productFormCtrl && productFormCtrl.mode === 'edit' ? 'Edit Product' : 'Add New Product',
    categories: 'Product Categories',
    inventory: 'Inventory & Stock Control',
    settings: 'Boutique Settings & Security'
  };
  const headerTitle = $('admin-topbar-title');
  if (headerTitle) headerTitle.textContent = viewTitles[target] || 'Admin Panel';

  if (target === 'add-product' && options.resetForm && productFormCtrl) {
    productFormCtrl.resetForCreate();
    if (headerTitle) headerTitle.textContent = 'Add New Product';
  }

  if (target === 'settings' && options.settingsTab) {
    switchSettingsTab(options.settingsTab);
  }

  closeMobileSidebar();
  renderCurrentView();
}

function openMobileSidebar() {
  const sidebar = $('admin-sidebar');
  const backdrop = $('admin-sidebar-backdrop');
  if (sidebar) sidebar.classList.add('is-open');
  if (backdrop) backdrop.hidden = false;
}

function closeMobileSidebar() {
  const sidebar = $('admin-sidebar');
  const backdrop = $('admin-sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('is-open');
  if (backdrop) backdrop.hidden = true;
}

function clearSubscriptions() {
  state.subscribedUid = null;
  state.adminMembers = [];
  state.membersLoaded = false;
  state.unsubscribers.forEach((unsub) => {
    try {
      if (typeof unsub === 'function') unsub();
    } catch (_e) {
      // ignore
    }
  });
  state.unsubscribers = [];
}

/* ============================================================================
   SECURITY STATUS, ROLE PERMISSIONS & ADMIN MEMBERS DIRECTORY
   ============================================================================ */

function getEffectiveMustChangePassword() {
  if (state.passwordJustChanged) return false;
  if (state.securityMeta && state.securityMeta.exists) {
    return Boolean(state.securityMeta.mustChangePassword);
  }
  return Boolean(state.mustChangePassword);
}

function renderSecurityBannerAndStatus() {
  const mustChange = getEffectiveMustChangePassword();

  const banner = $('admin-temp-password-banner');
  if (banner) {
    banner.hidden = !mustChange;
  }

  const pill = $('security-pwd-status-pill');
  if (pill) {
    if (mustChange) {
      pill.textContent = 'Temporary Password Active';
      pill.className = 'admin-pill pill-warning';
    } else {
      pill.textContent = 'Active & Verified';
      pill.className = 'admin-pill pill-success';
    }
  }

  const pwdUpdatedEl = $('settings-pwd-updated');
  if (pwdUpdatedEl) {
    const updatedMs = state.profileUpdatedAtMs || (state.securityMeta && state.securityMeta.passwordUpdatedAtMs) || 0;
    if (mustChange) {
      pwdUpdatedEl.textContent = 'Temporary initial setup password in use — update recommended';
    } else if (updatedMs) {
      pwdUpdatedEl.textContent = formatDateTimeShort(updatedMs);
    } else {
      pwdUpdatedEl.textContent = 'Active & verified in Firebase Authentication';
    }
  }
}

function updateIdentityDisplays() {
  const roleLabel = formatAdminRoleLabel(state.role);
  const nameDisplay = state.username || 'KAARIGAI Admin';

  if ($('admin-user-email-pill')) {
    $('admin-user-email-pill').textContent = `${nameDisplay} • ${roleLabel}`;
  }
  if ($('settings-admin-name')) {
    $('settings-admin-name').textContent = nameDisplay;
  }
  if ($('settings-admin-role')) {
    $('settings-admin-role').innerHTML = `<span class="admin-pill ${
      state.isPrimaryAdmin ? 'pill-gold' : 'pill-neutral'
    }">${escapeHtml(roleLabel)}</span>`;
  }
  if ($('settings-admin-uid')) {
    $('settings-admin-uid').textContent = state.user?.uid || '-';
  }
  if ($('settings-auth-method')) {
    $('settings-auth-method').textContent = state.authMethod || 'Firebase Authentication';
  }
}

function applyRolePermissionsUI() {
  const isPrimary = Boolean(state.isPrimaryAdmin);

  const readonlyBanner = $('contact-role-readonly-banner');
  if (readonlyBanner) {
    readonlyBanner.hidden = isPrimary;
    if (!isPrimary) {
      readonlyBanner.innerHTML =
        'Read-only preview: Only an authorized <strong>Admin</strong> account can modify Boutique Contact Details or Store Thresholds.';
    }
  }

  const contactForm = $('admin-contact-form');
  if (contactForm) {
    contactForm.classList.toggle('is-readonly-form', !isPrimary);
    contactForm.querySelectorAll('input, textarea, select').forEach((el) => {
      el.disabled = !isPrimary;
    });
    const saveContactBtn = $('save-contact-btn');
    if (saveContactBtn) {
      saveContactBtn.disabled = !isPrimary;
      saveContactBtn.hidden = !isPrimary;
    }
  }

  const storeForm = $('admin-settings-form');
  if (storeForm) {
    storeForm.classList.toggle('is-readonly-form', !isPrimary);
    storeForm.querySelectorAll('input, button[type="submit"]').forEach((el) => {
      el.disabled = !isPrimary;
    });
  }

  const membersSection = $('security-members-section');
  const memberRoleNote = $('security-member-role-note');
  if (membersSection) membersSection.hidden = !isPrimary;
  if (memberRoleNote) {
    memberRoleNote.hidden = isPrimary;
    if (!isPrimary) {
      const label = formatAdminRoleLabel(state.role);
      memberRoleNote.innerHTML = `You are signed in as <strong>${escapeHtml(
        label
      )}</strong> (restricted permissions). Only an authorized <strong>Admin</strong> can create, rename, reset passwords for, delete accounts, or permanently delete products and categories.`;
    }
  }

  if (!isPrimary) {
    const addPanel = $('add-member-panel');
    if (addPanel) addPanel.hidden = true;
  }
}

function renderAdminMembersSection() {
  const wrap = $('admin-members-table-wrap');
  if (!wrap || !state.isPrimaryAdmin) return;

  let nextHtml = '';
  if (!state.membersLoaded && !state.adminMembers.length) {
    nextHtml = `<div class="empty-panel">Loading administrator roster from Cloud Firestore...</div>`;
  } else if (!state.adminMembers.length) {
    nextHtml = `<div class="empty-panel">No administrator profiles found yet.</div>`;
  } else {
    const primaryCount = state.adminMembers.filter((m) => isFullAdminRole(m.role)).length;

    nextHtml = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Admin Name</th>
            <th>Role</th>
            <th>Account Status</th>
            <th>Created Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.adminMembers
            .map((member) => {
              const isSelf = Boolean(state.user && member.uid === state.user.uid);
              const isPrimary = isFullAdminRole(member.role);
              const cannotDelete = isSelf || (isPrimary && primaryCount <= 1);
              const deleteTitle = isSelf
                ? 'You cannot delete your own active session'
                : isPrimary && primaryCount <= 1
                ? 'Cannot delete the last Primary Admin'
                : `Delete ${member.username}`;

              return `
                <tr data-member-row="${escapeHtml(member.uid)}">
                  <td>
                    <strong>${escapeHtml(member.username)}</strong>
                    ${isSelf ? '<span class="self-tag">(You)</span>' : ''}
                  </td>
                  <td>
                    <span class="admin-pill ${isPrimary ? 'pill-gold' : 'pill-neutral'}">
                      ${escapeHtml(formatAdminRoleLabel(member.role))}
                    </span>
                  </td>
                  <td>
                    <span class="admin-pill ${member.isActive ? 'pill-success' : 'pill-danger'}">
                      ${member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>${escapeHtml(formatDateShort(member.createdAtMs))}</td>
                  <td>
                    <div class="table-actions members-actions-cell">
                      <button
                        type="button"
                        class="admin-btn admin-btn-outline admin-btn-xs"
                        data-edit-member-name="${escapeHtml(member.uid)}"
                      >
                        Edit Name
                      </button>
                      <button
                        type="button"
                        class="admin-btn admin-btn-ghost admin-btn-xs"
                        data-change-member-pwd="${escapeHtml(member.uid)}"
                      >
                        Change Password
                      </button>
                      <button
                        type="button"
                        class="admin-btn admin-btn-danger-ghost admin-btn-xs"
                        data-delete-member="${escapeHtml(member.uid)}"
                        ${cannotDelete ? `disabled title="${escapeHtml(deleteTitle)}"` : ''}
                      >
                        Delete Member
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
  }

  if (wrap.__lastRenderedHtml === nextHtml && wrap.childElementCount > 0) {
    return;
  }
  wrap.__lastRenderedHtml = nextHtml;
  wrap.innerHTML = nextHtml;
}

/* ============================================================================
   CONTACT SETTINGS FORM & LIVE PREVIEW
   ============================================================================ */

function readContactFormValues() {
  const draft = {};
  CONTACT_FIELD_KEYS.forEach((key) => {
    const el = $(CONTACT_INPUT_MAP[key]);
    draft[key] = el ? String(el.value || '').trim() : '';
  });
  return normalizeContactDoc(draft);
}

function populateContactForm(contact) {
  const c = normalizeContactDoc(contact);
  CONTACT_FIELD_KEYS.forEach((key) => {
    const el = $(CONTACT_INPUT_MAP[key]);
    if (el) {
      el.value = c[key] || '';
    }
  });
}

function setContactPreviewBadge(mode, label) {
  const badge = $('contact-preview-badge');
  if (!badge) return;
  badge.textContent = label;
  badge.className = `admin-pill ${mode}`;
}

function renderContactPreview(contact) {
  const container = $('contact-preview-body');
  if (!container) return;

  const c = normalizeContactDoc(contact);
  const configured = hasContactConfigured(c);
  if (!configured) {
    container.innerHTML = `
      <div class="empty-panel">
        <p>Fill in your boutique contact fields on the left and click <strong>Preview Before Saving</strong> to inspect how the Contact section and Footer will appear to customers.</p>
      </div>
    `;
    return;
  }

  const displayBoutique = c.boutiqueName || c.businessName || 'KAARIGAI Boutique';
  const displayBusiness = c.businessName || c.boutiqueName || 'KAARIGAI';
  const fullAddr = formatFullAddress(c);
  const hoursStr = formatBusinessHours(c);
  const telHref = buildPhoneHref(c.mobileNumber);
  const waHref = buildWhatsappHref(c.whatsappNumber);
  const igHandle = formatInstagramHandle(c.instagramUsername);
  const igUrlValid = isValidHttpUrl(c.instagramUrl);
  const fbUrlValid = isValidHttpUrl(c.facebookUrl);
  const mapsValid = isValidHttpUrl(c.googleMapsUrl);

  container.innerHTML = `
    <div class="preview-stack">
      <div class="preview-subcard">
        <div class="preview-subcard-head">
          <span class="preview-tag">Contact Section Card</span>
          <strong>${escapeHtml(displayBoutique)}</strong>
        </div>
        <dl class="preview-meta-list">
          <div><dt>Business Name</dt><dd>${escapeHtml(displayBusiness)}</dd></div>
          <div><dt>Address</dt><dd>${escapeHtml(fullAddr || 'Pending address details')}</dd></div>
          <div><dt>Hours</dt><dd>${escapeHtml(hoursStr || 'Pending opening & closing times')}</dd></div>
          <div><dt>Mobile</dt><dd>${telHref ? `<a href="${escapeHtml(telHref)}">${escapeHtml(c.mobileNumber)}</a>` : escapeHtml(c.mobileNumber || 'Not provided')}</dd></div>
          <div><dt>WhatsApp</dt><dd>${waHref ? `<a href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.whatsappNumber)}</a>` : escapeHtml(c.whatsappNumber || 'Optional')}</dd></div>
          <div><dt>Email</dt><dd>${c.contactEmail ? `<a href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a>` : 'Optional'}</dd></div>
          <div>
            <dt>Instagram</dt>
            <dd>${igUrlValid ? `<a href="${escapeHtml(c.instagramUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(igHandle || c.instagramUrl)}</a>` : escapeHtml(igHandle || 'Optional')}</dd>
          </div>
          ${fbUrlValid ? `<div><dt>Facebook</dt><dd><a href="${escapeHtml(c.facebookUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.facebookUrl)}</a></dd></div>` : ''}
          ${mapsValid ? `<div><dt>Google Maps</dt><dd><a href="${escapeHtml(c.googleMapsUrl)}" target="_blank" rel="noopener noreferrer">Open Map Pin &nearr;</a></dd></div>` : ''}
          ${c.additionalInfo ? `<div><dt>Boutique Note</dt><dd>${escapeHtml(c.additionalInfo)}</dd></div>` : ''}
        </dl>
      </div>

      <div class="preview-subcard preview-footer-sim">
        <div class="preview-subcard-head">
          <span class="preview-tag">Footer Block</span>
          <strong>${escapeHtml(c.city ? `${c.city} Boutique` : displayBoutique)}</strong>
        </div>
        <p class="preview-footer-line"><strong>${escapeHtml(displayBusiness)}</strong>${fullAddr ? ` &bull; ${escapeHtml(fullAddr)}` : ''}</p>
        ${hoursStr ? `<p class="preview-footer-line">Hours: ${escapeHtml(hoursStr)}</p>` : ''}
        <p class="preview-footer-line">
          ${[
            c.mobileNumber ? `Phone: ${escapeHtml(c.mobileNumber)}` : '',
            c.whatsappNumber ? `WhatsApp: ${escapeHtml(c.whatsappNumber)}` : '',
            c.contactEmail ? `Email: ${escapeHtml(c.contactEmail)}` : '',
            igHandle ? `IG: ${escapeHtml(igHandle)}` : ''
          ]
            .filter(Boolean)
            .join(' • ') || 'Contact channels will display here once entered.'}
        </p>
      </div>
    </div>
  `;
}

function showContactErrors(errors = []) {
  const errBox = $('contact-form-errors');
  if (!errBox) return;
  if (!errors.length) {
    errBox.hidden = true;
    errBox.innerHTML = '';
    return;
  }
  errBox.innerHTML = `<strong>Please fix the following contact details:</strong><ul>${errors
    .map((msg) => `<li>${escapeHtml(msg)}</li>`)
    .join('')}</ul>`;
  errBox.hidden = false;
}

/* ============================================================================
   AUTHENTICATION & DATA SUBSCRIPTIONS
   ============================================================================ */

function redirectToLogin(targetUrl = 'admin-login.html') {
  if (state.isRedirecting) return;
  state.isRedirecting = true;
  window.location.replace(state.pendingRedirectUrl || targetUrl);
}

async function runSelfSessionCredentialUpdate(asyncAction) {
  state.isChangingPassword = true;
  clearSubscriptions();
  try {
    return await asyncAction();
  } finally {
    state.isChangingPassword = false;
    if (
      !state.isRedirecting &&
      state.authStatus === 'authorized' &&
      state.user &&
      !state.subscribedUid
    ) {
      state.subscribedUid = state.user.uid || 'active';
      startFirestoreSubscriptions();
    }
  }
}

async function renderAuthScreens(authInfo) {
  const checkingEl = $('admin-loading-screen');
  const appShell = $('admin-app-shell');

  state.authStatus = authInfo.status;

  if (authInfo.status === 'signed-out') {
    clearSubscriptions();
    if (appShell) appShell.hidden = true;
    if (checkingEl) checkingEl.hidden = false;
    redirectToLogin('admin-login.html');
    return;
  }

  if (authInfo.status === 'unauthorized') {
    clearSubscriptions();
    if (appShell) appShell.hidden = true;
    if (checkingEl) checkingEl.hidden = false;
    const reasonParam = authInfo.sessionInvalidated ? 'session_expired' : 'unauthorized';
    state.pendingRedirectUrl = `admin-login.html?reason=${reasonParam}`;
    try {
      await signOutAdmin();
    } catch (_e) {
      // ignore sign-out error before redirecting
    }
    redirectToLogin(state.pendingRedirectUrl);
    return;
  }

  // Authorized admin session
  state.user = authInfo.user;
  state.role = authInfo.role || ADMIN_ROLES.ADMIN_MEMBER;
  state.username = authInfo.username || authInfo.user?.displayName || 'Admin';
  state.isPrimaryAdmin = Boolean(authInfo.isPrimaryAdmin);
  state.authMethod = authInfo.authMethod || 'Firebase Authentication';
  if (!state.passwordJustChanged) {
    state.mustChangePassword = Boolean(authInfo.mustChangePassword);
  }

  if (checkingEl) checkingEl.hidden = true;
  if (appShell) appShell.hidden = false;

  updateIdentityDisplays();
  applyRolePermissionsUI();
  renderSecurityBannerAndStatus();
  if (state.isPrimaryAdmin) {
    renderAdminMembersSection();
  }

  if (state.subscribedUid !== authInfo.user?.uid) {
    state.subscribedUid = authInfo.user?.uid || 'active';
    startFirestoreSubscriptions();
  }
}

function startFirestoreSubscriptions() {
  const uid = state.subscribedUid;
  const isPrimaryAtSubscribe = Boolean(state.isPrimaryAdmin);
  clearSubscriptions();
  state.subscribedUid = uid;
  setSyncStatus('syncing', 'Syncing Firestore...');

  const getThreshold = () => state.settings.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD;

  const unsubSettings = subscribeStoreSettings(
    (settings) => {
      state.settings = settings;
      const threshInput = $('settings-low-stock-threshold');
      const storeInput = $('settings-store-name');
      if (threshInput && document.activeElement !== threshInput) {
        threshInput.value = String(settings.lowStockThreshold);
      }
      if (storeInput && document.activeElement !== storeInput) {
        storeInput.value = settings.storeName;
      }
      renderAll();
    },
    (errMsg) => {
      setSyncStatus('error', 'Sync Alert');
      showToast(errMsg);
    }
  );

  const unsubContact = subscribeContactSettings(
    ({ exists, contact }) => {
      state.contactExists = Boolean(exists);
      state.savedContact = normalizeContactDoc(contact);
      if (!state.contactDirty) {
        populateContactForm(state.savedContact);
        setContactPreviewBadge(
          exists ? 'pill-success' : 'pill-neutral',
          exists ? 'Live Saved Contact' : 'Not Configured Yet'
        );
        renderContactPreview(state.savedContact);
      }
    },
    (errMsg) => {
      setSyncStatus('error', 'Contact Sync Error');
      showToast(errMsg);
    }
  );

  const unsubSessionValidity = subscribeAdminSessionValidity(
    uid,
    async (reason) => {
      if (state.isChangingPassword || state.isRedirecting) return;
      clearSubscriptions();
      const mappedReason =
        reason === 'session_expired'
          ? 'session_expired'
          : reason === 'deleted' || reason === 'disabled'
          ? 'account_removed'
          : 'unauthorized';
      const targetUrl = `admin-login.html?reason=${mappedReason}`;
      state.pendingRedirectUrl = targetUrl;
      try {
        await signOutAdmin();
      } catch (_e) {
        // ignore
      }
      redirectToLogin(targetUrl);
    },
    (profilePatch) => {
      if (!profilePatch) return;
      let identityChanged = false;
      if (profilePatch.username && profilePatch.username !== state.username) {
        state.username = profilePatch.username;
        identityChanged = true;
      }
      if (profilePatch.role && profilePatch.role !== state.role) {
        state.role = profilePatch.role;
        state.isPrimaryAdmin = isFullAdminRole(profilePatch.role);
        identityChanged = true;
      }
      if (profilePatch.updatedAtMs) {
        state.profileUpdatedAtMs = profilePatch.updatedAtMs;
      }
      if (identityChanged) {
        updateIdentityDisplays();
        applyRolePermissionsUI();
      }
      renderSecurityBannerAndStatus();
    }
  );

  const unsubSecurity = subscribeSecurityMeta((meta) => {
    state.securityMeta = {
      exists: Boolean(meta.exists),
      mustChangePassword: Boolean(meta.mustChangePassword),
      passwordUpdatedAtMs: Number(meta.passwordUpdatedAtMs || 0)
    };
    if (meta.exists && !meta.mustChangePassword) {
      state.passwordJustChanged = true;
    } else if (meta.exists && meta.mustChangePassword) {
      state.passwordJustChanged = false;
    }
    renderSecurityBannerAndStatus();
  });

  const unsubCategories = subscribeCategories(
    (cats) => {
      state.categories = cats;
      if (productFormCtrl) productFormCtrl.syncCategoryDropdown();
      syncFilterCategoryOptions();
      renderAll();
    },
    (errMsg) => {
      setSyncStatus('error', 'Categories Sync Error');
      showToast(errMsg);
    }
  );

  const unsubProducts = subscribeAllProducts(
    (products) => {
      state.products = products;
      state.dirtyInventory = {};
      setSyncStatus('live', 'Live Firestore Sync');
      syncInventoryProductFilter();
      syncFilterCategoryOptions();
      renderAll();
    },
    (errMsg) => {
      setSyncStatus('error', 'Products Permission / Network Error');
      const banner = $('admin-global-error-banner');
      if (banner) {
        banner.textContent = errMsg;
        banner.hidden = false;
      }
    },
    getThreshold
  );

  state.unsubscribers.push(
    unsubSessionValidity,
    unsubSettings,
    unsubContact,
    unsubSecurity,
    unsubCategories,
    unsubProducts
  );

  if (isPrimaryAtSubscribe) {
    const unsubMembers = subscribeAdminUsersList(
      (members) => {
        state.adminMembers = members;
        state.membersLoaded = true;
        renderAdminMembersSection();
      },
      (errMsg) => {
        const banner = $('members-error-banner');
        if (banner && !state.membersLoaded) {
          banner.textContent = errMsg;
          banner.hidden = false;
        }
      }
    );
    state.unsubscribers.push(unsubMembers);

    listAdminMembers()
      .then((members) => {
        if (Array.isArray(members) && members.length && state.isPrimaryAdmin) {
          state.adminMembers = members;
          state.membersLoaded = true;
          renderAdminMembersSection();
        }
      })
      .catch(() => {
        // Real-time Firestore listener remains active
      });
  }
}

/* ============================================================================
   RENDERERS: DASHBOARD, PRODUCTS, CATEGORIES, INVENTORY, SETTINGS
   ============================================================================ */

function renderAll() {
  renderDashboard();
  renderProductsTable();
  renderCategoriesView();
  renderInventoryView();
  if (state.isPrimaryAdmin) {
    renderAdminMembersSection();
  }
}

function renderCurrentView() {
  if (state.currentView === 'dashboard') renderDashboard();
  else if (state.currentView === 'products') renderProductsTable();
  else if (state.currentView === 'categories') renderCategoriesView();
  else if (state.currentView === 'inventory') renderInventoryView();
  else if (state.currentView === 'settings') {
    if (!state.contactDirty) {
      renderContactPreview(state.savedContact);
    } else {
      renderContactPreview(readContactFormValues());
    }
    updateIdentityDisplays();
    applyRolePermissionsUI();
    renderSecurityBannerAndStatus();
    if (state.isPrimaryAdmin) {
      renderAdminMembersSection();
    }
  }
}

function renderDashboard() {
  const threshold = state.settings.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD;
  const metrics = computeDashboardMetrics(state.products, state.categories, threshold);

  const kpiGrid = $('dashboard-kpi-grid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <span class="kpi-label">Total Products</span>
        <strong class="kpi-value">${metrics.totalProducts}</strong>
        <span class="kpi-meta">${metrics.activeProducts} Active • ${metrics.inactiveProducts} Hidden</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Total Stock</span>
        <strong class="kpi-value">${metrics.totalStock.toLocaleString('en-IN')}</strong>
        <span class="kpi-meta">Units across all colors &amp; sizes</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Total Categories</span>
        <strong class="kpi-value">${metrics.totalCategories}</strong>
        <span class="kpi-meta">${state.categories.length} Managed in Firestore</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Total Available Colors</span>
        <strong class="kpi-value">${metrics.totalAvailableColors}</strong>
        <span class="kpi-meta">${metrics.inStockColors} Variants currently in stock</span>
      </div>
      <div class="kpi-card kpi-warning">
        <span class="kpi-label">Low Stock Products</span>
        <strong class="kpi-value">${metrics.lowStockProducts}</strong>
        <span class="kpi-meta">Threshold &le; ${threshold} units</span>
      </div>
      <div class="kpi-card kpi-danger">
        <span class="kpi-label">Out of Stock Products</span>
        <strong class="kpi-value">${metrics.outOfStockProducts}</strong>
        <span class="kpi-meta">Zero total inventory remaining</span>
      </div>
    `;
  }

  // 1. Recently Added Products
  const recentEl = $('dash-recent-products');
  if (recentEl) {
    if (!metrics.recentlyAdded.length) {
      recentEl.innerHTML = `<div class="empty-panel">No products in Firestore yet. Click <strong>Add New Product</strong> to publish your first garment.</div>`;
    } else {
      recentEl.innerHTML = metrics.recentlyAdded
        .map(
          (p) => `
          <div class="mini-product-row">
            <img src="${escapeHtml(p.defaultImage)}" alt="${escapeHtml(p.name)}" class="mini-thumb" />
            <div class="mini-product-info">
              <strong>${escapeHtml(p.name)}</strong>
              <span>${escapeHtml(p.category)} • ${formatINR(p.price)} • ${p.colors.length} color${p.colors.length === 1 ? '' : 's'} • ${formatDateShort(p.createdAtMs)}</span>
            </div>
            <div class="mini-product-right">
              <span class="admin-pill ${stockBadgeClass(p.stockStatus)}">${p.totalStock} in stock</span>
              <button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-edit-product="${escapeHtml(p.id)}">Edit</button>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  // 2. Low Stock Alerts
  const alertsEl = $('dash-low-stock-alerts');
  if (alertsEl) {
    if (!metrics.lowAndOutRows.length) {
      alertsEl.innerHTML = `<div class="empty-panel is-calm">All product sizes are healthy (above ${threshold} units).</div>`;
    } else {
      alertsEl.innerHTML = metrics.lowAndOutRows
        .slice(0, 8)
        .map(
          (row) => `
          <div class="alert-row">
            <div class="alert-row-main">
              <span class="swatch-dot-sm" style="background-color:${escapeHtml(row.colorCode)}"></span>
              <div>
                <strong>${escapeHtml(row.productName)}</strong>
                <span>SKU: ${escapeHtml(row.sku)} • ${escapeHtml(row.colorName)} • Size ${escapeHtml(row.size)}</span>
              </div>
            </div>
            <div class="alert-row-right">
              <span class="admin-pill ${stockBadgeClass(row.status)}">${row.stock} left (${escapeHtml(row.status)})</span>
              <button type="button" class="admin-btn admin-btn-outline admin-btn-xs" data-restock-product="${escapeHtml(row.productId)}">Restock</button>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  // 3. All Products Overview
  const overviewEl = $('dash-products-overview');
  if (overviewEl) {
    if (!state.products.length) {
      overviewEl.innerHTML = `<div class="empty-panel">No products added yet.</div>`;
    } else {
      overviewEl.innerHTML = `
        <div class="table-scroll">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Colors</th>
                <th>Total Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${state.products
                .slice(0, 8)
                .map(
                  (p) => `
                <tr>
                  <td>
                    <div class="table-prod-cell">
                      <img src="${escapeHtml(p.defaultImage)}" alt="" class="table-thumb" />
                      <div>
                        <strong>${escapeHtml(p.name)}</strong>
                        <small>${escapeHtml(p.sku)}</small>
                      </div>
                    </div>
                  </td>
                  <td>${escapeHtml(p.category)}</td>
                  <td><strong>${formatINR(p.price)}</strong></td>
                  <td>
                    <div class="swatch-stack">
                      ${p.colors
                        .map(
                          (c) =>
                            `<span class="swatch-dot-sm" style="background-color:${escapeHtml(c.colorCode)}" title="${escapeHtml(c.colorName)}"></span>`
                        )
                        .join('')}
                      <span>(${p.colors.length})</span>
                    </div>
                  </td>
                  <td>${p.totalStock} units</td>
                  <td>
                    <span class="admin-pill ${p.isActive ? 'pill-success' : 'pill-neutral'}">${p.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // 4. Product Stock Overview
  const stockOverEl = $('dash-stock-overview');
  if (stockOverEl) {
    if (!state.products.length) {
      stockOverEl.innerHTML = `<div class="empty-panel">Add products to inspect variant stock health across colors and sizes.</div>`;
    } else {
      const sorted = state.products.slice().sort((a, b) => a.totalStock - b.totalStock);
      stockOverEl.innerHTML = `
        <div class="table-scroll">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Product &amp; SKU</th>
                <th>Color Variants</th>
                <th>Stock Breakdown</th>
                <th>Total Units</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              ${sorted
                .slice(0, 8)
                .map((p) => {
                  const colorSummary = p.colors
                    .map((c) => `${escapeHtml(c.colorName)}: ${c.totalStock}`)
                    .join(' • ');
                  return `
                    <tr>
                      <td>
                        <strong>${escapeHtml(p.name)}</strong><br />
                        <small>${escapeHtml(p.sku)}</small>
                      </td>
                      <td>${p.colors.length} color${p.colors.length === 1 ? '' : 's'}</td>
                      <td class="stock-breakdown-cell">${colorSummary || 'No variants'}</td>
                      <td><strong>${p.totalStock}</strong></td>
                      <td><span class="admin-pill ${stockBadgeClass(p.stockStatus)}">${escapeHtml(p.stockStatus)}</span></td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}

function syncFilterCategoryOptions() {
  const catNames = Array.from(
    new Set([
      ...state.categories.map((c) => c.name),
      ...state.products.map((p) => p.category)
    ].filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  [$('prod-filter-category'), $('inv-filter-category')].forEach((sel) => {
    if (!sel) return;
    const prev = sel.value || 'All';
    sel.innerHTML =
      '<option value="All">All Categories</option>' +
      catNames.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    sel.value = catNames.includes(prev) ? prev : 'All';
  });
}

function renderProductsTable() {
  const wrap = $('all-products-table-wrap');
  const countEl = $('all-products-count');
  if (!wrap) return;

  const f = state.productFilters;
  const q = f.query.trim().toLowerCase();

  let list = state.products.filter((p) => {
    if (f.category !== 'All' && p.category !== f.category) return false;
    if (f.status === 'active' && !p.isActive) return false;
    if (f.status === 'inactive' && p.isActive) return false;
    if (f.stockHealth !== 'All' && p.stockStatus !== f.stockHealth) return false;
    if (q) {
      const hay = `${p.name} ${p.sku} ${p.category} ${p.description} ${p.colors.map((c) => c.colorName).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (f.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (f.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (f.sort === 'stock-asc') list.sort((a, b) => a.totalStock - b.totalStock);
  else if (f.sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));

  if (countEl) {
    countEl.textContent = `Showing ${list.length} of ${state.products.length} product${state.products.length === 1 ? '' : 's'}`;
  }

  if (!list.length) {
    wrap.innerHTML = `
      <div class="empty-panel">
        <p>${state.products.length ? 'No products match the current filters.' : 'No products saved in Firestore yet.'}</p>
        ${
          !state.products.length
            ? '<button type="button" class="admin-btn admin-btn-primary" id="empty-add-product-btn">+ Add First Product</button>'
            : ''
        }
      </div>
    `;
    return;
  }

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Category</th>
            <th>Price</th>
            <th>Colors &amp; Sizes</th>
            <th>Total Stock</th>
            <th>Visibility</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .map((p) => {
              const colorDots = p.colors
                .map(
                  (c) =>
                    `<span class="swatch-dot-sm" style="background-color:${escapeHtml(c.colorCode)}" title="${escapeHtml(c.colorName)} (${c.totalStock} units)"></span>`
                )
                .join('');
              const sizeCount = new Set(p.colors.flatMap((c) => c.sizes.map((s) => s.size))).size;

              return `
                <tr>
                  <td>
                    <div class="table-prod-cell">
                      <img src="${escapeHtml(p.defaultImage)}" alt="${escapeHtml(p.name)}" class="table-thumb" />
                      <div>
                        <strong>${escapeHtml(p.name)}</strong>
                        <small>${escapeHtml(p.defaultColor)} (Default)</small>
                      </div>
                    </div>
                  </td>
                  <td><code>${escapeHtml(p.sku)}</code></td>
                  <td>${escapeHtml(p.category)}</td>
                  <td><strong>${formatINR(p.price)}</strong></td>
                  <td>
                    <div class="swatch-stack">${colorDots}</div>
                    <small>${p.colors.length} color${p.colors.length === 1 ? '' : 's'} • ${sizeCount} size${sizeCount === 1 ? '' : 's'}</small>
                  </td>
                  <td>
                    <span class="admin-pill ${stockBadgeClass(p.stockStatus)}">${p.totalStock} (${escapeHtml(p.stockStatus)})</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="visibility-toggle ${p.isActive ? 'is-on' : 'is-off'}"
                      data-toggle-active="${escapeHtml(p.id)}"
                      aria-pressed="${p.isActive}"
                    >
                      ${p.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div class="table-actions">
                      <button type="button" class="admin-btn admin-btn-outline admin-btn-xs" data-edit-product="${escapeHtml(p.id)}">Edit</button>
                      <button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-restock-product="${escapeHtml(p.id)}">Stock</button>
                      ${
                        state.isPrimaryAdmin
                          ? `<button type="button" class="admin-btn admin-btn-danger-ghost admin-btn-xs" data-delete-product="${escapeHtml(p.id)}">Delete</button>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderCategoriesView() {
  const listWrap = $('categories-list-wrap');
  if (!listWrap) return;

  const productCountByCat = {};
  state.products.forEach((p) => {
    const key = p.category || 'Uncategorized';
    productCountByCat[key] = (productCountByCat[key] || 0) + 1;
  });

  if (!state.categories.length) {
    listWrap.innerHTML = `
      <div class="empty-panel">
        <p>No categories created in Firestore yet. Create a custom category above or click <strong>Seed Starter Categories</strong> to initialize Sarees, Kurtis, Dresses, Shirts, Lehengas, Western Wear &amp; Accessories.</p>
      </div>
    `;
    return;
  }

  listWrap.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Category Name</th>
            <th>Slug ID</th>
            <th>Products Linked</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${state.categories
            .map((cat) => {
              const count = productCountByCat[cat.name] || 0;
              const isEditing = state.renamingCategoryId === cat.id;

              return `
                <tr>
                  <td>
                    ${
                      isEditing
                        ? `<div class="inline-rename-row">
                            <input type="text" id="rename-cat-input-${escapeHtml(cat.id)}" value="${escapeHtml(cat.name)}" />
                            <button type="button" class="admin-btn admin-btn-primary admin-btn-xs" data-save-rename-cat="${escapeHtml(cat.id)}">Save</button>
                            <button type="button" class="admin-btn admin-btn-ghost admin-btn-xs" data-cancel-rename-cat>Cancel</button>
                           </div>`
                        : `<strong>${escapeHtml(cat.name)}</strong>${cat.description ? `<br><small>${escapeHtml(cat.description)}</small>` : ''}`
                    }
                  </td>
                  <td><code>${escapeHtml(cat.slug || cat.id)}</code></td>
                  <td><span class="admin-pill pill-neutral">${count} product${count === 1 ? '' : 's'}</span></td>
                  <td>
                    <div class="table-actions">
                      <button type="button" class="admin-btn admin-btn-outline admin-btn-xs" data-start-rename-cat="${escapeHtml(cat.id)}">Rename</button>
                      ${
                        state.isPrimaryAdmin
                          ? `<button type="button" class="admin-btn admin-btn-danger-ghost admin-btn-xs" data-delete-cat="${escapeHtml(cat.id)}">Delete</button>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function syncInventoryProductFilter() {
  const sel = $('inv-filter-product');
  if (!sel) return;
  const prev = sel.value || 'All';
  sel.innerHTML =
    '<option value="All">All Products</option>' +
    state.products.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join('');
  sel.value = prev === 'All' || state.products.some((p) => p.id === prev) ? prev : 'All';
}

function renderInventoryView() {
  const wrap = $('inventory-table-wrap');
  const saveAllBtn = $('inventory-save-dirty-btn');
  const summaryEl = $('inventory-summary-bar');
  if (!wrap) return;

  const threshold = state.settings.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD;
  const metrics = computeDashboardMetrics(state.products, state.categories, threshold);
  let rows = metrics.inventoryRows;

  const f = state.inventoryFilters;
  const q = f.query.trim().toLowerCase();

  rows = rows.filter((row) => {
    if (f.category !== 'All' && row.category !== f.category) return false;
    if (f.productId !== 'All' && row.productId !== f.productId) return false;
    if (f.stockHealth !== 'All' && row.status !== f.stockHealth) return false;
    if (q) {
      const hay = `${row.productName} ${row.sku} ${row.colorName} ${row.size} ${row.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (summaryEl) {
    const outRows = metrics.inventoryRows.filter((r) => r.status === 'Out of Stock').length;
    const lowRows = metrics.inventoryRows.filter((r) => r.status === 'Low Stock').length;
    summaryEl.innerHTML = `
      <span class="admin-pill pill-neutral">${metrics.inventoryRows.length} Variant Rows</span>
      <span class="admin-pill pill-success">${metrics.totalStock.toLocaleString('en-IN')} Total Units</span>
      <span class="admin-pill pill-warning">${lowRows} Low Stock Sizes</span>
      <span class="admin-pill pill-danger">${outRows} Out of Stock Sizes</span>
    `;
  }

  const dirtyCount = Object.keys(state.dirtyInventory).length;
  if (saveAllBtn) {
    saveAllBtn.hidden = dirtyCount === 0;
    saveAllBtn.textContent = `Save All Changes (${dirtyCount})`;
  }

  if (!rows.length) {
    wrap.innerHTML = `<div class="empty-panel">${state.products.length ? 'No stock rows match your filters.' : 'No products found in Firestore inventory yet.'}</div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>SKU</th>
            <th>Color</th>
            <th>Size</th>
            <th>Available Stock</th>
            <th>Stock Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const dirty = state.dirtyInventory[row.rowId];
              const currentQty = dirty ? dirty.nextStock : row.stock;
              const liveStatus = getStockStatus(currentQty, threshold);
              return `
                <tr class="${dirty ? 'is-row-dirty' : ''}" data-inv-row="${escapeHtml(row.rowId)}">
                  <td>
                    <div class="table-prod-cell">
                      <img src="${escapeHtml(row.thumbnail)}" alt="" class="table-thumb" />
                      <div>
                        <strong>${escapeHtml(row.productName)}</strong>
                        <small>${escapeHtml(row.category)} • Product Total: ${row.productTotalStock}</small>
                      </div>
                    </div>
                  </td>
                  <td><code>${escapeHtml(row.sku)}</code></td>
                  <td>
                    <span class="color-cell-pill">
                      <span class="swatch-dot-sm" style="background-color:${escapeHtml(row.colorCode)}"></span>
                      <span>${escapeHtml(row.colorName)}</span>
                    </span>
                  </td>
                  <td><strong>${escapeHtml(row.size)}</strong></td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      class="inv-stock-input"
                      data-inv-stock-input="${escapeHtml(row.rowId)}"
                      data-prod-id="${escapeHtml(row.productId)}"
                      data-col-idx="${row.colorIndex}"
                      data-size="${escapeHtml(row.size)}"
                      data-orig-stock="${row.stock}"
                      value="${currentQty}"
                    />
                  </td>
                  <td>
                    <span class="admin-pill ${stockBadgeClass(liveStatus)}" data-inv-status-pill="${escapeHtml(row.rowId)}">${escapeHtml(liveStatus)}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="admin-btn ${dirty ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-xs"
                      data-inv-save-row="${escapeHtml(row.rowId)}"
                      ${dirty ? '' : 'disabled'}
                    >Save</button>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ============================================================================
   INVENTORY STOCK MUTATION HELPERS
   ============================================================================ */

async function commitDirtyInventoryRows(targetRowId = null) {
  const keys = targetRowId ? [targetRowId] : Object.keys(state.dirtyInventory);
  if (!keys.length) return;

  const groupedByProduct = {};
  keys.forEach((k) => {
    const entry = state.dirtyInventory[k];
    if (!entry) return;
    if (!groupedByProduct[entry.productId]) groupedByProduct[entry.productId] = [];
    groupedByProduct[entry.productId].push({
      colorIndex: entry.colorIndex,
      size: entry.size,
      stock: entry.nextStock
    });
  });

  const prodIds = Object.keys(groupedByProduct);
  for (const pid of prodIds) {
    const product = state.products.find((p) => p.id === pid);
    if (product) {
      await updateProductVariantStocks(product, groupedByProduct[pid]);
    }
  }

  keys.forEach((k) => delete state.dirtyInventory[k]);
  showToast('Stock quantities updated in Firestore.');
}

/* ============================================================================
   EVENT BINDINGS
   ============================================================================ */

function bindEvents() {
  // Sidebar navigation & mobile drawer
  document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-admin-nav');
      switchView(view, { resetForm: view === 'add-product' });
    });
  });

  if ($('admin-mobile-menu-btn')) {
    $('admin-mobile-menu-btn').addEventListener('click', openMobileSidebar);
  }
  if ($('admin-sidebar-close')) {
    $('admin-sidebar-close').addEventListener('click', closeMobileSidebar);
  }
  if ($('admin-sidebar-backdrop')) {
    $('admin-sidebar-backdrop').addEventListener('click', closeMobileSidebar);
  }

  // Topbar quick Add Product
  if ($('topbar-add-product-btn')) {
    $('topbar-add-product-btn').addEventListener('click', () => {
      switchView('add-product', { resetForm: true });
    });
  }

  // Temporary initial password warning banner action
  if ($('banner-open-security-btn')) {
    $('banner-open-security-btn').addEventListener('click', () => {
      switchView('settings', { settingsTab: 'security' });
      const curPwd = $('sec-current-password');
      if (curPwd) window.setTimeout(() => curPwd.focus(), 60);
    });
  }

  // Settings Tab Switcher (A. Contact Details <-> B. Security)
  document.querySelectorAll('[data-settings-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      switchSettingsTab(tabBtn.getAttribute('data-settings-tab'));
    });
  });

  // Logout
  if ($('admin-logout-btn')) {
    $('admin-logout-btn').addEventListener('click', async () => {
      clearSubscriptions();
      try {
        await signOutAdmin();
      } catch (_e) {
        // Proceed cleanly to login route even if offline
      }
      redirectToLogin('admin-login.html');
    });
  }

  // Confirm Modal buttons
  if ($('confirm-modal-ok')) {
    $('confirm-modal-ok').addEventListener('click', () => closeConfirmModal(true));
  }
  document.querySelectorAll('[data-close-confirm]').forEach((el) => {
    el.addEventListener('click', () => closeConfirmModal(false));
  });

  // Products view filters
  if ($('prod-filter-query')) {
    $('prod-filter-query').addEventListener('input', (e) => {
      state.productFilters.query = e.target.value;
      renderProductsTable();
    });
  }
  if ($('prod-filter-category')) {
    $('prod-filter-category').addEventListener('change', (e) => {
      state.productFilters.category = e.target.value;
      renderProductsTable();
    });
  }
  if ($('prod-filter-status')) {
    $('prod-filter-status').addEventListener('change', (e) => {
      state.productFilters.status = e.target.value;
      renderProductsTable();
    });
  }
  if ($('prod-filter-stock')) {
    $('prod-filter-stock').addEventListener('change', (e) => {
      state.productFilters.stockHealth = e.target.value;
      renderProductsTable();
    });
  }
  if ($('prod-sort-select')) {
    $('prod-sort-select').addEventListener('change', (e) => {
      state.productFilters.sort = e.target.value;
      renderProductsTable();
    });
  }

  // Categories Form & Actions
  if ($('create-category-form')) {
    $('create-category-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = $('cat-new-name');
      const descInput = $('cat-new-desc');
      const name = nameInput?.value.trim() || '';
      const desc = descInput?.value.trim() || '';
      if (name.length < 2) {
        showToast('Enter a category name (at least 2 characters).');
        return;
      }
      try {
        await saveCategory(name, desc, state.categories);
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
        showToast(`Category "${name}" saved.`);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
    });
  }

  if ($('seed-categories-btn')) {
    $('seed-categories-btn').addEventListener('click', async () => {
      try {
        const added = await seedDefaultCategories(state.categories);
        if (added > 0) {
          showToast(`Added ${added} starter categories to Firestore.`);
        } else {
          showToast('All starter categories are already present.');
        }
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
    });
  }

  // Inventory Filters & Bulk Save
  if ($('inv-filter-query')) {
    $('inv-filter-query').addEventListener('input', (e) => {
      state.inventoryFilters.query = e.target.value;
      renderInventoryView();
    });
  }
  if ($('inv-filter-category')) {
    $('inv-filter-category').addEventListener('change', (e) => {
      state.inventoryFilters.category = e.target.value;
      renderInventoryView();
    });
  }
  if ($('inv-filter-product')) {
    $('inv-filter-product').addEventListener('change', (e) => {
      state.inventoryFilters.productId = e.target.value;
      renderInventoryView();
    });
  }
  if ($('inv-filter-stock')) {
    $('inv-filter-stock').addEventListener('change', (e) => {
      state.inventoryFilters.stockHealth = e.target.value;
      renderInventoryView();
    });
  }
  if ($('inventory-save-dirty-btn')) {
    $('inventory-save-dirty-btn').addEventListener('click', async () => {
      try {
        await commitDirtyInventoryRows(null);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
    });
  }

  // Settings Category A: Contact Details (Live Preview + Validation + Save — Primary Admin Only)
  const contactForm = $('admin-contact-form');
  if (contactForm) {
    contactForm.addEventListener('input', () => {
      if (!state.isPrimaryAdmin) return;
      state.contactDirty = true;
      setContactPreviewBadge('pill-warning', 'Unsaved Draft Preview');
      renderContactPreview(readContactFormValues());
    });

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.isPrimaryAdmin) {
        showToast('Only the Primary Admin can edit boutique contact details.');
        return;
      }

      const draft = readContactFormValues();
      const check = validateContactPayload(draft);
      if (!check.valid) {
        showContactErrors(check.errors);
        setContactPreviewBadge('pill-danger', 'Fix Validation Errors');
        renderContactPreview(draft);
        return;
      }

      showContactErrors([]);
      const saveBtn = $('save-contact-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      try {
        const saved = await saveContactSettings(check.data);
        state.contactDirty = false;
        state.contactExists = true;
        state.savedContact = normalizeContactDoc(saved);
        setContactPreviewBadge('pill-success', 'Live Saved Contact');
        renderContactPreview(state.savedContact);
        showToast('Boutique contact details updated and synced to storefront.');
      } catch (err) {
        showContactErrors([mapFirestoreError(err)]);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = !state.isPrimaryAdmin;
          saveBtn.textContent = 'Save Contact Details';
        }
      }
    });
  }

  if ($('preview-contact-btn')) {
    $('preview-contact-btn').addEventListener('click', () => {
      const draft = readContactFormValues();
      const check = validateContactPayload(draft);
      renderContactPreview(draft);

      if (!check.valid) {
        showContactErrors(check.errors);
        setContactPreviewBadge('pill-warning', 'Draft Preview (Needs Fixes)');
      } else {
        showContactErrors([]);
        setContactPreviewBadge('pill-gold', 'Validated Preview — Ready to Save');
        showToast(
          state.isPrimaryAdmin
            ? 'Preview updated. Click Save Contact Details to publish live.'
            : 'Preview updated (read-only view).'
        );
      }

      const previewPanel = $('contact-preview-panel');
      if (previewPanel) {
        previewPanel.classList.remove('is-highlighted');
        void previewPanel.offsetWidth;
        previewPanel.classList.add('is-highlighted');
        previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  // Settings Category A secondary form: Inventory Alert Threshold (Primary Admin Only)
  if ($('admin-settings-form')) {
    $('admin-settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.isPrimaryAdmin) {
        showToast('Only the Primary Admin can edit store alert settings.');
        return;
      }
      const threshold = parseInt($('settings-low-stock-threshold')?.value, 10) || 5;
      const storeName = $('settings-store-name')?.value.trim() || 'Kaarigai Clothing for Women';
      try {
        await saveStoreSettings({ lowStockThreshold: threshold, storeName });
        showToast('Inventory threshold settings saved to Firestore.');
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
    });
  }

  // Settings Category B: Show/Hide Password Toggles
  document.querySelectorAll('[data-toggle-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-target');
      const input = $(targetId);
      if (!input) return;
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      btn.textContent = reveal ? 'Hide' : 'Show';
    });
  });

  // Settings Category B (A): Change Own Password Form
  const pwdForm = $('admin-change-password-form');
  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = $('security-pwd-error');
      const okBox = $('security-pwd-success');
      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = '';
      }
      if (okBox) {
        okBox.hidden = true;
        okBox.textContent = '';
      }

      const currentPassword = $('sec-current-password')?.value || '';
      const newPassword = $('sec-new-password')?.value || '';
      const confirmPassword = $('sec-confirm-password')?.value || '';

      const fail = (msg) => {
        if (errBox) {
          errBox.textContent = msg;
          errBox.hidden = false;
        }
      };

      if (!currentPassword) {
        fail('Please enter your current password.');
        $('sec-current-password')?.focus();
        return;
      }
      if (!newPassword) {
        fail('Please enter a new password.');
        $('sec-new-password')?.focus();
        return;
      }
      if (newPassword.length > 512) {
        fail('New password exceeds the maximum supported length (512 characters).');
        $('sec-new-password')?.focus();
        return;
      }
      if (newPassword !== confirmPassword) {
        fail('New password and confirmation password do not match.');
        $('sec-confirm-password')?.focus();
        return;
      }
      if (newPassword === currentPassword) {
        fail('New password must differ from your current password.');
        $('sec-new-password')?.focus();
        return;
      }

      const submitBtn = $('sec-save-password-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating Password...';
      }

      try {
        const res = await runSelfSessionCredentialUpdate(() =>
          changeAdminPassword({
            currentPassword,
            newPassword,
            confirmPassword
          })
        );

        pwdForm.reset();
        resetPasswordFieldsInContainer(pwdForm);

        state.mustChangePassword = false;
        state.passwordJustChanged = true;
        state.profileUpdatedAtMs = Date.now();
        state.securityMeta.exists = true;
        state.securityMeta.mustChangePassword = false;
        state.securityMeta.passwordUpdatedAtMs = Date.now();
        renderSecurityBannerAndStatus();

        if (okBox) {
          okBox.textContent = (res && res.message) || 'Password Updated Successfully';
          okBox.hidden = false;
        }
        showToast('Password Updated Successfully');
      } catch (err) {
        fail((err && err.message) || 'Unable to update admin password.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Save Password';
        }
      }
    });
  }

  // Settings Category B (B): Admin Members — Add Member Form (Primary Admin Only)
  const openAddMemberBtn = $('open-add-member-btn');
  const cancelAddMemberBtn = $('cancel-add-member-btn');
  const addMemberPanel = $('add-member-panel');
  const addMemberForm = $('add-member-form');

  const clearMemberBanners = () => {
    const errB = $('members-error-banner');
    const okB = $('members-success-banner');
    if (errB) {
      errB.hidden = true;
      errB.textContent = '';
    }
    if (okB) {
      okB.hidden = true;
      okB.textContent = '';
    }
  };

  if (openAddMemberBtn && addMemberPanel) {
    openAddMemberBtn.addEventListener('click', () => {
      if (!state.isPrimaryAdmin) return;
      clearMemberBanners();
      const formErr = $('add-member-form-error');
      if (formErr) {
        formErr.hidden = true;
        formErr.textContent = '';
      }
      addMemberPanel.hidden = false;
      $('add-member-name')?.focus();
    });
  }

  if (cancelAddMemberBtn && addMemberPanel && addMemberForm) {
    cancelAddMemberBtn.addEventListener('click', () => {
      addMemberPanel.hidden = true;
      addMemberForm.reset();
      resetPasswordFieldsInContainer(addMemberForm);
      const formErr = $('add-member-form-error');
      if (formErr) {
        formErr.hidden = true;
        formErr.textContent = '';
      }
    });
  }

  if (addMemberForm) {
    addMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.isPrimaryAdmin) {
        showToast('Only the Primary Admin can add administrator accounts.');
        return;
      }

      clearMemberBanners();
      const formErr = $('add-member-form-error');
      const okBanner = $('members-success-banner');
      if (formErr) {
        formErr.hidden = true;
        formErr.textContent = '';
      }

      const username = $('add-member-name')?.value.trim() || '';
      const password = $('add-member-password')?.value || '';
      const confirmPassword = $('add-member-confirm')?.value || '';

      const failAdd = (msg) => {
        if (formErr) {
          formErr.textContent = msg;
          formErr.hidden = false;
        }
      };

      if (!username || username.length < 2) {
        failAdd('Admin Name must be at least 2 characters long.');
        $('add-member-name')?.focus();
        return;
      }
      if (/@/.test(username)) {
        failAdd('Enter an Admin Name rather than an email address.');
        $('add-member-name')?.focus();
        return;
      }
      if (!password) {
        failAdd('Please enter a password for the new member.');
        $('add-member-password')?.focus();
        return;
      }
      if (password !== confirmPassword) {
        failAdd('Password and confirmation password do not match.');
        $('add-member-confirm')?.focus();
        return;
      }

      const submitBtn = $('add-member-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Member...';
      }

      try {
        const res = await createAdminMember({ username, password, confirmPassword });
        addMemberForm.reset();
        resetPasswordFieldsInContainer(addMemberForm);
        if (addMemberPanel) addMemberPanel.hidden = true;

        if (Array.isArray(res.members)) {
          state.adminMembers = res.members;
          state.membersLoaded = true;
          renderAdminMembersSection();
        }
        const msg = (res && res.message) || `Admin member "${username}" created successfully.`;
        if (okBanner) {
          okBanner.textContent = msg;
          okBanner.hidden = false;
        }
        showToast(msg);
      } catch (err) {
        failAdd((err && err.message) || 'Unable to create admin member.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Member';
        }
      }
    });
  }

  // Edit Member Name Modal
  document.querySelectorAll('[data-close-member-rename]').forEach((el) => {
    el.addEventListener('click', closeMemberRenameModal);
  });

  const editNameForm = $('edit-member-name-form');
  if (editNameForm) {
    editNameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.isPrimaryAdmin || !state.editingMemberUid) return;

      const errBox = $('edit-member-name-error');
      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = '';
      }

      const targetUid = state.editingMemberUid;
      const newName = $('edit-member-name-input')?.value.trim() || '';
      const failRename = (msg) => {
        if (errBox) {
          errBox.textContent = msg;
          errBox.hidden = false;
        }
      };

      if (!newName || newName.length < 2) {
        failRename('Admin Name must be at least 2 characters long.');
        $('edit-member-name-input')?.focus();
        return;
      }
      if (/@/.test(newName)) {
        failRename('Enter an Admin Name rather than an email address.');
        $('edit-member-name-input')?.focus();
        return;
      }

      const saveBtn = $('edit-member-name-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
      }

      const isSelf = state.user && targetUid === state.user.uid;
      try {
        const runRename = () => updateAdminMemberName({ targetUid, newName });
        const res = isSelf ? await runSelfSessionCredentialUpdate(runRename) : await runRename();
        if (Array.isArray(res.members)) {
          state.adminMembers = res.members;
          state.membersLoaded = true;
          renderAdminMembersSection();
        }
        if (isSelf) {
          state.username = newName;
          updateIdentityDisplays();
        }
        closeMemberRenameModal();
        const okBanner = $('members-success-banner');
        const msg = (res && res.message) || `Administrator name updated to "${newName}".`;
        if (okBanner) {
          okBanner.textContent = msg;
          okBanner.hidden = false;
        }
        showToast(msg);
      } catch (err) {
        failRename((err && err.message) || 'Unable to update administrator name.');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Name';
        }
      }
    });
  }

  // Change Member Password Modal
  document.querySelectorAll('[data-close-member-password]').forEach((el) => {
    el.addEventListener('click', closeMemberPasswordModal);
  });

  const editMemberPwdForm = $('edit-member-pwd-form');
  if (editMemberPwdForm) {
    editMemberPwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.isPrimaryAdmin || !state.editingMemberUid) return;

      const errBox = $('edit-member-pwd-error');
      if (errBox) {
        errBox.hidden = true;
        errBox.textContent = '';
      }

      const targetUid = state.editingMemberUid;
      const newPassword = $('edit-member-pwd-input')?.value || '';
      const confirmPassword = $('edit-member-pwd-confirm-input')?.value || '';
      const failPwd = (msg) => {
        if (errBox) {
          errBox.textContent = msg;
          errBox.hidden = false;
        }
      };

      if (!newPassword) {
        failPwd('Please enter a new password.');
        $('edit-member-pwd-input')?.focus();
        return;
      }
      if (newPassword !== confirmPassword) {
        failPwd('New password and confirmation password do not match.');
        $('edit-member-pwd-confirm-input')?.focus();
        return;
      }

      const saveBtn = $('edit-member-pwd-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Updating...';
      }

      const isSelf = state.user && targetUid === state.user.uid;
      try {
        const runPwdUpdate = () =>
          changeAdminMemberPassword({
            targetUid,
            newPassword,
            confirmPassword
          });
        const res = isSelf ? await runSelfSessionCredentialUpdate(runPwdUpdate) : await runPwdUpdate();
        if (Array.isArray(res.members)) {
          state.adminMembers = res.members;
          state.membersLoaded = true;
          renderAdminMembersSection();
        }
        closeMemberPasswordModal();
        const okBanner = $('members-success-banner');
        const msg = (res && res.message) || 'Administrator password updated successfully.';
        if (okBanner) {
          okBanner.textContent = msg;
          okBanner.hidden = false;
        }
        showToast(msg);
      } catch (err) {
        failPwd((err && err.message) || 'Unable to update member password.');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Update Password';
        }
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('member-rename-modal') && !$('member-rename-modal').hidden) {
      closeMemberRenameModal();
    } else if ($('member-password-modal') && !$('member-password-modal').hidden) {
      closeMemberPasswordModal();
    } else if ($('admin-confirm-modal') && !$('admin-confirm-modal').hidden) {
      closeConfirmModal(false);
    }
  });

  if ($('copy-rules-btn')) {
    $('copy-rules-btn').addEventListener('click', async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(FIRESTORE_RULES_SNIPPET);
        showToast('Firestore security rules copied to clipboard.');
      }
    });
  }

  // Inventory inline numeric edits
  if ($('inventory-table-wrap')) {
    $('inventory-table-wrap').addEventListener('input', (e) => {
      const input = e.target.closest('[data-inv-stock-input]');
      if (!input) return;
      const rowId = input.getAttribute('data-inv-stock-input');
      const productId = input.getAttribute('data-prod-id');
      const colorIndex = parseInt(input.getAttribute('data-col-idx'), 10);
      const size = input.getAttribute('data-size');
      const origStock = parseInt(input.getAttribute('data-orig-stock'), 10) || 0;
      const nextStock = Math.max(0, parseInt(input.value, 10) || 0);

      if (nextStock !== origStock) {
        state.dirtyInventory[rowId] = { productId, colorIndex, size, nextStock, origStock };
      } else {
        delete state.dirtyInventory[rowId];
      }

      const rowEl = input.closest('tr');
      const saveRowBtn = rowEl?.querySelector(`[data-inv-save-row="${rowId}"]`);
      const pill = rowEl?.querySelector(`[data-inv-status-pill="${rowId}"]`);
      const nextStatus = getStockStatus(nextStock, state.settings.lowStockThreshold || DEFAULT_LOW_STOCK_THRESHOLD);

      if (rowEl) rowEl.classList.toggle('is-row-dirty', Boolean(state.dirtyInventory[rowId]));
      if (saveRowBtn) {
        saveRowBtn.disabled = !state.dirtyInventory[rowId];
        saveRowBtn.className = `admin-btn ${state.dirtyInventory[rowId] ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-xs`;
      }
      if (pill) {
        pill.textContent = nextStatus;
        pill.className = `admin-pill ${stockBadgeClass(nextStatus)}`;
      }

      const dirtyCount = Object.keys(state.dirtyInventory).length;
      const saveAllBtn = $('inventory-save-dirty-btn');
      if (saveAllBtn) {
        saveAllBtn.hidden = dirtyCount === 0;
        saveAllBtn.textContent = `Save All Changes (${dirtyCount})`;
      }
    });
  }

  // Delegated actions across Dashboard, Products, Categories, Inventory & Admin Members
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'empty-add-product-btn') {
      switchView('add-product', { resetForm: true });
      return;
    }

    if (btn.hasAttribute('data-edit-member-name')) {
      if (!state.isPrimaryAdmin) return;
      const uid = btn.getAttribute('data-edit-member-name');
      const member = state.adminMembers.find((m) => m.uid === uid);
      if (member) {
        clearMemberBanners();
        openMemberRenameModal(member);
      }
      return;
    }

    if (btn.hasAttribute('data-change-member-pwd')) {
      if (!state.isPrimaryAdmin) return;
      const uid = btn.getAttribute('data-change-member-pwd');
      const member = state.adminMembers.find((m) => m.uid === uid);
      if (member) {
        clearMemberBanners();
        openMemberPasswordModal(member);
      }
      return;
    }

    if (btn.hasAttribute('data-delete-member')) {
      if (!state.isPrimaryAdmin || btn.disabled) return;
      const uid = btn.getAttribute('data-delete-member');
      const member = state.adminMembers.find((m) => m.uid === uid);
      if (!member) return;

      clearMemberBanners();
      const confirmed = await openConfirmModal({
        title: `Delete Admin "${member.username}"?`,
        message: `Remove "${member.username}" from Firebase Authentication and Cloud Firestore? Their active sessions will be revoked immediately and they will no longer be able to sign in.`,
        confirmLabel: 'Delete Member',
        danger: true
      });
      if (!confirmed) return;

      try {
        const res = await deleteAdminMember(uid);
        if (Array.isArray(res.members)) {
          state.adminMembers = res.members;
          state.membersLoaded = true;
          renderAdminMembersSection();
        }
        const okBanner = $('members-success-banner');
        const msg = (res && res.message) || `Administrator "${member.username}" deleted.`;
        if (okBanner) {
          okBanner.textContent = msg;
          okBanner.hidden = false;
        }
        showToast(msg);
      } catch (err) {
        const errBanner = $('members-error-banner');
        const errMsg = (err && err.message) || 'Unable to delete admin member.';
        if (errBanner) {
          errBanner.textContent = errMsg;
          errBanner.hidden = false;
        }
        showToast(errMsg);
      }
      return;
    }

    if (btn.hasAttribute('data-edit-product')) {
      const pid = btn.getAttribute('data-edit-product');
      const product = state.products.find((p) => p.id === pid);
      if (product && productFormCtrl) {
        productFormCtrl.loadForEdit(product);
        switchView('add-product', { resetForm: false });
      }
      return;
    }

    if (btn.hasAttribute('data-restock-product')) {
      const pid = btn.getAttribute('data-restock-product');
      state.inventoryFilters.productId = pid;
      if ($('inv-filter-product')) $('inv-filter-product').value = pid;
      switchView('inventory');
      return;
    }

    if (btn.hasAttribute('data-toggle-active')) {
      const pid = btn.getAttribute('data-toggle-active');
      const product = state.products.find((p) => p.id === pid);
      if (!product) return;
      try {
        await setProductActive(pid, !product.isActive);
        showToast(`"${product.name}" is now ${product.isActive ? 'hidden (Inactive)' : 'visible (Active)'} on storefront.`);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
      return;
    }

    if (btn.hasAttribute('data-delete-product')) {
      if (!state.isPrimaryAdmin) {
        showToast('Only an Admin account can permanently delete products.');
        return;
      }
      const pid = btn.getAttribute('data-delete-product');
      const product = state.products.find((p) => p.id === pid);
      if (!product) return;
      const confirmed = await openConfirmModal({
        title: 'Delete Product?',
        message: `Are you sure you want to permanently delete "${product.name}" (SKU: ${product.sku}) and all of its color variants & inventory records from Firestore?`,
        confirmLabel: 'Delete Product',
        danger: true
      });
      if (!confirmed) return;
      try {
        await deleteProduct(pid);
        showToast(`"${product.name}" permanently deleted.`);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
      return;
    }

    if (btn.hasAttribute('data-inv-save-row')) {
      const rowId = btn.getAttribute('data-inv-save-row');
      try {
        await commitDirtyInventoryRows(rowId);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
      return;
    }

    if (btn.hasAttribute('data-start-rename-cat')) {
      state.renamingCategoryId = btn.getAttribute('data-start-rename-cat');
      renderCategoriesView();
      return;
    }

    if (btn.hasAttribute('data-cancel-rename-cat')) {
      state.renamingCategoryId = null;
      renderCategoriesView();
      return;
    }

    if (btn.hasAttribute('data-save-rename-cat')) {
      const cid = btn.getAttribute('data-save-rename-cat');
      const catDoc = state.categories.find((c) => c.id === cid);
      const input = $(`rename-cat-input-${cid}`);
      if (!catDoc || !input) return;
      try {
        await renameCategoryAndProducts(catDoc, input.value.trim(), state.products);
        state.renamingCategoryId = null;
        showToast(`Category renamed to "${input.value.trim()}".`);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
      return;
    }

    if (btn.hasAttribute('data-delete-cat')) {
      if (!state.isPrimaryAdmin) {
        showToast('Only an Admin account can permanently delete categories.');
        return;
      }
      const cid = btn.getAttribute('data-delete-cat');
      const catDoc = state.categories.find((c) => c.id === cid);
      if (!catDoc) return;
      const linkedCount = state.products.filter((p) => p.category === catDoc.name).length;
      const confirmed = await openConfirmModal({
        title: `Delete Category "${catDoc.name}"?`,
        message: linkedCount
          ? `${linkedCount} product(s) currently use "${catDoc.name}". Deleting this category removes it from the category list, though existing products keep their category label until edited.`
          : `Remove "${catDoc.name}" from Firestore categories?`,
        confirmLabel: 'Delete Category',
        danger: true
      });
      if (!confirmed) return;
      try {
        await deleteCategory(cid);
        showToast(`Category "${catDoc.name}" deleted.`);
      } catch (err) {
        showToast(mapFirestoreError(err));
      }
    }
  });
}

async function init() {
  const projInfo = getFirebaseProjectInfo();
  if ($('settings-project-id')) $('settings-project-id').textContent = projInfo.projectId;
  if ($('settings-auth-domain')) $('settings-auth-domain').textContent = projInfo.authDomain;
  if ($('settings-rules-pre')) $('settings-rules-pre').textContent = FIRESTORE_RULES_SNIPPET;

  await ensureSessionPersistence();

  productFormCtrl = new ProductFormController({
    getProducts: () => state.products,
    getCategories: () => state.categories,
    showToast,
    onSaved: () => {
      productFormCtrl.resetForCreate();
      switchView('products');
    },
    onCancel: () => {
      switchView('products');
    }
  });

  bindEvents();
  observeAdminAuth(renderAuthScreens);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
