/**
 * KAARIGAI – Clothing for Women
 * Shopping Cart, Wishlist & Firebase-Ready Checkout Architecture
 * ---------------------------------------------------------------------------
 * Handles persistent localStorage cart state, wishlist state, subtotal/total
 * calculations, and a modular FirebaseOrderService adapter ready for future
 * Cloud Firestore & verified payment gateway integration.
 */

(function (global) {
  'use strict';

  const STORAGE_KEYS = {
    CART: 'kaarigai_cart_v1',
    WISHLIST: 'kaarigai_wishlist_v1',
    ORDER_DRAFTS: 'kaarigai_order_drafts_v1'
  };

  function safeRead(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (_err) {
      // Ignore storage quota errors gracefully
    }
  }

  let cartItems = safeRead(STORAGE_KEYS.CART, []);
  let wishlistIds = safeRead(STORAGE_KEYS.WISHLIST, []);
  let orderDrafts = safeRead(STORAGE_KEYS.ORDER_DRAFTS, []);
  const listeners = new Set();

  if (!Array.isArray(cartItems)) cartItems = [];
  if (!Array.isArray(wishlistIds)) wishlistIds = [];
  if (!Array.isArray(orderDrafts)) orderDrafts = [];

  function notify() {
    const snapshot = getStateSnapshot();
    listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (_err) {
        // Keep listener dispatch resilient
      }
    });
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.add(fn);
    return function unsubscribe() {
      listeners.delete(fn);
    };
  }

  function buildLineKey(productId, size, colorName) {
    return [productId, size || 'Standard', colorName || 'Default'].join('__');
  }

  function addItem(product, options) {
    if (!product) return null;
    const opts = options || {};
    const size = opts.size || (product.sizes && product.sizes[0]) || 'Standard';
    const color =
      opts.color ||
      (product.colors && product.colors[0] ? product.colors[0].name : 'Signature');
    const qty = Math.max(1, parseInt(opts.quantity, 10) || 1);
    const key = buildLineKey(product.id, size, color);

    const existing = cartItems.find((item) => item.key === key);
    if (existing) {
      existing.quantity = Math.min(20, existing.quantity + qty);
    } else {
      cartItems.push({
        key: key,
        id: product.id,
        name: product.name,
        category: product.category,
        image: product.images && product.images[0] ? product.images[0] : '',
        unitPrice: product.samplePrice,
        size: size,
        color: color,
        quantity: qty,
        isSampleDemo: true
      });
    }

    safeWrite(STORAGE_KEYS.CART, cartItems);
    notify();
    return key;
  }

  function updateQuantity(lineKey, nextQty) {
    const idx = cartItems.findIndex((item) => item.key === lineKey);
    if (idx === -1) return;

    const parsed = parseInt(nextQty, 10);
    if (!parsed || parsed <= 0) {
      cartItems.splice(idx, 1);
    } else {
      cartItems[idx].quantity = Math.min(20, parsed);
    }

    safeWrite(STORAGE_KEYS.CART, cartItems);
    notify();
  }

  function removeItem(lineKey) {
    cartItems = cartItems.filter((item) => item.key !== lineKey);
    safeWrite(STORAGE_KEYS.CART, cartItems);
    notify();
  }

  function clearCart() {
    cartItems = [];
    safeWrite(STORAGE_KEYS.CART, cartItems);
    notify();
  }

  function getTotals() {
    const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );
    // Transparent boutique shipping/pickup placeholder until live backend pricing
    const shippingEstimate = 0;
    const total = subtotal + shippingEstimate;

    return {
      itemCount: itemCount,
      subtotal: subtotal,
      shippingEstimate: shippingEstimate,
      total: total
    };
  }

  function toggleWishlist(productId) {
    if (!productId) return false;
    const idx = wishlistIds.indexOf(productId);
    let added = false;
    if (idx === -1) {
      wishlistIds.push(productId);
      added = true;
    } else {
      wishlistIds.splice(idx, 1);
      added = false;
    }
    safeWrite(STORAGE_KEYS.WISHLIST, wishlistIds);
    notify();
    return added;
  }

  function isWishlisted(productId) {
    return wishlistIds.includes(productId);
  }

  /**
   * Future Firebase Firestore + Cloud Function Integration Adapter
   * -------------------------------------------------------------------------
   * Replace `submitOrderDraft` implementation with live Firebase modular SDK:
   *   1. Initialize `db = getFirestore(firebaseApp)`
   *   2. Write validated payload to `collection(db, 'orders')` with
   *      `status: 'awaiting_payment_verification'` & `serverTimestamp()`
   *   3. Trigger server-side payment verification (e.g. Razorpay webhook / Cloud Function)
   *      before flipping status to `'confirmed'`.
   *
   * IMPORTANT: Because no live backend or payment gateway is attached in this
   * static build, this method ONLY saves a local unconfirmed draft request.
   */
  const FirebaseOrderService = {
    isBackendConnected: false,
    targetCollection: 'orders',

    buildFirestorePayload: function (customerData, itemsSnapshot, totalsSnapshot) {
      const referenceCode =
        'KRG-DRAFT-' +
        Math.random().toString(36).substring(2, 6).toUpperCase() +
        '-' +
        String(Date.now()).slice(-4);

      return {
        referenceId: referenceCode,
        store: {
          businessName: 'Kaarigai Clothing for Women',
          branch: 'Manapparai Flagship'
        },
        customer: {
          name: (customerData.name || '').trim(),
          mobile: (customerData.mobile || '').trim(),
          address: (customerData.address || '').trim(),
          city: (customerData.city || '').trim(),
          pincode: (customerData.pincode || '').trim(),
          notes: (customerData.notes || '').trim()
        },
        items: itemsSnapshot.map((item) => ({
          productId: item.id,
          name: item.name,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          sampleUnitPrice: item.unitPrice,
          lineSubtotal: item.unitPrice * item.quantity
        })),
        totals: {
          currency: 'INR',
          sampleSubtotal: totalsSnapshot.subtotal,
          shippingEstimate: totalsSnapshot.shippingEstimate,
          sampleTotal: totalsSnapshot.total,
          pricingStatus: 'sample_demo_estimate'
        },
        payment: {
          selectedMethod: customerData.paymentMethod || 'store-pickup',
          paymentVerified: false,
          gatewayStatus: 'not_integrated'
        },
        status: 'demo_draft_unconfirmed',
        createdAtIso: new Date().toISOString()
      };
    },

    submitOrderDraft: async function (customerData) {
      const totals = getTotals();
      if (!cartItems.length) {
        throw new Error('Your shopping bag is currently empty.');
      }

      const payload = this.buildFirestorePayload(customerData, cartItems, totals);

      // Save locally as unconfirmed demo draft for user inspection
      orderDrafts.unshift(payload);
      orderDrafts = orderDrafts.slice(0, 10);
      safeWrite(STORAGE_KEYS.ORDER_DRAFTS, orderDrafts);
      notify();

      return {
        ok: true,
        confirmed: false,
        paymentProcessed: false,
        isDemoOnly: true,
        draft: payload
      };
    }
  };

  function getStateSnapshot() {
    return {
      items: cartItems.map((item) => Object.assign({}, item)),
      wishlistIds: wishlistIds.slice(),
      orderDrafts: orderDrafts.slice(),
      totals: getTotals()
    };
  }

  global.KAARIGAI_CART = {
    subscribe: subscribe,
    addItem: addItem,
    updateQuantity: updateQuantity,
    removeItem: removeItem,
    clearCart: clearCart,
    getTotals: getTotals,
    toggleWishlist: toggleWishlist,
    isWishlisted: isWishlisted,
    getStateSnapshot: getStateSnapshot,
    FirebaseOrderService: FirebaseOrderService
  };
})(window);
