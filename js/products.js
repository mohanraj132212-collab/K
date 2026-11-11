/**
 * KAARIGAI – Clothing for Women
 * Live Cloud Firestore Product Catalogue Module
 * ---------------------------------------------------------------------------
 * Streams active boutique products (`isActive == true`), categories, and store
 * stock thresholds directly from Cloud Firestore in real time.
 * Zero hardcoded sample products.
 */

import {
  db,
  DEFAULT_LOW_STOCK_THRESHOLD,
  formatINR,
  getStockStatus,
  normalizeProductDoc,
  normalizeContactDoc,
  hasContactConfigured
} from './firebase-config.js';

import {
  collection,
  doc,
  query,
  where,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const state = {
  status: 'loading', // 'loading' | 'ready' | 'error'
  error: null,
  rawDocs: [],
  products: [],
  firestoreCategories: [],
  lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
  contactStatus: 'loading', // 'loading' | 'ready' | 'empty' | 'error'
  contact: normalizeContactDoc(null),
  contactError: null
};

const listeners = new Set();

function recomputeCatalog() {
  state.products = state.rawDocs
    .map((entry) => normalizeProductDoc(entry.id, entry.data, state.lowStockThreshold))
    .filter((p) => p.isActive !== false);

  state.products.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

function getCategories() {
  const names = new Set();
  state.firestoreCategories.forEach((c) => {
    if (c.name) names.add(c.name);
  });
  state.products.forEach((p) => {
    if (p.category) names.add(p.category);
  });
  const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
  return ['All', ...sorted];
}

function notify() {
  const payload = {
    status: state.status,
    error: state.error,
    products: state.products.slice(),
    categories: getCategories(),
    lowStockThreshold: state.lowStockThreshold,
    contactStatus: state.contactStatus,
    contact: { ...state.contact },
    contactError: state.contactError
  };
  listeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (_err) {
      // keep subscribers resilient
    }
  });
}

function subscribe(cb) {
  if (typeof cb === 'function') {
    listeners.add(cb);
  }
  return function unsubscribe() {
    listeners.delete(cb);
  };
}

function startFirestoreStreams() {
  const settingsRef = doc(db, 'settings', 'store');
  onSnapshot(
    settingsRef,
    (snap) => {
      if (snap.exists()) {
        const parsed = parseInt(snap.data()?.lowStockThreshold, 10);
        state.lowStockThreshold =
          Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_LOW_STOCK_THRESHOLD;
        recomputeCatalog();
        notify();
      }
    },
    () => {
      // Settings doc is optional before admin configures it; fallback cleanly
    }
  );

  const contactRef = doc(db, 'settings', 'contact');
  onSnapshot(
    contactRef,
    (snap) => {
      if (snap.exists()) {
        const normalized = normalizeContactDoc(snap.data());
        state.contact = normalized;
        state.contactStatus = hasContactConfigured(normalized) ? 'ready' : 'empty';
      } else {
        state.contact = normalizeContactDoc(null);
        state.contactStatus = 'empty';
      }
      state.contactError = null;
      notify();
    },
    (err) => {
      state.contactStatus = 'error';
      state.contactError =
        err && err.code === 'permission-denied'
          ? 'Boutique contact permissions are pending Firestore rules configuration.'
          : (err && err.message) || 'Unable to fetch boutique contact details from Firestore.';
      notify();
    }
  );

  const catsRef = collection(db, 'categories');
  onSnapshot(
    catsRef,
    (snap) => {
      state.firestoreCategories = snap.docs.map((d) => ({
        id: d.id,
        name: String(d.data()?.name || d.id).trim()
      }));
      notify();
    },
    () => {
      // Categories still derive cleanly from active products if needed
    }
  );

  const activeProductsQuery = query(
    collection(db, 'products'),
    where('isActive', '==', true)
  );

  onSnapshot(
    activeProductsQuery,
    (snap) => {
      state.rawDocs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      state.status = 'ready';
      state.error = null;
      recomputeCatalog();
      notify();
    },
    (err) => {
      state.status = 'error';
      state.error =
        err && err.code === 'permission-denied'
          ? 'Storefront catalogue permissions are pending Firestore rules configuration.'
          : (err && err.message) || 'Unable to load storefront catalogue from Cloud Firestore.';
      notify();
    }
  );
}

function getAllProducts() {
  return state.products.slice();
}

function getProductById(id) {
  return state.products.find((p) => p.id === id || p.productId === id) || null;
}

function getColorVariant(product, colorName) {
  if (!product || !Array.isArray(product.colors) || !product.colors.length) return null;
  if (colorName) {
    const match = product.colors.find((c) => c.colorName === colorName);
    if (match) return match;
  }
  const defMatch = product.colors.find((c) => c.colorName === product.defaultColor);
  return defMatch || product.colors[0];
}

function getSizeEntry(colorVariant, sizeName) {
  if (!colorVariant || !Array.isArray(colorVariant.sizes) || !colorVariant.sizes.length) {
    return null;
  }
  if (sizeName) {
    const match = colorVariant.sizes.find((s) => s.size === sizeName);
    if (match) return match;
  }
  return colorVariant.sizes[0];
}

function getDefaultInStockSize(colorVariant) {
  if (!colorVariant || !Array.isArray(colorVariant.sizes) || !colorVariant.sizes.length) {
    return '';
  }
  const inStock = colorVariant.sizes.find((s) => (s.stock || 0) > 0);
  return (inStock || colorVariant.sizes[0]).size;
}

function getRelatedProducts(product, limit = 3) {
  if (!product) return [];
  const sameCategory = state.products.filter(
    (p) => p.id !== product.id && p.category === product.category
  );
  const others = state.products.filter(
    (p) => p.id !== product.id && !sameCategory.some((s) => s.id === p.id)
  );
  return sameCategory.concat(others).slice(0, limit);
}

function filterProducts(options = {}) {
  const category = options.category || 'All';
  const queryStr = String(options.query || '').trim().toLowerCase();
  const sort = options.sort || 'featured';
  const wishlistOnly = Boolean(options.wishlistOnly);
  const wishlistIds = Array.isArray(options.wishlistIds) ? options.wishlistIds : [];

  let list = state.products.filter((product) => {
    const matchesCat = category === 'All' || product.category === category;
    if (!matchesCat) return false;

    if (wishlistOnly && !wishlistIds.includes(product.id)) {
      return false;
    }

    if (queryStr) {
      const colorNames = (product.colors || []).map((c) => c.colorName).join(' ');
      const haystack = [
        product.name,
        product.category,
        product.sku,
        product.description,
        product.fabric,
        colorNames
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(queryStr)) return false;
    }

    return true;
  });

  if (sort === 'price-asc') {
    list = list.slice().sort((a, b) => a.price - b.price);
  } else if (sort === 'price-desc') {
    list = list.slice().sort((a, b) => b.price - a.price);
  } else if (sort === 'newest') {
    list = list.slice().sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  }

  return list;
}

const Catalog = {
  get CATEGORIES() {
    return getCategories();
  },
  get PRODUCTS() {
    return getAllProducts();
  },
  subscribe,
  getStatus: () => ({
    status: state.status,
    error: state.error,
    lowStockThreshold: state.lowStockThreshold,
    contactStatus: state.contactStatus,
    contactError: state.contactError
  }),
  getContact: () => ({ ...state.contact }),
  getCategories,
  getAllProducts,
  getProductById,
  getColorVariant,
  getSizeEntry,
  getDefaultInStockSize,
  getRelatedProducts,
  filterProducts,
  formatINR,
  getStockStatus: (qty) => getStockStatus(qty, state.lowStockThreshold)
};

window.KAARIGAI_CATALOG = Catalog;
startFirestoreStreams();

export default Catalog;
