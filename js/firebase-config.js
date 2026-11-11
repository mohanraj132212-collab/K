/**
 * KAARIGAI – Clothing for Women
 * Shared Firebase Modular SDK Initialization & Product Schema Normalization
 * ---------------------------------------------------------------------------
 * Uses the configured Firebase project (kaarigai-0403) with Firebase Auth
 * and Cloud Firestore for real-time product, color, size, image & inventory data.
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { getAnalytics, isSupported as isAnalyticsSupported } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-analytics.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyADrcBDxTDgJlXtv4RIj8EJvuH-aD0wkDI',
  authDomain: 'kaarigai-0403.firebaseapp.com',
  projectId: 'kaarigai-0403',
  storageBucket: 'kaarigai-0403.firebasestorage.app',
  messagingSenderId: '645590655926',
  appId: '1:645590655926:web:75f40e99fd0d3b39495717',
  measurementId: 'G-YDJ4E6BKFB'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let analyticsInstance = null;
isAnalyticsSupported()
  .then((supported) => {
    if (supported) {
      try {
        analyticsInstance = getAnalytics(app);
      } catch (_err) {
        analyticsInstance = null;
      }
    }
  })
  .catch(() => {
    analyticsInstance = null;
  });

export function getAnalyticsInstance() {
  return analyticsInstance;
}

export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const DEFAULT_CATEGORIES = [
  'Sarees',
  'Kurtis',
  'Dresses',
  'Shirts',
  'Lehengas',
  'Western Wear',
  'Accessories'
];

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function slugifyCategory(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'category';
}

export function formatINR(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

export function isValidImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^(https?:\/\/)/i.test(value)) return true;
  // Support clean site-relative asset paths without XSS schemes
  if (!/^(javascript|data|vbscript|file):/i.test(value) && /^[a-z0-9_./~%-]+(\?.*)?$/i.test(value)) {
    return true;
  }
  return false;
}

export function toMillis(timestampVal) {
  if (!timestampVal) return 0;
  if (typeof timestampVal === 'number') return timestampVal;
  if (typeof timestampVal === 'string') {
    const parsed = Date.parse(timestampVal);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof timestampVal.toMillis === 'function') return timestampVal.toMillis();
  if (typeof timestampVal.seconds === 'number') {
    return timestampVal.seconds * 1000 + Math.floor((timestampVal.nanoseconds || 0) / 1e6);
  }
  return 0;
}

export function getStockStatus(quantity, threshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) return 'Out of Stock';
  if (qty <= threshold) return 'Low Stock';
  return 'In Stock';
}

export function computeColorTotalStock(color) {
  if (!color || !Array.isArray(color.sizes)) return 0;
  return color.sizes.reduce((sum, sz) => sum + Math.max(0, parseInt(sz.stock, 10) || 0), 0);
}

export function computeProductTotalStock(product) {
  if (!product || !Array.isArray(product.colors)) return 0;
  return product.colors.reduce((sum, col) => sum + computeColorTotalStock(col), 0);
}

export function getColorStockSummary(color, threshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  if (!color || !Array.isArray(color.sizes) || !color.sizes.length) {
    return { total: 0, inStockSizes: 0, lowStockSizes: 0, outOfStockSizes: 0, status: 'Out of Stock' };
  }
  let total = 0;
  let inStockSizes = 0;
  let lowStockSizes = 0;
  let outOfStockSizes = 0;

  color.sizes.forEach((entry) => {
    const qty = Math.max(0, parseInt(entry.stock, 10) || 0);
    total += qty;
    if (qty <= 0) outOfStockSizes += 1;
    else {
      inStockSizes += 1;
      if (qty <= threshold) lowStockSizes += 1;
    }
  });

  const status = total <= 0 ? 'Out of Stock' : lowStockSizes > 0 || total <= threshold ? 'Low Stock' : 'In Stock';
  return { total, inStockSizes, lowStockSizes, outOfStockSizes, status };
}

/**
 * Normalizes any Firestore `products/{id}` document into a guaranteed,
 * clean structure used identically across Admin & Storefront.
 */
export function normalizeProductDoc(docId, rawData, lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  const data = rawData || {};
  const id = String(docId || data.productId || '').trim();
  const colorsRaw = Array.isArray(data.colors) ? data.colors : [];

  const colors = colorsRaw
    .map((c, idx) => {
      const colorName = String(c?.colorName || c?.name || `Color ${idx + 1}`).trim();
      const hexCandidate = String(c?.colorCode || c?.hex || '#C6A66B').trim();
      const colorCode = /^#([0-9A-F]{3}){1,2}$/i.test(hexCandidate) ? hexCandidate : '#C6A66B';
      const sizesRaw = Array.isArray(c?.sizes) ? c.sizes : [];
      const sizes = sizesRaw
        .map((sz) => ({
          size: String(sz?.size || sz || '').trim(),
          stock: Math.max(0, parseInt(sz?.stock, 10) || 0)
        }))
        .filter((sz) => Boolean(sz.size));
      const images = Array.isArray(c?.images)
        ? c.images.map((img) => String(img || '').trim()).filter(Boolean)
        : [];
      const colorTotalStock = sizes.reduce((sum, sz) => sum + sz.stock, 0);

      return {
        colorName,
        colorCode,
        sizes,
        images,
        totalStock: colorTotalStock,
        status: getColorStockSummary({ sizes }, lowStockThreshold).status
      };
    })
    .filter((c) => c.colorName);

  const firstColor = colors[0] || null;
  const defaultColor = String(data.defaultColor || (firstColor ? firstColor.colorName : '')).trim();
  const defaultColorObj = colors.find((c) => c.colorName === defaultColor) || firstColor;
  const defaultImage = String(
    data.defaultImage || (defaultColorObj && defaultColorObj.images[0]) || ''
  ).trim();

  const totalStock = colors.reduce((sum, c) => sum + c.totalStock, 0);
  const allSizeStocks = colors.flatMap((c) => c.sizes.map((s) => s.stock));
  const hasLowStockSize = allSizeStocks.some((qty) => qty > 0 && qty <= lowStockThreshold);
  const hasOutOfStockSize = allSizeStocks.some((qty) => qty <= 0);
  const overallStatus =
    totalStock <= 0
      ? 'Out of Stock'
      : hasLowStockSize || totalStock <= lowStockThreshold
      ? 'Low Stock'
      : 'In Stock';

  const price = Math.max(0, Number(data.price ?? data.samplePrice ?? 0) || 0);
  const createdAtMs = toMillis(data.createdAt);
  const updatedAtMs = toMillis(data.updatedAt) || createdAtMs;

  return {
    id,
    productId: id,
    name: String(data.name || 'Untitled Product').trim(),
    price,
    samplePrice: price, // backward-compat property for Cart module
    description: String(data.description || '').trim(),
    category: String(data.category || 'Uncategorized').trim(),
    sku: String(data.sku || '').trim(),
    fabric: String(data.fabric || '').trim(),
    care: String(data.care || '').trim(),
    defaultColor,
    defaultImage,
    colors,
    // Derived helpers
    images: defaultColorObj && defaultColorObj.images.length ? defaultColorObj.images : defaultImage ? [defaultImage] : [],
    sizes: defaultColorObj ? defaultColorObj.sizes.map((s) => s.size) : [],
    totalStock,
    hasLowStockSize,
    hasOutOfStockSize,
    stockStatus: overallStatus,
    isActive: data.isActive !== false,
    createdAtMs,
    updatedAtMs
  };
}

export const ADMIN_ROLES = {
  PRIMARY_ADMIN: 'primary_admin',
  ADMIN_MEMBER: 'admin_member',
  ADMIN: 'Admin',
  WORKERS: 'Workers'
};

export function isFullAdminRole(role) {
  return role === ADMIN_ROLES.PRIMARY_ADMIN || role === ADMIN_ROLES.ADMIN;
}

export function isValidAdminDashboardRole(role) {
  return (
    role === ADMIN_ROLES.PRIMARY_ADMIN ||
    role === ADMIN_ROLES.ADMIN_MEMBER ||
    role === ADMIN_ROLES.ADMIN ||
    role === ADMIN_ROLES.WORKERS
  );
}

export function formatAdminRoleLabel(role) {
  if (role === ADMIN_ROLES.ADMIN) return 'Admin';
  if (role === ADMIN_ROLES.PRIMARY_ADMIN) return 'Primary Admin';
  if (role === ADMIN_ROLES.WORKERS) return 'Workers';
  return 'Admin Member';
}

export function getAdminAuthEndpoints() {
  const defaultBase = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;
  let base = defaultBase;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === '127.0.0.1' || host === 'localhost';
    if (isLocalHost) {
      let localOverride = '';
      try {
        localOverride = window.localStorage.getItem('kaarigai_local_auth_base') || '';
      } catch (_err) {
        localOverride = '';
      }
      if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(localOverride.trim())) {
        base = localOverride.trim().replace(/\/+$/, '');
      }
    }
  }

  return {
    loginUrl: `${base}/adminLogin`,
    changePasswordUrl: `${base}/adminChangePassword`,
    membersUrl: `${base}/adminMembers`,
    createUserUrl: `${base}/adminCreateUser`
  };
}

export const CONTACT_FIELD_KEYS = [
  'boutiqueName',
  'businessName',
  'fullAddress',
  'city',
  'state',
  'pinCode',
  'googleMapsUrl',
  'mobileNumber',
  'whatsappNumber',
  'contactEmail',
  'instagramUsername',
  'instagramUrl',
  'facebookUrl',
  'openingTime',
  'closingTime',
  'workingDays',
  'additionalInfo'
];

export function normalizeContactDoc(rawData) {
  const data = rawData || {};
  const normalized = {};
  CONTACT_FIELD_KEYS.forEach((key) => {
    normalized[key] = String(data[key] ?? '').trim();
  });
  normalized.updatedAtMs = toMillis(data.updatedAt);
  return normalized;
}

export function hasContactConfigured(contact) {
  if (!contact) return false;
  return CONTACT_FIELD_KEYS.some((key) => Boolean(String(contact[key] || '').trim()));
}

export function isValidHttpUrl(urlStr) {
  const trimmed = String(urlStr || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_err) {
    return false;
  }
}

export function extractPhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function isValidPhoneNumber(phone) {
  const digits = extractPhoneDigits(phone);
  return digits.length >= 10 && digits.length <= 15;
}

export function buildPhoneHref(phone) {
  const cleaned = String(phone || '').trim().replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  return `tel:${cleaned}`;
}

export function buildWhatsappHref(phone, messageText = '') {
  let digits = extractPhoneDigits(phone);
  if (!digits || digits.length < 10) return '';
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  const base = `https://wa.me/${digits}`;
  return messageText ? `${base}?text=${encodeURIComponent(messageText)}` : base;
}

export function formatInstagramHandle(username) {
  const clean = String(username || '').trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

export function formatFullAddress(contact) {
  if (!contact) return '';
  const cityState = [contact.city, contact.state].filter(Boolean).join(', ');
  const cityStatePin = contact.pinCode
    ? [cityState, contact.pinCode].filter(Boolean).join(' - ')
    : cityState;
  return [contact.fullAddress, cityStatePin].filter(Boolean).join(', ');
}

export function formatBusinessHours(contact) {
  if (!contact) return '';
  const timeRange =
    contact.openingTime && contact.closingTime
      ? `${contact.openingTime} – ${contact.closingTime}`
      : contact.openingTime || contact.closingTime || '';
  return [timeRange, contact.workingDays].filter(Boolean).join(', ');
}

export function validateContactPayload(rawPayload) {
  const data = normalizeContactDoc(rawPayload);
  const errors = [];

  if (data.boutiqueName.length < 2) {
    errors.push('Boutique Name must be at least 2 characters.');
  }
  if (data.businessName.length < 2) {
    errors.push('Business Name must be at least 2 characters.');
  }
  if (data.fullAddress.length < 5) {
    errors.push('Full Address must be at least 5 characters.');
  }
  if (data.city.length < 2) {
    errors.push('City is required.');
  }
  if (data.state.length < 2) {
    errors.push('State is required.');
  }
  if (!/^\d{6}$/.test(data.pinCode)) {
    errors.push('PIN Code must be a valid 6-digit postal code.');
  }
  if (data.googleMapsUrl && !isValidHttpUrl(data.googleMapsUrl)) {
    errors.push('Google Maps Location URL must start with https:// or http://.');
  }
  if (!data.mobileNumber || !isValidPhoneNumber(data.mobileNumber)) {
    errors.push('Mobile Number must contain 10 to 15 digits (e.g., +91 98765 43210).');
  }
  if (data.whatsappNumber && !isValidPhoneNumber(data.whatsappNumber)) {
    errors.push('WhatsApp Number must contain 10 to 15 digits.');
  }
  if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.contactEmail)) {
    errors.push('Contact Email must be a valid email address.');
  }
  if (data.instagramUrl && !isValidHttpUrl(data.instagramUrl)) {
    errors.push('Instagram Profile URL must start with https:// or http://.');
  }
  if (data.facebookUrl && !isValidHttpUrl(data.facebookUrl)) {
    errors.push('Facebook URL must start with https:// or http://.');
  }
  if (!data.openingTime) {
    errors.push('Business Opening Time is required.');
  }
  if (!data.closingTime) {
    errors.push('Business Closing Time is required.');
  }
  if (!data.workingDays) {
    errors.push('Working Days is required.');
  }

  return {
    valid: errors.length === 0,
    errors,
    data
  };
}


