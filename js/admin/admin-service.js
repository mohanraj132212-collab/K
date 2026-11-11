/**
 * KAARIGAI – Admin Firebase Auth & Firestore Service
 * ---------------------------------------------------------------------------
 * Handles secure Firebase Auth authentication, admin authorization lookup,
 * real-time Firestore listeners, CRUD mutations for products/categories/settings,
 * and dynamic dashboard/inventory aggregations.
 */

import {
  auth,
  db,
  firebaseConfig,
  ADMIN_ROLES,
  DEFAULT_CATEGORIES,
  DEFAULT_LOW_STOCK_THRESHOLD,
  isFullAdminRole,
  isValidAdminDashboardRole,
  slugifyCategory,
  getStockStatus,
  normalizeProductDoc,
  normalizeContactDoc,
  validateContactPayload,
  getAdminAuthEndpoints,
  toMillis
} from '../firebase-config.js';

import {
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signInWithCustomToken,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

export function getFirebaseProjectInfo() {
  return {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  };
}

export function mapAuthError(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled in Firebase Authentication.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please verify your Firebase admin credentials.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please wait a few minutes before trying again.';
    case 'auth/network-request-failed':
      return 'Network error communicating with Firebase Authentication. Check your connection.';
    default:
      return (err && err.message) || 'Unable to sign in right now.';
  }
}

export function mapFirestoreError(err) {
  const code = err && err.code ? err.code : '';
  if (code === 'permission-denied') {
    return 'Firestore permission denied. Verify that your adminUsers/{uid} profile is active and updated firestore.rules are published in Firebase Console.';
  }
  if (code === 'unavailable') {
    return 'Cloud Firestore is temporarily unreachable. Check your internet connection.';
  }
  return (err && err.message) || 'A Firestore operation error occurred.';
}

/**
 * Verifies whether the signed-in Firebase user holds active admin privileges via:
 *   1. Firebase custom claims (`claims.admin === true`, `claims.role`, `claims.sessionVersion`), AND
 *   2. Firestore `adminUsers/{uid}` profile with `isActive === true` & matching `sessionVersion`
 */
export async function ensureSessionPersistence() {
  try {
    if (typeof setPersistence === 'function' && browserSessionPersistence) {
      await setPersistence(auth, browserSessionPersistence);
    }
  } catch (_err) {
    // Fallback cleanly if persistence API is unavailable in test environment
  }
}

export async function verifyAdminAccess(user) {
  if (!user) {
    return {
      isAdmin: false,
      role: null,
      username: '',
      isPrimaryAdmin: false,
      mustChangePassword: false,
      sessionVersion: 0,
      method: null,
      error: null
    };
  }

  let claims = {};
  let hasAdminClaim = false;
  let claimRole = '';
  let mustChangePassword = false;
  let tokenSessionVersion = null;

  try {
    const tokenResult = await user.getIdTokenResult();
    claims = (tokenResult && tokenResult.claims) || {};
    hasAdminClaim = claims.admin === true;
    claimRole = String(claims.role || '');
    mustChangePassword = Boolean(claims.mustChangePassword);
    if (typeof claims.sessionVersion === 'number') {
      tokenSessionVersion = claims.sessionVersion;
    }
  } catch (tokenErr) {
    const code = tokenErr && tokenErr.code ? tokenErr.code : '';
    if (code === 'auth/user-token-expired' || code === 'auth/id-token-revoked') {
      return {
        isAdmin: false,
        role: null,
        username: '',
        isPrimaryAdmin: false,
        mustChangePassword: false,
        sessionVersion: 0,
        sessionInvalidated: true,
        method: null,
        error: 'Your admin session was invalidated. Please sign in again.'
      };
    }
  }

  if (!hasAdminClaim || !isValidAdminDashboardRole(claimRole)) {
    return {
      isAdmin: false,
      role: null,
      username: '',
      isPrimaryAdmin: false,
      mustChangePassword: false,
      sessionVersion: 0,
      method: null,
      error: 'Administrator or Worker privileges are not assigned to this session.'
    };
  }

  try {
    const profileRef = doc(db, 'adminUsers', user.uid);
    const snap = await getDoc(profileRef);

    if (!snap.exists()) {
      return {
        isAdmin: false,
        role: null,
        username: '',
        isPrimaryAdmin: false,
        mustChangePassword: false,
        sessionVersion: 0,
        sessionInvalidated: true,
        method: null,
        error: 'This user account no longer exists.'
      };
    }

    const data = snap.data() || {};
    if (data.isActive !== true || !isValidAdminDashboardRole(data.role)) {
      return {
        isAdmin: false,
        role: null,
        username: String(data.username || claims.username || ''),
        isPrimaryAdmin: false,
        mustChangePassword: false,
        sessionVersion: 0,
        method: null,
        error: 'Dashboard access has been disabled or unassigned for this account.'
      };
    }

    if (
      typeof data.sessionVersion === 'number' &&
      tokenSessionVersion !== null &&
      data.sessionVersion !== tokenSessionVersion
    ) {
      return {
        isAdmin: false,
        role: null,
        username: String(data.username || claims.username || ''),
        isPrimaryAdmin: false,
        mustChangePassword: false,
        sessionVersion: 0,
        sessionInvalidated: true,
        method: null,
        error: 'Your previous session was invalidated after a password update. Please sign in again.'
      };
    }

    const isPrimaryAdmin = isFullAdminRole(claimRole) && isFullAdminRole(data.role);
    const role = isPrimaryAdmin
      ? data.role === ADMIN_ROLES.ADMIN
        ? ADMIN_ROLES.ADMIN
        : ADMIN_ROLES.PRIMARY_ADMIN
      : data.role === ADMIN_ROLES.WORKERS
      ? ADMIN_ROLES.WORKERS
      : ADMIN_ROLES.ADMIN_MEMBER;
    const username = String(data.username || claims.username || user.displayName || 'Admin').trim();

    return {
      isAdmin: true,
      role,
      username,
      isPrimaryAdmin,
      mustChangePassword,
      sessionVersion: Number(data.sessionVersion || tokenSessionVersion || 1),
      method: 'Firebase Authentication + Custom Role Claims',
      error: null
    };
  } catch (err) {
    return {
      isAdmin: false,
      role: null,
      username: '',
      isPrimaryAdmin: false,
      mustChangePassword: false,
      sessionVersion: 0,
      method: null,
      error: mapFirestoreError(err)
    };
  }
}

export function subscribeAdminSessionValidity(uid, onInvalidated, onProfileUpdate) {
  if (!uid) return () => {};
  const profileRef = doc(db, 'adminUsers', uid);
  return onSnapshot(
    profileRef,
    async (snap) => {
      if (!snap.exists()) {
        onInvalidated('deleted');
        return;
      }
      const data = snap.data() || {};
      if (data.isActive !== true) {
        onInvalidated('disabled');
        return;
      }
      if (typeof data.sessionVersion === 'number') {
        try {
          const user = auth.currentUser;
          if (!user) return;
          const tokenResult = await user.getIdTokenResult();
          const tokVer = tokenResult?.claims?.sessionVersion;
          if (typeof tokVer === 'number' && data.sessionVersion > tokVer) {
            onInvalidated('session_expired');
            return;
          }
        } catch (_err) {
          // ignore transient token read issues
        }
      }
      if (typeof onProfileUpdate === 'function') {
        onProfileUpdate({
          username: String(data.username || '').trim(),
          role: isValidAdminDashboardRole(data.role) ? data.role : ADMIN_ROLES.WORKERS,
          updatedAtMs: toMillis(data.updatedAt)
        });
      }
    },
    () => {
      // ignore permission errors on listener teardown
    }
  );
}

export function observeAdminAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({
        status: 'signed-out',
        user: null,
        isAdmin: false,
        role: null,
        username: '',
        isPrimaryAdmin: false,
        mustChangePassword: false,
        authMethod: null,
        error: null
      });
      return;
    }

    const access = await verifyAdminAccess(user);
    callback({
      status: access.isAdmin ? 'authorized' : 'unauthorized',
      user,
      isAdmin: access.isAdmin,
      role: access.role,
      username: access.username,
      isPrimaryAdmin: Boolean(access.isPrimaryAdmin),
      mustChangePassword: Boolean(access.mustChangePassword),
      sessionInvalidated: Boolean(access.sessionInvalidated),
      authMethod: access.method,
      error: access.error
    });
  });
}

export async function signInAdminWithCredentials(username, password) {
  const cleanName = String(username || '').trim();
  const pwd = String(password || '');
  if (!cleanName) {
    throw new Error('Please enter your username.');
  }
  if (!pwd) {
    throw new Error('Please enter your password.');
  }

  const { loginUrl } = getAdminAuthEndpoints();
  let response;
  try {
    response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanName, password: pwd })
    });
  } catch (_networkErr) {
    throw new Error(
      'Unable to reach server authentication service. Ensure Cloud Functions are deployed and your internet connection is active.'
    );
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_jsonErr) {
    data = {};
  }

  if (!response.ok || !data.ok || !data.customToken) {
    throw new Error(data.error || 'Invalid username or password. Please try again.');
  }

  await ensureSessionPersistence();
  const cred = await signInWithCustomToken(auth, data.customToken);
  return {
    user: cred.user,
    username: data.username || cleanName,
    role: data.role || ADMIN_ROLES.WORKERS,
    mustChangePassword: Boolean(data.mustChangePassword)
  };
}

export async function changeAdminPassword({ currentPassword, newPassword, confirmPassword }) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Your admin session has expired. Please sign in again.');
  }

  const idToken = await user.getIdToken(true);
  const { changePasswordUrl } = getAdminAuthEndpoints();

  let response;
  try {
    response = await fetch(changePasswordUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
  } catch (_networkErr) {
    throw new Error('Unable to reach server security endpoint to update the password.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_jsonErr) {
    data = {};
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Unable to update admin password.');
  }

  if (data.customToken) {
    await ensureSessionPersistence();
    await signInWithCustomToken(auth, data.customToken);
  }

  return data;
}

async function callAdminMembersApi(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Your admin session has expired. Please sign in again.');
  }

  const idToken = await user.getIdToken(true);
  const { membersUrl } = getAdminAuthEndpoints();

  let response;
  try {
    response = await fetch(membersUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ action, ...payload })
    });
  } catch (_networkErr) {
    throw new Error('Unable to reach administrator management Cloud Function endpoint.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_jsonErr) {
    data = {};
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Administrator operation failed.');
  }

  if (data.customToken) {
    await ensureSessionPersistence();
    await signInWithCustomToken(auth, data.customToken);
  }

  return data;
}

export async function createUserAccount({ username, password, role }) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Authorized Admin session required to create accounts.');
  }

  const idToken = await user.getIdToken(true);
  const { createUserUrl } = getAdminAuthEndpoints();

  let response;
  try {
    response = await fetch(createUserUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ username, password, role })
    });
  } catch (_networkErr) {
    throw new Error(
      'Unable to reach server user creation service. Ensure Cloud Functions are deployed and your internet connection is active.'
    );
  }

  let data = {};
  try {
    data = await response.json();
  } catch (_jsonErr) {
    data = {};
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Failed to create user account.');
  }

  return data;
}

export async function listAdminMembers() {
  const res = await callAdminMembersApi('list');
  return Array.isArray(res.members) ? res.members : [];
}

export async function createAdminMember({ username, password, confirmPassword }) {
  return callAdminMembersApi('create', { username, password, confirmPassword });
}

export async function updateAdminMemberName({ targetUid, newName }) {
  return callAdminMembersApi('updateName', { targetUid, newName });
}

export async function changeAdminMemberPassword({ targetUid, newPassword, confirmPassword }) {
  return callAdminMembersApi('changePassword', { targetUid, newPassword, confirmPassword });
}

export async function deleteAdminMember(targetUid) {
  return callAdminMembersApi('delete', { targetUid });
}

export function subscribeAdminUsersList(onData, onError) {
  const colRef = collection(db, 'adminUsers');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const d = docSnap.data() || {};
        const createdAtMs = toMillis(d.createdAt) || Number(d.createdAtMs || 0);
        const updatedAtMs = toMillis(d.updatedAt) || Number(d.updatedAtMs || createdAtMs);
        return {
          uid: String(d.uid || docSnap.id),
          username: String(d.username || 'Admin'),
          role: isValidAdminDashboardRole(d.role) ? d.role : ADMIN_ROLES.WORKERS,
          isActive: d.isActive !== false,
          createdAtMs,
          updatedAtMs
        };
      });
      list.sort((a, b) => {
        const aFull = isFullAdminRole(a.role);
        const bFull = isFullAdminRole(b.role);
        if (aFull !== bFull) {
          return aFull ? -1 : 1;
        }
        return (a.createdAtMs || 0) - (b.createdAtMs || 0);
      });
      onData(list);
    },
    (err) => {
      if (onError) onError(mapFirestoreError(err));
    }
  );
}

export async function signOutAdmin() {
  await signOut(auth);
}

/**
 * Real-time subscriptions
 */
export function subscribeAllProducts(onData, onError, getThresholdFn) {
  const productsCol = collection(db, 'products');
  return onSnapshot(
    productsCol,
    (snapshot) => {
      const threshold = typeof getThresholdFn === 'function' ? getThresholdFn() : DEFAULT_LOW_STOCK_THRESHOLD;
      const list = snapshot.docs.map((docSnap) =>
        normalizeProductDoc(docSnap.id, docSnap.data(), threshold)
      );
      list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      onData(list);
    },
    (err) => {
      if (onError) onError(mapFirestoreError(err));
    }
  );
}

export function subscribeCategories(onData, onError) {
  const categoriesCol = collection(db, 'categories');
  return onSnapshot(
    categoriesCol,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        return {
          id: docSnap.id,
          name: String(data.name || docSnap.id).trim(),
          slug: String(data.slug || docSnap.id).trim(),
          description: String(data.description || '').trim(),
          createdAt: data.createdAt || null
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      onData(list);
    },
    (err) => {
      if (onError) onError(mapFirestoreError(err));
    }
  );
}

export function subscribeStoreSettings(onData, onError) {
  const settingsRef = doc(db, 'settings', 'store');
  return onSnapshot(
    settingsRef,
    (snap) => {
      const data = snap.exists() ? snap.data() || {} : {};
      const parsedThreshold = parseInt(data.lowStockThreshold, 10);
      const lowStockThreshold =
        Number.isFinite(parsedThreshold) && parsedThreshold >= 1
          ? parsedThreshold
          : DEFAULT_LOW_STOCK_THRESHOLD;

      onData({
        lowStockThreshold,
        storeName: String(data.storeName || 'Kaarigai Clothing for Women'),
        currency: 'INR',
        updatedAt: data.updatedAt || null
      });
    },
    (err) => {
      if (onError) onError(mapFirestoreError(err));
    }
  );
}

export function subscribeContactSettings(onData, onError) {
  const contactRef = doc(db, 'settings', 'contact');
  return onSnapshot(
    contactRef,
    (snap) => {
      const normalized = snap.exists() ? normalizeContactDoc(snap.data()) : normalizeContactDoc(null);
      onData({
        exists: snap.exists(),
        contact: normalized
      });
    },
    (err) => {
      if (onError) onError(mapFirestoreError(err));
    }
  );
}

export function subscribeSecurityMeta(onData) {
  const securityRef = doc(db, 'settings', 'security');
  return onSnapshot(
    securityRef,
    (snap) => {
      const data = snap.exists() ? snap.data() || {} : {};
      onData({
        exists: snap.exists(),
        mustChangePassword: Boolean(data.mustChangePassword),
        passwordUpdatedAtMs: toMillis(data.passwordUpdatedAt) || Number(data.passwordUpdatedAtMs || 0)
      });
    },
    () => {
      // Security meta doc is optional prior to Cloud Function bootstrap
    }
  );
}

/**
 * Product Validation & Firestore Schema Serialization
 */
export function isSkuUnique(sku, products, excludeProductId = '') {
  const normalized = String(sku || '').trim().toLowerCase();
  if (!normalized) return false;
  return !products.some(
    (p) => p.id !== excludeProductId && String(p.sku || '').trim().toLowerCase() === normalized
  );
}

export function serializeProductPayload(productId, formValues) {
  const cleanColors = (formValues.colors || []).map((col) => ({
    colorName: String(col.colorName || '').trim(),
    colorCode: String(col.colorCode || '#C6A66B').trim(),
    sizes: (col.sizes || []).map((sz) => ({
      size: String(sz.size || '').trim(),
      stock: Math.max(0, parseInt(sz.stock, 10) || 0)
    })),
    images: (col.images || []).map((url) => String(url || '').trim()).filter(Boolean)
  }));

  const firstColor = cleanColors[0] || { colorName: '', images: [] };
  const defaultColor = firstColor.colorName;
  const defaultImage = firstColor.images[0] || '';

  return {
    productId,
    name: String(formValues.name || '').trim(),
    price: Math.max(0, Number(formValues.price) || 0),
    description: String(formValues.description || '').trim(),
    category: String(formValues.category || '').trim(),
    sku: String(formValues.sku || '').trim(),
    fabric: String(formValues.fabric || '').trim(),
    care: String(formValues.care || '').trim(),
    defaultColor,
    defaultImage,
    colors: cleanColors,
    isActive: formValues.isActive !== false
  };
}

export async function createProduct(formValues, existingProducts = []) {
  const sku = String(formValues.sku || '').trim();
  if (!isSkuUnique(sku, existingProducts)) {
    throw new Error(`SKU "${sku}" is already assigned to another product.`);
  }

  const productRef = doc(collection(db, 'products'));
  const payload = serializeProductPayload(productRef.id, formValues);
  payload.createdAt = serverTimestamp();
  payload.updatedAt = serverTimestamp();

  await setDoc(productRef, payload);
  return productRef.id;
}

export async function updateProduct(productId, formValues, existingProducts = []) {
  if (!productId) throw new Error('Missing product ID for update.');
  const sku = String(formValues.sku || '').trim();
  if (!isSkuUnique(sku, existingProducts, productId)) {
    throw new Error(`SKU "${sku}" is already assigned to another product.`);
  }

  const productRef = doc(db, 'products', productId);
  const payload = serializeProductPayload(productId, formValues);
  payload.updatedAt = serverTimestamp();

  await updateDoc(productRef, payload);
  return productId;
}

export async function setProductActive(productId, isActive) {
  const productRef = doc(db, 'products', productId);
  await updateDoc(productRef, {
    isActive: Boolean(isActive),
    updatedAt: serverTimestamp()
  });
}

export async function deleteProduct(productId) {
  const productRef = doc(db, 'products', productId);
  await deleteDoc(productRef);
}

/**
 * Updates individual size stock quantities for an existing product from Inventory View.
 * `updates`: Array of `{ colorIndex, size, stock }`
 */
export async function updateProductVariantStocks(product, updates) {
  if (!product || !product.id) throw new Error('Invalid product reference.');

  const clonedColors = product.colors.map((c) => ({
    colorName: c.colorName,
    colorCode: c.colorCode,
    sizes: c.sizes.map((s) => ({ size: s.size, stock: s.stock })),
    images: c.images.slice()
  }));

  updates.forEach((u) => {
    const col = clonedColors[u.colorIndex];
    if (!col) return;
    const szObj = col.sizes.find((s) => s.size === u.size);
    if (szObj) {
      szObj.stock = Math.max(0, parseInt(u.stock, 10) || 0);
    }
  });

  const productRef = doc(db, 'products', product.id);
  await updateDoc(productRef, {
    colors: clonedColors,
    updatedAt: serverTimestamp()
  });
}

/**
 * Category Management
 */
export async function saveCategory(name, description = '', existingCategories = []) {
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) {
    throw new Error('Category name must be at least 2 characters.');
  }

  const dup = existingCategories.find(
    (c) => c.name.toLowerCase() === cleanName.toLowerCase()
  );
  if (dup) {
    return dup;
  }

  const slug = slugifyCategory(cleanName);
  const catRef = doc(db, 'categories', slug);
  await setDoc(catRef, {
    name: cleanName,
    slug,
    description: String(description || '').trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: slug, name: cleanName, slug, description: String(description || '').trim() };
}

export async function seedDefaultCategories(existingCategories = []) {
  const existingSet = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  const missing = DEFAULT_CATEGORIES.filter((name) => !existingSet.has(name.toLowerCase()));
  if (!missing.length) return 0;

  const batch = writeBatch(db);
  missing.forEach((name) => {
    const slug = slugifyCategory(name);
    const ref = doc(db, 'categories', slug);
    batch.set(ref, {
      name,
      slug,
      description: 'Curated KAARIGAI collection category',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
  return missing.length;
}

export async function renameCategoryAndProducts(categoryDoc, nextName, allProducts = []) {
  const cleanNext = String(nextName || '').trim();
  if (cleanNext.length < 2) {
    throw new Error('New category name must be at least 2 characters.');
  }

  const oldName = categoryDoc.name;
  const batch = writeBatch(db);
  const catRef = doc(db, 'categories', categoryDoc.id);
  batch.set(
    catRef,
    {
      name: cleanNext,
      slug: categoryDoc.slug || categoryDoc.id,
      description: categoryDoc.description || '',
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  allProducts.forEach((prod) => {
    if (prod.category === oldName) {
      const pRef = doc(db, 'products', prod.id);
      batch.update(pRef, {
        category: cleanNext,
        updatedAt: serverTimestamp()
      });
    }
  });

  await batch.commit();
}

export async function deleteCategory(categoryId) {
  await deleteDoc(doc(db, 'categories', categoryId));
}

export async function saveStoreSettings(settingsPayload) {
  const threshold = Math.max(1, parseInt(settingsPayload.lowStockThreshold, 10) || DEFAULT_LOW_STOCK_THRESHOLD);
  const ref = doc(db, 'settings', 'store');
  await setDoc(
    ref,
    {
      lowStockThreshold: threshold,
      storeName: String(settingsPayload.storeName || 'Kaarigai Clothing for Women').trim(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function saveContactSettings(rawPayload) {
  const check = validateContactPayload(rawPayload);
  if (!check.valid) {
    throw new Error(check.errors.join(' '));
  }

  const ref = doc(db, 'settings', 'contact');
  const payload = { ...check.data };
  delete payload.updatedAtMs;
  payload.updatedAt = serverTimestamp();

  await setDoc(ref, payload, { merge: true });
  return check.data;
}

/**
 * Pure Dynamic Analytics / Inventory Row Builders
 */
export function buildInventoryRows(products = [], lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  const rows = [];
  products.forEach((product) => {
    (product.colors || []).forEach((col, colorIndex) => {
      (col.sizes || []).forEach((sz) => {
        const qty = Math.max(0, parseInt(sz.stock, 10) || 0);
        rows.push({
          rowId: `${product.id}__${colorIndex}__${sz.size}`,
          productId: product.id,
          productName: product.name,
          category: product.category,
          sku: product.sku,
          isActive: product.isActive,
          thumbnail: (col.images && col.images[0]) || product.defaultImage || '',
          colorIndex,
          colorName: col.colorName,
          colorCode: col.colorCode,
          colorTotalStock: col.totalStock,
          productTotalStock: product.totalStock,
          size: sz.size,
          stock: qty,
          status: getStockStatus(qty, lowStockThreshold)
        });
      });
    });
  });
  return rows;
}

export function computeDashboardMetrics(
  products = [],
  categories = [],
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD
) {
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive).length;
  const totalStock = products.reduce((sum, p) => sum + (p.totalStock || 0), 0);

  const distinctCatNames = new Set();
  categories.forEach((c) => c.name && distinctCatNames.add(c.name.toLowerCase()));
  products.forEach((p) => p.category && distinctCatNames.add(p.category.toLowerCase()));
  const totalCategories = distinctCatNames.size;

  const totalAvailableColors = products.reduce(
    (sum, p) => sum + (Array.isArray(p.colors) ? p.colors.length : 0),
    0
  );
  const inStockColors = products.reduce(
    (sum, p) => sum + (p.colors || []).filter((c) => (c.totalStock || 0) > 0).length,
    0
  );

  const outOfStockProducts = products.filter((p) => p.totalStock <= 0).length;
  const lowStockProducts = products.filter(
    (p) => p.totalStock > 0 && (p.totalStock <= lowStockThreshold || p.hasLowStockSize)
  ).length;

  const inventoryRows = buildInventoryRows(products, lowStockThreshold);
  const lowAndOutRows = inventoryRows
    .filter((row) => row.stock <= lowStockThreshold)
    .sort((a, b) => a.stock - b.stock);

  const recentlyAdded = products.slice(0, 6);

  return {
    totalProducts,
    activeProducts,
    inactiveProducts: totalProducts - activeProducts,
    totalStock,
    totalCategories,
    totalAvailableColors,
    inStockColors,
    lowStockProducts,
    outOfStockProducts,
    lowAndOutRows,
    recentlyAdded,
    inventoryRows
  };
}

