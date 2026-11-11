/**
 * KAARIGAI – Clothing for Women
 * Main UI & Interactive Storefront Controller (ES Module)
 * ---------------------------------------------------------------------------
 * Connects live Cloud Firestore catalogue, dynamic multi-color/size/image
 * product cards & detail gallery modal, cart & wishlist drawers, navigation,
 * and boutique enquiry modals.
 */

import Catalog from './products.js';
import {
  buildPhoneHref,
  buildWhatsappHref,
  formatBusinessHours,
  formatFullAddress,
  formatInstagramHandle,
  hasContactConfigured,
  isValidHttpUrl,
  normalizeContactDoc
} from './firebase-config.js';

const SVG_ICONS = {
  heart:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.4s-7.5-4.8-9.3-9.3C1.4 7.8 3.6 4.5 7.1 4.5c2.1 0 3.8 1.1 4.9 2.7 1.1-1.6 2.8-2.7 4.9-2.7 3.5 0 5.7 3.3 4.4 6.6-1.8 4.5-9.3 9.3-9.3 9.3z" /></svg>',
  cart:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h2.4l2.4 11.2h11.3l2.2-7.5H6.2" /></svg>',
  minus:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>',
  plus:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>',
  trash:
    '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16" /><path d="M9.5 4h5" /><path d="M7 7l1 13h8l1-13" /></svg>'
};

const uiState = {
  category: 'All',
  query: '',
  sort: 'featured',
  wishlistOnly: false,
  cardSelections: {}, // { productId: { color, size } }
  activeProduct: null,
  modalQty: 1,
  modalSize: '',
  modalColor: '',
  lastDraftText: '',
  hasAnimatedInitialProducts: false,
  contact: normalizeContactDoc(null)
};

const dom = {};

function getCart() {
  return window.KAARIGAI_CART || null;
}

function getAnimations() {
  return window.KAARIGAI_ANIMATIONS || null;
}

function cacheDom() {
  dom.header = document.getElementById('site-header');
  dom.navLinks = document.querySelectorAll('[data-nav]');
  dom.openSearchBtn = document.getElementById('open-search-btn');
  dom.closeSearchBtn = document.getElementById('close-search-btn');
  dom.searchDrawer = document.getElementById('search-bar-drawer');
  dom.headerSearchForm = document.getElementById('header-search-form');
  dom.headerSearchInput = document.getElementById('header-search-input');

  dom.openMobileMenuBtn = document.getElementById('open-mobile-menu-btn');
  dom.closeMobileMenuBtn = document.getElementById('close-mobile-menu-btn');
  dom.mobileDrawer = document.getElementById('mobile-nav-drawer');
  dom.mobileBackdrop = document.getElementById('mobile-nav-backdrop');

  dom.categoryTabs = document.getElementById('category-tabs');
  dom.collectionSearchInput = document.getElementById('collection-search-input');
  dom.collectionSortSelect = document.getElementById('collection-sort-select');
  dom.toggleWishlistFilter = document.getElementById('toggle-wishlist-filter');
  dom.resultsCountLabel = document.getElementById('results-count-label');
  dom.productsGrid = document.getElementById('products-grid');
  dom.emptyResults = document.getElementById('empty-results-state');
  dom.emptyResultsTitle = document.getElementById('empty-results-title');
  dom.emptyResultsDesc = document.getElementById('empty-results-desc');
  dom.resetFiltersBtn = document.getElementById('reset-filters-btn');

  dom.cartBadge = document.getElementById('cart-badge');
  dom.wishlistBadge = document.getElementById('wishlist-badge');
  dom.openCartBtn = document.getElementById('open-cart-btn');
  dom.openWishlistBtn = document.getElementById('open-wishlist-btn');
  dom.openAccountBtn = document.getElementById('open-account-btn');
  dom.openStoryBtn = document.getElementById('open-story-btn');

  dom.drawerBackdrop = document.getElementById('drawer-backdrop');
  dom.cartDrawer = document.getElementById('cart-drawer');
  dom.cartItemsContainer = document.getElementById('cart-items-container');
  dom.cartDrawerFooter = document.getElementById('cart-drawer-footer');
  dom.cartSubtotalVal = document.getElementById('cart-subtotal-val');
  dom.cartTotalVal = document.getElementById('cart-total-val');
  dom.clearCartBtn = document.getElementById('clear-cart-btn');
  dom.proceedCheckoutBtn = document.getElementById('proceed-checkout-btn');

  dom.wishlistDrawer = document.getElementById('wishlist-drawer');
  dom.wishlistItemsContainer = document.getElementById('wishlist-items-container');

  dom.productModal = document.getElementById('product-modal');
  dom.pdMainImage = document.getElementById('pd-main-image');
  dom.pdBadge = document.getElementById('pd-badge');
  dom.pdThumbnails = document.getElementById('pd-thumbnails');
  dom.pdCategory = document.getElementById('pd-category');
  dom.pdSku = document.getElementById('pd-sku');
  dom.pdWishlistBtn = document.getElementById('pd-wishlist-btn');
  dom.pdTitle = document.getElementById('pd-title');
  dom.pdPrice = document.getElementById('pd-price');
  dom.pdStockBadge = document.getElementById('pd-stock-badge');
  dom.pdDescription = document.getElementById('pd-description');
  dom.pdSpecs = document.getElementById('pd-specs');
  dom.pdFabricRow = document.getElementById('pd-fabric-row');
  dom.pdCareRow = document.getElementById('pd-care-row');
  dom.pdFabric = document.getElementById('pd-fabric');
  dom.pdCare = document.getElementById('pd-care');
  dom.pdColorName = document.getElementById('pd-selected-color-name');
  dom.pdColorList = document.getElementById('pd-color-list');
  dom.pdSizeName = document.getElementById('pd-selected-size-name');
  dom.pdSizeList = document.getElementById('pd-size-list');
  dom.pdSizeGuideToggle = document.getElementById('pd-size-guide-toggle');
  dom.pdSizeGuidePanel = document.getElementById('pd-size-guide-panel');
  dom.pdQtyMinus = document.getElementById('pd-qty-minus');
  dom.pdQtyPlus = document.getElementById('pd-qty-plus');
  dom.pdQtyValue = document.getElementById('pd-qty-value');
  dom.pdAddToCartBtn = document.getElementById('pd-add-to-cart-btn');
  dom.pdBuyNowBtn = document.getElementById('pd-buy-now-btn');
  dom.pdRelatedGrid = document.getElementById('pd-related-grid');

  dom.checkoutModal = document.getElementById('checkout-modal');
  dom.checkoutFormView = document.getElementById('checkout-form-view');
  dom.checkoutDraftResult = document.getElementById('checkout-draft-result');
  dom.checkoutForm = document.getElementById('checkout-form');
  dom.checkoutItemsList = document.getElementById('checkout-items-list');
  dom.checkoutSubtotal = document.getElementById('checkout-subtotal');
  dom.checkoutTotal = document.getElementById('checkout-total');
  dom.checkoutErrorBox = document.getElementById('checkout-error-box');
  dom.draftMetaBox = document.getElementById('draft-meta-box');
  dom.copyDraftBtn = document.getElementById('copy-draft-btn');

  dom.storyModal = document.getElementById('story-modal');
  dom.accountModal = document.getElementById('account-modal');
  dom.accountDraftsList = document.getElementById('account-drafts-list');
  dom.whatsappModal = document.getElementById('whatsapp-modal');

  dom.contactForm = document.getElementById('contact-enquiry-form');
  dom.contactFeedback = document.getElementById('contact-form-feedback');
  dom.toastContainer = document.getElementById('toast-container');
  dom.footerYear = document.getElementById('footer-year');

  // Dynamic Contact & Footer DOM references
  dom.contactBoutiqueHeading = document.getElementById('contact-boutique-heading');
  dom.contactCardBadge = document.getElementById('contact-card-badge');
  dom.contactBusinessName = document.getElementById('contact-business-name');
  dom.contactAddressText = document.getElementById('contact-address-text');
  dom.contactHoursText = document.getElementById('contact-hours-text');
  dom.contactMobileItem = document.getElementById('contact-mobile-item');
  dom.contactMobileLink = document.getElementById('contact-mobile-link');
  dom.contactWhatsappText = document.getElementById('contact-whatsapp-text');
  dom.contactEmailItem = document.getElementById('contact-email-item');
  dom.contactEmailLink = document.getElementById('contact-email-link');
  dom.contactSocialItem = document.getElementById('contact-social-item');
  dom.contactSocialLinks = document.getElementById('contact-social-links');
  dom.contactAdditionalItem = document.getElementById('contact-additional-item');
  dom.contactAdditionalText = document.getElementById('contact-additional-text');
  dom.contactMapsBtn = document.getElementById('contact-maps-btn');
  dom.contactWhatsappBtn = document.getElementById('contact-whatsapp-btn');
  dom.contactWhatsappBtnLabel = document.getElementById('contact-whatsapp-btn-label');

  dom.footerInstagramBtn = document.getElementById('footer-instagram-btn');
  dom.footerInstagramLabel = document.getElementById('footer-instagram-label');
  dom.footerWhatsappBtn = document.getElementById('footer-whatsapp-btn');
  dom.footerFacebookBtn = document.getElementById('footer-facebook-btn');
  dom.footerStoreHeading = document.getElementById('footer-store-heading');
  dom.footerAddress = document.getElementById('footer-address');
  dom.footerHoursText = document.getElementById('footer-hours-text');
  dom.footerContactMeta = document.getElementById('footer-contact-meta');
  dom.footerMapLink = document.getElementById('footer-map-link');
  dom.footerCopyrightName = document.getElementById('footer-copyright-name');

  dom.mobileStoreLabel = document.getElementById('mobile-store-label');
  dom.mobileStoreMeta = document.getElementById('mobile-store-meta');
  dom.storyModalBoutiqueMeta = document.getElementById('story-modal-boutique-meta');
  dom.waModalStoreAddress = document.getElementById('wa-modal-store-address');
  dom.waModalStoreHours = document.getElementById('wa-modal-store-hours');
  dom.waModalMapsLink = document.getElementById('wa-modal-maps-link');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  if (!dom.toastContainer) return;
  dom.toastContainer.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'toast-item';
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 260);
  }, 2600);
}

function stockBadgeClass(status) {
  if (status === 'Out of Stock') return 'is-out-of-stock';
  if (status === 'Low Stock') return 'is-low-stock';
  return 'is-in-stock';
}

/* =========================================================================
   HEADER, SEARCH & MOBILE NAVIGATION
   ========================================================================= */

function handleHeaderScroll() {
  if (!dom.header) return;
  dom.header.classList.toggle('is-scrolled', window.scrollY > 28);
}

function setActiveNav(key) {
  dom.navLinks.forEach((link) => {
    link.classList.toggle('is-active', link.getAttribute('data-nav') === key);
  });
}

function openMobileMenu() {
  if (!dom.mobileDrawer || !dom.mobileBackdrop) return;
  dom.mobileBackdrop.hidden = false;
  dom.mobileDrawer.classList.add('is-open');
  dom.mobileDrawer.setAttribute('aria-hidden', 'false');
  if (dom.openMobileMenuBtn) dom.openMobileMenuBtn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
}

function closeMobileMenu() {
  if (!dom.mobileDrawer || !dom.mobileBackdrop) return;
  dom.mobileDrawer.classList.remove('is-open');
  dom.mobileDrawer.setAttribute('aria-hidden', 'true');
  dom.mobileBackdrop.hidden = true;
  if (dom.openMobileMenuBtn) dom.openMobileMenuBtn.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
}

function toggleSearchBar(forceOpen) {
  if (!dom.searchDrawer) return;
  const willOpen = typeof forceOpen === 'boolean' ? forceOpen : dom.searchDrawer.hidden;
  dom.searchDrawer.hidden = !willOpen;
  if (dom.openSearchBtn) {
    dom.openSearchBtn.setAttribute('aria-expanded', String(willOpen));
  }
  if (willOpen && dom.headerSearchInput) {
    dom.headerSearchInput.focus();
  }
}

function handleNavigationClick(event) {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || href === '#') return;

  const targetKey = link.getAttribute('data-nav');
  closeMobileMenu();

  if (href === '#about') {
    event.preventDefault();
    setActiveNav('about');
    const Animations = getAnimations();
    if (Animations && typeof Animations.scrollToAboutStage === 'function') {
      Animations.scrollToAboutStage();
    }
    return;
  }

  if (href === '#home') {
    event.preventDefault();
    setActiveNav('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const section = document.querySelector(href);
  if (section) {
    event.preventDefault();
    if (targetKey) setActiveNav(targetKey);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* =========================================================================
   COLLECTIONS & LIVE PRODUCT GRID
   ========================================================================= */

function getCardSelection(product) {
  let sel = uiState.cardSelections[product.id];
  const colorObj = Catalog.getColorVariant(product, sel ? sel.color : '');
  const colorName = colorObj ? colorObj.colorName : '';

  let chosenSize = sel ? sel.size : '';
  const matchedSize = Catalog.getSizeEntry(colorObj, chosenSize);
  if (!matchedSize || (matchedSize.stock <= 0 && colorObj && colorObj.sizes.some((s) => s.stock > 0))) {
    chosenSize = Catalog.getDefaultInStockSize(colorObj);
  }

  sel = {
    color: colorName,
    size: chosenSize
  };
  uiState.cardSelections[product.id] = sel;
  return sel;
}

function renderCategoryTabs() {
  if (!dom.categoryTabs) return;
  const allProducts = Catalog.getAllProducts();
  const categories = Catalog.getCategories();

  if (!categories.includes(uiState.category)) {
    uiState.category = 'All';
  }

  dom.categoryTabs.innerHTML = categories
    .map((cat) => {
      const count =
        cat === 'All'
          ? allProducts.length
          : Catalog.filterProducts({ category: cat }).length;
      const isActive = uiState.category === cat;
      return (
        `<button type="button" role="tab" aria-selected="${isActive}" ` +
        `class="cat-tab${isActive ? ' is-active' : ''}" data-category="${escapeHtml(cat)}">` +
        `<span>${escapeHtml(cat)}</span>` +
        `<span class="cat-count">(${count})</span>` +
        `</button>`
      );
    })
    .join('');
}

function buildProductCardHtml(product) {
  const Cart = getCart();
  const sel = getCardSelection(product);
  const colorObj = Catalog.getColorVariant(product, sel.color);
  const sizeObj = Catalog.getSizeEntry(colorObj, sel.size);
  const wishlisted = Cart ? Cart.isWishlisted(product.id) : false;

  const imgs = colorObj && colorObj.images.length ? colorObj.images : [product.defaultImage];
  const primaryImg = imgs[0] || '';
  const secondaryImg = imgs[1] || imgs[0] || '';

  const colorTotal = colorObj ? colorObj.totalStock : product.totalStock;
  const sizeStock = sizeObj ? sizeObj.stock : 0;
  const colorStatus = Catalog.getStockStatus(colorTotal);
  const badgeText = colorTotal <= 0 ? 'Out of Stock' : colorStatus === 'Low Stock' ? 'Low Stock' : product.category;

  const colorsHtml = (product.colors || [])
    .map((c) => {
      const active = sel.color === c.colorName ? ' is-selected' : '';
      return (
        `<button type="button" class="color-swatch-dot${active}" ` +
        `style="background-color:${escapeHtml(c.colorCode)}" ` +
        `data-card-color="${escapeHtml(c.colorName)}" ` +
        `data-pid="${escapeHtml(product.id)}" ` +
        `title="${escapeHtml(c.colorName)}" ` +
        `aria-label="Select colour ${escapeHtml(c.colorName)}"></button>`
      );
    })
    .join('');

  const sizesHtml = (colorObj?.sizes || [])
    .map((szEntry) => {
      const label = szEntry.size.startsWith('Free Size') ? 'Free Size' : szEntry.size;
      const isOut = szEntry.stock <= 0;
      const active = sel.size === szEntry.size && !isOut ? ' is-selected' : '';
      return (
        `<button type="button" class="size-chip-mini${active}${isOut ? ' is-out-of-stock' : ''}" ` +
        `${isOut ? 'disabled title="Out of Stock"' : ''} ` +
        `data-card-size="${escapeHtml(szEntry.size)}" ` +
        `data-pid="${escapeHtml(product.id)}">${escapeHtml(label)}</button>`
      );
    })
    .join('');

  const canPurchase = Boolean(sizeObj && sizeStock > 0 && colorTotal > 0);
  const addBtnLabel = canPurchase ? 'Add to Cart' : 'Out of Stock';

  return `
    <article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="product-media-wrap" data-open-detail="${escapeHtml(product.id)}">
        <img class="product-img product-img-primary" src="${escapeHtml(primaryImg)}" alt="${escapeHtml(product.name)}" loading="lazy" />
        <img class="product-img product-img-secondary" src="${escapeHtml(secondaryImg)}" alt="" aria-hidden="true" loading="lazy" />
        <div class="product-card-top-overlay">
          <span class="product-badge ${colorTotal <= 0 ? 'is-out-pill' : ''}">${escapeHtml(badgeText)}</span>
          <button
            type="button"
            class="card-wishlist-btn${wishlisted ? ' is-wishlisted' : ''}"
            data-wishlist-toggle="${escapeHtml(product.id)}"
            aria-label="${wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}"
          >
            ${SVG_ICONS.heart}
          </button>
        </div>
        <span class="product-quickview-pill">View Details &amp; Gallery</span>
      </div>

      <div class="product-card-body">
        <span class="product-cat-label">${escapeHtml(product.category)}</span>
        <h3 class="product-title" data-open-detail="${escapeHtml(product.id)}">${escapeHtml(product.name)}</h3>
        <div class="product-price-line">
          <span class="product-price">${Catalog.formatINR(product.price)}</span>
          <span class="product-stock-pill ${stockBadgeClass(sizeObj ? Catalog.getStockStatus(sizeStock) : colorStatus)}">
            ${canPurchase ? Catalog.getStockStatus(sizeStock) : 'Out of Stock'}
          </span>
        </div>

        <div class="product-variants-meta">
          <div class="card-colors-row">
            <span class="variant-mini-label">Colour:</span>
            ${colorsHtml}
          </div>
          <div class="card-sizes-row">
            <span class="variant-mini-label">Sizes:</span>
            ${sizesHtml || '<span class="variant-mini-label">Unavailable</span>'}
          </div>
        </div>

        <div class="product-card-actions">
          <button
            type="button"
            class="card-add-btn"
            data-add-cart="${escapeHtml(product.id)}"
            ${canPurchase ? '' : 'disabled'}
          >
            ${SVG_ICONS.cart}
            <span>${addBtnLabel}</span>
          </button>
          <button type="button" class="card-detail-btn" data-open-detail="${escapeHtml(product.id)}">
            Details
          </button>
        </div>
      </div>
    </article>
  `;
}

function updateSingleProductCardDom(productId) {
  if (!dom.productsGrid) return;
  const product = Catalog.getProductById(productId);
  if (!product) return;
  const existingCard = dom.productsGrid.querySelector(`[data-product-id="${CSS.escape(productId)}"]`);
  if (!existingCard) return;

  const template = document.createElement('div');
  template.innerHTML = buildProductCardHtml(product).trim();
  const nextCard = template.firstElementChild;
  if (nextCard) {
    existingCard.replaceWith(nextCard);
  }
}

function renderProductsGrid(shouldAnimate) {
  if (!dom.productsGrid) return;

  const catalogStatus = Catalog.getStatus();
  const Cart = getCart();
  const snapshot = Cart ? Cart.getStateSnapshot() : { wishlistIds: [] };
  const Animations = getAnimations();

  if (catalogStatus.status === 'loading') {
    if (dom.resultsCountLabel) {
      dom.resultsCountLabel.textContent = 'Connecting to live boutique catalogue...';
    }
    if (dom.emptyResults) dom.emptyResults.hidden = true;
    dom.productsGrid.innerHTML = Array.from({ length: 6 })
      .map(
        () =>
          '<div class="product-skeleton-card" aria-hidden="true">' +
          '<div class="skeleton-media"></div>' +
          '<div class="skeleton-body">' +
          '<div class="skeleton-line short"></div>' +
          '<div class="skeleton-line"></div>' +
          '<div class="skeleton-line mid"></div>' +
          '</div>' +
          '</div>'
      )
      .join('');
    return;
  }

  if (catalogStatus.status === 'error') {
    dom.productsGrid.innerHTML = '';
    if (dom.resultsCountLabel) dom.resultsCountLabel.textContent = 'Catalogue temporarily unavailable';
    if (dom.emptyResults) dom.emptyResults.hidden = false;
    if (dom.emptyResultsTitle) dom.emptyResultsTitle.textContent = 'Unable to load collection';
    if (dom.emptyResultsDesc) {
      dom.emptyResultsDesc.textContent =
        catalogStatus.error || 'Please check your connection and try again shortly.';
    }
    if (dom.resetFiltersBtn) dom.resetFiltersBtn.hidden = true;
    return;
  }

  const allActive = Catalog.getAllProducts();
  const filtered = Catalog.filterProducts({
    category: uiState.category,
    query: uiState.query,
    sort: uiState.sort,
    wishlistOnly: uiState.wishlistOnly,
    wishlistIds: snapshot.wishlistIds
  });

  if (dom.resultsCountLabel) {
    const labelCat = uiState.wishlistOnly
      ? 'saved wishlist pieces'
      : uiState.category === 'All'
      ? 'curated atelier pieces'
      : uiState.category.toLowerCase() + ' pieces';
    dom.resultsCountLabel.textContent = `Showing ${filtered.length} ${labelCat}`;
  }

  if (!filtered.length) {
    dom.productsGrid.innerHTML = '';
    if (dom.emptyResults) dom.emptyResults.hidden = false;
    if (!allActive.length) {
      if (dom.emptyResultsTitle) dom.emptyResultsTitle.textContent = 'New Collection Launching Soon';
      if (dom.emptyResultsDesc) {
        dom.emptyResultsDesc.textContent =
          'No active garments are published in the showroom catalogue yet. Visit again soon or reach our boutique for private previews.';
      }
      if (dom.resetFiltersBtn) dom.resetFiltersBtn.hidden = true;
    } else {
      if (dom.emptyResultsTitle) dom.emptyResultsTitle.textContent = 'No matching garments found';
      if (dom.emptyResultsDesc) {
        dom.emptyResultsDesc.textContent =
          'Try clearing your filter or switching categories to view our full curated showcase.';
      }
      if (dom.resetFiltersBtn) dom.resetFiltersBtn.hidden = false;
    }

    if (Animations && typeof Animations.refresh === 'function') {
      window.requestAnimationFrame(Animations.refresh);
    }
    return;
  }

  if (dom.emptyResults) dom.emptyResults.hidden = true;
  dom.productsGrid.innerHTML = filtered.map((product) => buildProductCardHtml(product)).join('');

  if (shouldAnimate && Animations && typeof Animations.animateProductCards === 'function') {
    Animations.animateProductCards();
  }

  if (Animations && typeof Animations.refresh === 'function') {
    window.requestAnimationFrame(Animations.refresh);
  }
}

/* =========================================================================
   PRODUCT DETAIL MODAL (DYNAMIC MULTI-COLOR / GALLERY / SIZES / STOCK)
   ========================================================================= */

function openProductDetail(productId) {
  const product = Catalog.getProductById(productId);
  if (!product || !dom.productModal) return;

  const sel = getCardSelection(product);
  uiState.activeProduct = product;
  uiState.modalColor = sel.color;
  uiState.modalSize = sel.size;
  uiState.modalQty = 1;

  populateProductModalContent();
  openModal(dom.productModal);
  const card = dom.productModal.querySelector('.modal-card');
  if (card) card.scrollTop = 0;
}

function populateProductModalContent() {
  const product = uiState.activeProduct;
  if (!product) return;

  const colorObj = Catalog.getColorVariant(product, uiState.modalColor);
  uiState.modalColor = colorObj ? colorObj.colorName : '';

  // Ensure selected size belongs to current color and prefers in-stock sizes
  const matchedSize = Catalog.getSizeEntry(colorObj, uiState.modalSize);
  if (!matchedSize) {
    uiState.modalSize = Catalog.getDefaultInStockSize(colorObj);
  }

  dom.pdCategory.textContent = product.category;
  if (dom.pdSku) dom.pdSku.textContent = product.sku ? `SKU: ${product.sku}` : '';
  dom.pdTitle.textContent = product.name;
  dom.pdPrice.textContent = Catalog.formatINR(product.price);
  dom.pdDescription.textContent = product.description;

  const hasFabric = Boolean(product.fabric);
  const hasCare = Boolean(product.care);
  if (dom.pdFabricRow) dom.pdFabricRow.hidden = !hasFabric;
  if (dom.pdCareRow) dom.pdCareRow.hidden = !hasCare;
  if (dom.pdSpecs) dom.pdSpecs.hidden = !hasFabric && !hasCare;
  if (dom.pdFabric) dom.pdFabric.textContent = product.fabric;
  if (dom.pdCare) dom.pdCare.textContent = product.care;

  if (dom.pdSizeGuidePanel) dom.pdSizeGuidePanel.hidden = true;

  syncModalWishlistButton();
  renderModalGalleryForColor(product, colorObj);
  renderModalVariants();
  renderRelatedProducts(product);
}

function renderModalGalleryForColor(product, colorObj) {
  const imgs =
    colorObj && Array.isArray(colorObj.images) && colorObj.images.length
      ? colorObj.images
      : product.defaultImage
      ? [product.defaultImage]
      : [];

  if (dom.pdMainImage) {
    dom.pdMainImage.src = imgs[0] || '';
    dom.pdMainImage.alt = `${product.name}${colorObj ? ' — ' + colorObj.colorName : ''}`;
  }

  const viewLabels = ['Full Look', 'Silhouette', 'Textile Detail'];
  if (dom.pdThumbnails) {
    dom.pdThumbnails.innerHTML = imgs
      .map(
        (imgSrc, index) => `
          <button
            type="button"
            class="pd-thumb-btn${index === 0 ? ' is-active' : ''}"
            data-thumb-src="${escapeHtml(imgSrc)}"
            aria-label="View ${escapeHtml(viewLabels[index] || 'Angle ' + (index + 1))}"
          >
            <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.name)} angle ${index + 1}" />
          </button>
        `
      )
      .join('');
  }
}

function syncModalWishlistButton() {
  const Cart = getCart();
  if (!uiState.activeProduct || !dom.pdWishlistBtn || !Cart) return;
  const saved = Cart.isWishlisted(uiState.activeProduct.id);
  dom.pdWishlistBtn.classList.toggle('is-wishlisted', saved);
  dom.pdWishlistBtn.setAttribute(
    'aria-label',
    saved ? 'Remove from wishlist' : 'Save to wishlist'
  );
}

function renderModalVariants() {
  const product = uiState.activeProduct;
  if (!product) return;

  const colorObj = Catalog.getColorVariant(product, uiState.modalColor);
  uiState.modalColor = colorObj ? colorObj.colorName : '';

  dom.pdColorName.textContent = uiState.modalColor || 'Standard';
  dom.pdColorList.innerHTML = (product.colors || [])
    .map((c) => {
      const active = c.colorName === uiState.modalColor ? ' is-selected' : '';
      return (
        `<button type="button" class="pd-color-btn${active}" ` +
        `style="background-color:${escapeHtml(c.colorCode)}" ` +
        `data-modal-color="${escapeHtml(c.colorName)}" ` +
        `title="${escapeHtml(c.colorName)}" ` +
        `aria-label="Choose colour ${escapeHtml(c.colorName)}"></button>`
      );
    })
    .join('');

  const sizeEntries = colorObj ? colorObj.sizes : [];
  let activeSizeEntry = Catalog.getSizeEntry(colorObj, uiState.modalSize);
  if (!activeSizeEntry || (activeSizeEntry.stock <= 0 && sizeEntries.some((s) => s.stock > 0))) {
    uiState.modalSize = Catalog.getDefaultInStockSize(colorObj);
    activeSizeEntry = Catalog.getSizeEntry(colorObj, uiState.modalSize);
  }

  dom.pdSizeName.textContent = uiState.modalSize || 'Unavailable';
  dom.pdSizeList.innerHTML = sizeEntries.length
    ? sizeEntries
        .map((entry) => {
          const isOut = entry.stock <= 0;
          const active = entry.size === uiState.modalSize && !isOut ? ' is-selected' : '';
          return (
            `<button type="button" class="pd-size-btn${active}${isOut ? ' is-out-of-stock' : ''}" ` +
            `${isOut ? 'disabled aria-disabled="true"' : ''} ` +
            `data-modal-size="${escapeHtml(entry.size)}">` +
            `${escapeHtml(entry.size)}${isOut ? ' <span class="size-out-tag">(Out of Stock)</span>' : ''}` +
            `</button>`
          );
        })
        .join('')
    : '<span class="variant-empty-hint">No sizes configured for this colour.</span>';

  const colorTotal = colorObj ? colorObj.totalStock : 0;
  const activeStock = activeSizeEntry ? activeSizeEntry.stock : 0;
  const maxOrderable = Math.min(20, Math.max(0, activeStock));
  const statusLabel = Catalog.getStockStatus(activeStock);

  if (dom.pdStockBadge) {
    if (colorTotal <= 0 || activeStock <= 0) {
      dom.pdStockBadge.textContent = 'Out of Stock';
      dom.pdStockBadge.className = 'pd-stock-badge is-out-of-stock';
    } else if (statusLabel === 'Low Stock') {
      dom.pdStockBadge.textContent = `Low Stock • Only ${activeStock} left`;
      dom.pdStockBadge.className = 'pd-stock-badge is-low-stock';
    } else {
      dom.pdStockBadge.textContent = `In Stock (${activeStock} available)`;
      dom.pdStockBadge.className = 'pd-stock-badge is-in-stock';
    }
  }

  if (dom.pdBadge) {
    dom.pdBadge.textContent = colorTotal <= 0 ? 'Out of Stock' : statusLabel === 'Low Stock' ? 'Low Stock' : product.category;
  }

  const canBuy = Boolean(activeSizeEntry && activeStock > 0 && colorTotal > 0);
  if (!canBuy) {
    uiState.modalQty = 0;
  } else {
    uiState.modalQty = Math.min(maxOrderable, Math.max(1, uiState.modalQty || 1));
  }

  if (dom.pdQtyValue) dom.pdQtyValue.textContent = String(uiState.modalQty);
  if (dom.pdQtyMinus) dom.pdQtyMinus.disabled = !canBuy || uiState.modalQty <= 1;
  if (dom.pdQtyPlus) dom.pdQtyPlus.disabled = !canBuy || uiState.modalQty >= maxOrderable;
  if (dom.pdAddToCartBtn) {
    dom.pdAddToCartBtn.disabled = !canBuy;
    const span = dom.pdAddToCartBtn.querySelector('span');
    if (span) span.textContent = canBuy ? 'Add to Cart' : 'Out of Stock';
  }
  if (dom.pdBuyNowBtn) {
    dom.pdBuyNowBtn.disabled = !canBuy;
    const span = dom.pdBuyNowBtn.querySelector('span');
    if (span) span.textContent = canBuy ? 'Buy Now' : 'Unavailable';
  }
}

function renderRelatedProducts(product) {
  if (!dom.pdRelatedGrid) return;
  const related = Catalog.getRelatedProducts(product, 3);
  dom.pdRelatedGrid.innerHTML = related
    .map(
      (item) => `
        <button type="button" class="related-mini-card" data-open-detail="${escapeHtml(item.id)}">
          <img src="${escapeHtml(item.defaultImage)}" alt="${escapeHtml(item.name)}" loading="lazy" />
          <div class="related-mini-body">
            <h4>${escapeHtml(item.name)}</h4>
            <span>${Catalog.formatINR(item.price)}</span>
          </div>
        </button>
      `
    )
    .join('');
}

/* =========================================================================
   DRAWERS (CART & WISHLIST) + MODALS
   ========================================================================= */

function openDrawer(drawerEl) {
  if (!drawerEl || !dom.drawerBackdrop) return;
  closeAllDrawers(false);
  dom.drawerBackdrop.hidden = false;
  drawerEl.classList.add('is-open');
  drawerEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function closeAllDrawers(unlockScroll) {
  if (dom.cartDrawer) {
    dom.cartDrawer.classList.remove('is-open');
    dom.cartDrawer.setAttribute('aria-hidden', 'true');
  }
  if (dom.wishlistDrawer) {
    dom.wishlistDrawer.classList.remove('is-open');
    dom.wishlistDrawer.setAttribute('aria-hidden', 'true');
  }
  if (dom.drawerBackdrop) dom.drawerBackdrop.hidden = true;
  if (unlockScroll !== false && !hasOpenModal()) {
    document.body.classList.remove('no-scroll');
  }
}

function hasOpenModal() {
  return Boolean(document.querySelector('.modal-overlay:not([hidden])'));
}

function openModal(modalEl) {
  if (!modalEl) return;
  closeAllModals(false);
  closeAllDrawers(false);
  modalEl.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeAllModals(unlockScroll) {
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.hidden = true;
  });
  if (unlockScroll !== false) {
    document.body.classList.remove('no-scroll');
  }
}

function renderCartAndWishlist(snapshot) {
  const Cart = getCart();
  if (!Cart) return;
  const state = snapshot || Cart.getStateSnapshot();

  if (dom.cartBadge) {
    dom.cartBadge.textContent = String(state.totals.itemCount);
    dom.cartBadge.classList.toggle('is-hidden', state.totals.itemCount === 0);
  }

  if (dom.wishlistBadge) {
    dom.wishlistBadge.textContent = String(state.wishlistIds.length);
    dom.wishlistBadge.classList.toggle('is-hidden', state.wishlistIds.length === 0);
  }

  if (dom.cartItemsContainer) {
    if (!state.items.length) {
      dom.cartItemsContainer.innerHTML = `
        <div class="drawer-empty">
          <h3>Your Shopping Bag is Empty</h3>
          <p>Explore silk sarees, handcrafted kurtis, and modern silhouettes to begin your selection.</p>
          <button type="button" class="btn btn-primary" id="empty-bag-explore-btn">Explore Collections</button>
        </div>
      `;
      if (dom.cartDrawerFooter) dom.cartDrawerFooter.hidden = true;
    } else {
      if (dom.cartDrawerFooter) dom.cartDrawerFooter.hidden = false;
      dom.cartItemsContainer.innerHTML = state.items
        .map((item) => {
          const lineSubtotal = item.unitPrice * item.quantity;
          return `
            <div class="cart-line-item">
              <img class="cart-line-thumb" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
              <div>
                <div class="cart-line-top">
                  <h4 class="cart-line-title">${escapeHtml(item.name)}</h4>
                  <button type="button" class="cart-line-remove" data-remove-line="${escapeHtml(item.key)}" aria-label="Remove item">
                    ${SVG_ICONS.trash}
                  </button>
                </div>
                <p class="cart-line-meta">Size: ${escapeHtml(item.size)} • Colour: ${escapeHtml(item.color)}</p>
                <div class="cart-line-bottom">
                  <div class="qty-control-mini">
                    <button type="button" data-line-minus="${escapeHtml(item.key)}" aria-label="Decrease quantity">${SVG_ICONS.minus}</button>
                    <span>${item.quantity}</span>
                    <button type="button" data-line-plus="${escapeHtml(item.key)}" aria-label="Increase quantity">${SVG_ICONS.plus}</button>
                  </div>
                  <span class="cart-line-price">${Catalog.formatINR(lineSubtotal)}</span>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  if (dom.cartSubtotalVal) {
    dom.cartSubtotalVal.textContent = Catalog.formatINR(state.totals.subtotal);
  }
  if (dom.cartTotalVal) {
    dom.cartTotalVal.textContent = Catalog.formatINR(state.totals.total);
  }

  if (dom.wishlistItemsContainer) {
    const savedProducts = state.wishlistIds
      .map((id) => Catalog.getProductById(id))
      .filter(Boolean);

    if (!savedProducts.length) {
      dom.wishlistItemsContainer.innerHTML = `
        <div class="drawer-empty">
          <h3>No Saved Pieces Yet</h3>
          <p>Tap the heart icon on any KAARIGAI garment to keep a personal shortlist here.</p>
        </div>
      `;
    } else {
      dom.wishlistItemsContainer.innerHTML = savedProducts
        .map((prod) => {
          const canQuickAdd = prod.totalStock > 0;
          return `
            <div class="cart-line-item">
              <img class="cart-line-thumb" src="${escapeHtml(prod.defaultImage)}" alt="${escapeHtml(prod.name)}" />
              <div>
                <div class="cart-line-top">
                  <h4 class="cart-line-title">${escapeHtml(prod.name)}</h4>
                  <button type="button" class="cart-line-remove" data-wishlist-toggle="${escapeHtml(prod.id)}" aria-label="Remove from wishlist">
                    ${SVG_ICONS.trash}
                  </button>
                </div>
                <p class="cart-line-meta">${escapeHtml(prod.category)} • ${Catalog.formatINR(prod.price)}</p>
                <div class="cart-line-bottom">
                  <button type="button" class="btn btn-sm btn-outline" data-open-detail="${escapeHtml(prod.id)}">View Piece</button>
                  <button type="button" class="btn btn-sm btn-primary" data-add-cart="${escapeHtml(prod.id)}" ${canQuickAdd ? '' : 'disabled'}>
                    ${canQuickAdd ? 'Add to Bag' : 'Out of Stock'}
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  syncGridWishlistIcons();
  syncModalWishlistButton();
  renderAccountDrafts(state.orderDrafts);
}

function syncGridWishlistIcons() {
  const Cart = getCart();
  if (!Cart) return;
  document.querySelectorAll('[data-wishlist-toggle]').forEach((btn) => {
    const pid = btn.getAttribute('data-wishlist-toggle');
    if (btn.classList.contains('card-wishlist-btn')) {
      btn.classList.toggle('is-wishlisted', Cart.isWishlisted(pid));
    }
  });
}

/* =========================================================================
   CHECKOUT DRAFT FLOW
   ========================================================================= */

function openCheckout() {
  const Cart = getCart();
  if (!Cart) return;
  const state = Cart.getStateSnapshot();
  if (!state.items.length) {
    showToast('Add a garment to your shopping bag before checking out.');
    openDrawer(dom.cartDrawer);
    return;
  }

  dom.checkoutFormView.hidden = false;
  dom.checkoutDraftResult.hidden = true;
  dom.checkoutErrorBox.hidden = true;

  dom.checkoutItemsList.innerHTML = state.items
    .map(
      (item) => `
        <div class="chk-mini-row">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
          <div class="chk-mini-info">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.size)} • ${escapeHtml(item.color)} &times; ${item.quantity}</span>
          </div>
          <strong>${Catalog.formatINR(item.unitPrice * item.quantity)}</strong>
        </div>
      `
    )
    .join('');

  dom.checkoutSubtotal.textContent = Catalog.formatINR(state.totals.subtotal);
  dom.checkoutTotal.textContent = Catalog.formatINR(state.totals.total);

  openModal(dom.checkoutModal);
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  const Cart = getCart();
  if (!Cart) return;
  dom.checkoutErrorBox.hidden = true;

  const name = document.getElementById('chk-name').value.trim();
  const mobileRaw = document.getElementById('chk-mobile').value.trim();
  const mobileDigits = mobileRaw.replace(/\D/g, '');
  const address = document.getElementById('chk-address').value.trim();
  const city = document.getElementById('chk-city').value.trim();
  const pincode = document.getElementById('chk-pincode').value.trim();
  const paymentRadio = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = paymentRadio ? paymentRadio.value : 'Pay at Boutique';

  if (name.length < 2) {
    showCheckoutError('Please enter your full name.');
    return;
  }
  if (mobileDigits.length < 10) {
    showCheckoutError('Please enter a valid 10-digit mobile number.');
    return;
  }
  if (address.length < 5 || city.length < 2 || !/^\d{6}$/.test(pincode)) {
    showCheckoutError('Please enter a complete delivery address, city, and 6-digit pincode.');
    return;
  }

  try {
    const result = await Cart.FirebaseOrderService.submitOrderDraft({
      name,
      mobile: mobileRaw,
      address,
      city,
      pincode,
      paymentMethod
    });

    const draft = result.draft;
    const itemLines = draft.items
      .map(
        (it) =>
          `- ${it.name} (${it.size}, ${it.color}) × ${it.quantity} = ${Catalog.formatINR(it.lineSubtotal)}`
      )
      .join('\n');

    uiState.lastDraftText = [
      'KAARIGAI – Clothing for Women (Order Request)',
      `Draft Ref: ${draft.referenceId}`,
      'Status: Pending Payment / Boutique Verification',
      `Customer: ${draft.customer.name} (${draft.customer.mobile})`,
      `Address: ${draft.customer.address}, ${draft.customer.city} - ${draft.customer.pincode}`,
      `Payment Preference: ${draft.payment.selectedMethod}`,
      'Items:',
      itemLines,
      `Estimated Total: ${Catalog.formatINR(draft.totals.sampleTotal)}`
    ].join('\n');

    dom.draftMetaBox.innerHTML =
      `<div><strong>Draft Reference:</strong> ${escapeHtml(draft.referenceId)}</div>` +
      `<div><strong>Status:</strong> Saved Order Request (No Online Charge Processed)</div>` +
      `<div><strong>Customer:</strong> ${escapeHtml(draft.customer.name)} • ${escapeHtml(draft.customer.mobile)}</div>` +
      `<div><strong>Delivery:</strong> ${escapeHtml(draft.customer.address)}, ${escapeHtml(draft.customer.city)} - ${escapeHtml(draft.customer.pincode)}</div>` +
      `<div><strong>Payment Choice:</strong> ${escapeHtml(draft.payment.selectedMethod)}</div>` +
      `<div><strong>Estimated Total:</strong> ${Catalog.formatINR(draft.totals.sampleTotal)}</div>`;

    dom.checkoutFormView.hidden = true;
    dom.checkoutDraftResult.hidden = false;
    showToast('Order request draft saved locally.');
  } catch (err) {
    showCheckoutError(err.message || 'Unable to prepare draft request.');
  }
}

function showCheckoutError(msg) {
  dom.checkoutErrorBox.textContent = msg;
  dom.checkoutErrorBox.hidden = false;
}

function renderAccountDrafts(drafts) {
  if (!dom.accountDraftsList) return;
  if (!drafts || !drafts.length) {
    dom.accountDraftsList.innerHTML =
      '<div class="account-draft-item">No local order request drafts saved yet. Add a piece to your bag and prepare a request from Checkout.</div>';
    return;
  }

  dom.accountDraftsList.innerHTML = drafts
    .map(
      (d) =>
        `<div class="account-draft-item">` +
        `<strong>${escapeHtml(d.referenceId)}</strong> — ${Catalog.formatINR(d.totals.sampleTotal)} ` +
        `(${d.items.length} item type${d.items.length === 1 ? '' : 's'})<br />` +
        `<span>Status: Saved Draft • ${escapeHtml(d.payment.selectedMethod)}</span>` +
        `</div>`
    )
    .join('');
}

/* =========================================================================
   EVENT DELEGATION & BINDINGS
   ========================================================================= */

function bindEvents() {
  const Cart = getCart();
  const Animations = getAnimations();

  window.addEventListener('scroll', handleHeaderScroll, { passive: true });
  handleHeaderScroll();

  document.addEventListener('click', handleNavigationClick);

  if (dom.openSearchBtn) {
    dom.openSearchBtn.addEventListener('click', () => toggleSearchBar());
  }
  if (dom.closeSearchBtn) {
    dom.closeSearchBtn.addEventListener('click', () => toggleSearchBar(false));
  }
  if (dom.headerSearchForm) {
    dom.headerSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      uiState.query = dom.headerSearchInput.value.trim();
      if (dom.collectionSearchInput) {
        dom.collectionSearchInput.value = uiState.query;
      }
      renderProductsGrid(true);
      toggleSearchBar(false);
      const col = document.getElementById('collections');
      if (col) col.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (dom.openMobileMenuBtn) dom.openMobileMenuBtn.addEventListener('click', openMobileMenu);
  if (dom.closeMobileMenuBtn) dom.closeMobileMenuBtn.addEventListener('click', closeMobileMenu);
  if (dom.mobileBackdrop) dom.mobileBackdrop.addEventListener('click', closeMobileMenu);

  // Quick category jump buttons (Mobile nav + Footer)
  document.addEventListener('click', (e) => {
    const catBtn = e.target.closest('[data-quick-cat]');
    if (!catBtn) return;
    const cat = catBtn.getAttribute('data-quick-cat');
    uiState.category = Catalog.getCategories().includes(cat) ? cat : 'All';
    uiState.wishlistOnly = false;
    if (dom.toggleWishlistFilter) {
      dom.toggleWishlistFilter.classList.remove('is-active');
      dom.toggleWishlistFilter.setAttribute('aria-pressed', 'false');
    }
    renderCategoryTabs();
    renderProductsGrid(true);
    closeMobileMenu();
    const col = document.getElementById('collections');
    if (col) col.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (dom.categoryTabs) {
    dom.categoryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-category]');
      if (!tab) return;
      uiState.category = tab.getAttribute('data-category');
      renderCategoryTabs();
      renderProductsGrid(true);
    });
  }

  if (dom.collectionSearchInput) {
    dom.collectionSearchInput.addEventListener('input', () => {
      uiState.query = dom.collectionSearchInput.value;
      renderProductsGrid(false);
    });
  }

  if (dom.collectionSortSelect) {
    dom.collectionSortSelect.addEventListener('change', () => {
      uiState.sort = dom.collectionSortSelect.value;
      renderProductsGrid(true);
    });
  }

  if (dom.toggleWishlistFilter) {
    dom.toggleWishlistFilter.addEventListener('click', () => {
      uiState.wishlistOnly = !uiState.wishlistOnly;
      dom.toggleWishlistFilter.classList.toggle('is-active', uiState.wishlistOnly);
      dom.toggleWishlistFilter.setAttribute('aria-pressed', String(uiState.wishlistOnly));
      renderProductsGrid(true);
    });
  }

  if (dom.resetFiltersBtn) {
    dom.resetFiltersBtn.addEventListener('click', () => {
      uiState.category = 'All';
      uiState.query = '';
      uiState.sort = 'featured';
      uiState.wishlistOnly = false;
      if (dom.collectionSearchInput) dom.collectionSearchInput.value = '';
      if (dom.collectionSortSelect) dom.collectionSortSelect.value = 'featured';
      if (dom.toggleWishlistFilter) {
        dom.toggleWishlistFilter.classList.remove('is-active');
        dom.toggleWishlistFilter.setAttribute('aria-pressed', 'false');
      }
      renderCategoryTabs();
      renderProductsGrid(true);
    });
  }

  // Product Grid + Card Interactions
  document.addEventListener('click', (e) => {
    const wishBtn = e.target.closest('[data-wishlist-toggle]');
    if (wishBtn && Cart) {
      e.stopPropagation();
      const pid = wishBtn.getAttribute('data-wishlist-toggle');
      const added = Cart.toggleWishlist(pid);
      showToast(added ? 'Saved to your wishlist.' : 'Removed from wishlist.');
      if (uiState.wishlistOnly) renderProductsGrid(false);
      return;
    }

    const colorBtn = e.target.closest('[data-card-color]');
    if (colorBtn) {
      const pid = colorBtn.getAttribute('data-pid');
      const colorName = colorBtn.getAttribute('data-card-color');
      const product = Catalog.getProductById(pid);
      if (product) {
        const colorObj = Catalog.getColorVariant(product, colorName);
        uiState.cardSelections[pid] = {
          color: colorObj ? colorObj.colorName : colorName,
          size: Catalog.getDefaultInStockSize(colorObj)
        };
        updateSingleProductCardDom(pid);
      }
      return;
    }

    const sizeBtn = e.target.closest('[data-card-size]');
    if (sizeBtn) {
      if (sizeBtn.disabled) return;
      const pid = sizeBtn.getAttribute('data-pid');
      const sizeVal = sizeBtn.getAttribute('data-card-size');
      const product = Catalog.getProductById(pid);
      if (product) {
        const sel = getCardSelection(product);
        sel.size = sizeVal;
        updateSingleProductCardDom(pid);
      }
      return;
    }

    const addBtn = e.target.closest('[data-add-cart]');
    if (addBtn && Cart) {
      if (addBtn.disabled) return;
      const pid = addBtn.getAttribute('data-add-cart');
      const product = Catalog.getProductById(pid);
      if (product) {
        const sel = getCardSelection(product);
        const colorObj = Catalog.getColorVariant(product, sel.color);
        const sizeObj = Catalog.getSizeEntry(colorObj, sel.size);
        if (!sizeObj || sizeObj.stock <= 0) {
          showToast('Selected size is currently out of stock.');
          return;
        }
        Cart.addItem(product, {
          size: sizeObj.size,
          color: colorObj.colorName,
          image: colorObj.images[0] || product.defaultImage,
          sku: product.sku,
          maxStock: sizeObj.stock,
          quantity: 1
        });
        if (Animations) Animations.bumpCartBadge();
        showToast(`${product.name} (${colorObj.colorName}, ${sizeObj.size}) added to shopping bag.`);
      }
      return;
    }

    const detailTrigger = e.target.closest('[data-open-detail]');
    if (detailTrigger) {
      const pid = detailTrigger.getAttribute('data-open-detail');
      openProductDetail(pid);
    }
  });

  // Product Detail Modal Controls
  if (dom.pdThumbnails) {
    dom.pdThumbnails.addEventListener('click', (e) => {
      const thumb = e.target.closest('[data-thumb-src]');
      if (!thumb) return;
      dom.pdMainImage.src = thumb.getAttribute('data-thumb-src');
      dom.pdThumbnails.querySelectorAll('.pd-thumb-btn').forEach((b) => {
        b.classList.toggle('is-active', b === thumb);
      });
    });
  }

  if (dom.pdColorList) {
    dom.pdColorList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-modal-color]');
      if (!btn || !uiState.activeProduct) return;
      uiState.modalColor = btn.getAttribute('data-modal-color');
      const colorObj = Catalog.getColorVariant(uiState.activeProduct, uiState.modalColor);
      uiState.modalSize = Catalog.getDefaultInStockSize(colorObj);
      uiState.modalQty = 1;
      renderModalGalleryForColor(uiState.activeProduct, colorObj);
      renderModalVariants();
    });
  }

  if (dom.pdSizeList) {
    dom.pdSizeList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-modal-size]');
      if (!btn || btn.disabled) return;
      uiState.modalSize = btn.getAttribute('data-modal-size');
      uiState.modalQty = 1;
      renderModalVariants();
    });
  }

  if (dom.pdSizeGuideToggle && dom.pdSizeGuidePanel) {
    dom.pdSizeGuideToggle.addEventListener('click', () => {
      dom.pdSizeGuidePanel.hidden = !dom.pdSizeGuidePanel.hidden;
    });
  }

  if (dom.pdQtyMinus) {
    dom.pdQtyMinus.addEventListener('click', () => {
      if (dom.pdQtyMinus.disabled) return;
      uiState.modalQty = Math.max(1, uiState.modalQty - 1);
      renderModalVariants();
    });
  }

  if (dom.pdQtyPlus) {
    dom.pdQtyPlus.addEventListener('click', () => {
      if (!uiState.activeProduct || dom.pdQtyPlus.disabled) return;
      const colorObj = Catalog.getColorVariant(uiState.activeProduct, uiState.modalColor);
      const sizeObj = Catalog.getSizeEntry(colorObj, uiState.modalSize);
      const maxCap = Math.min(20, sizeObj ? sizeObj.stock : 0);
      uiState.modalQty = Math.min(maxCap, uiState.modalQty + 1);
      renderModalVariants();
    });
  }

  if (dom.pdWishlistBtn && Cart) {
    dom.pdWishlistBtn.addEventListener('click', () => {
      if (!uiState.activeProduct) return;
      const added = Cart.toggleWishlist(uiState.activeProduct.id);
      showToast(added ? 'Saved to wishlist.' : 'Removed from wishlist.');
    });
  }

  function addActiveModalProductToCart() {
    if (!uiState.activeProduct || !Cart) return false;
    const colorObj = Catalog.getColorVariant(uiState.activeProduct, uiState.modalColor);
    const sizeObj = Catalog.getSizeEntry(colorObj, uiState.modalSize);
    if (!colorObj || !sizeObj || sizeObj.stock <= 0 || colorObj.totalStock <= 0) {
      showToast('This colour/size combination is currently out of stock.');
      return false;
    }

    Cart.addItem(uiState.activeProduct, {
      size: sizeObj.size,
      color: colorObj.colorName,
      image: colorObj.images[0] || uiState.activeProduct.defaultImage,
      sku: uiState.activeProduct.sku,
      maxStock: sizeObj.stock,
      quantity: Math.min(sizeObj.stock, Math.max(1, uiState.modalQty || 1))
    });
    if (Animations) Animations.bumpCartBadge();
    return true;
  }

  if (dom.pdAddToCartBtn) {
    dom.pdAddToCartBtn.addEventListener('click', () => {
      if (addActiveModalProductToCart()) {
        showToast(`${uiState.activeProduct.name} (${uiState.modalColor}, ${uiState.modalSize}) added to bag.`);
      }
    });
  }

  if (dom.pdBuyNowBtn) {
    dom.pdBuyNowBtn.addEventListener('click', () => {
      if (addActiveModalProductToCart()) {
        openCheckout();
      }
    });
  }

  // Drawers
  if (dom.openCartBtn) {
    dom.openCartBtn.addEventListener('click', () => openDrawer(dom.cartDrawer));
  }
  if (dom.openWishlistBtn) {
    dom.openWishlistBtn.addEventListener('click', () => openDrawer(dom.wishlistDrawer));
  }
  if (dom.drawerBackdrop) {
    dom.drawerBackdrop.addEventListener('click', () => closeAllDrawers());
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-drawer]')) closeAllDrawers();
    if (e.target.closest('[data-close-modal]')) closeAllModals();
    if (e.target.closest('#empty-bag-explore-btn')) {
      closeAllDrawers();
      const col = document.getElementById('collections');
      if (col) col.scrollIntoView({ behavior: 'smooth' });
    }
  });

  if (dom.cartItemsContainer && Cart) {
    dom.cartItemsContainer.addEventListener('click', (e) => {
      const minusBtn = e.target.closest('[data-line-minus]');
      if (minusBtn) {
        const key = minusBtn.getAttribute('data-line-minus');
        const item = Cart.getStateSnapshot().items.find((i) => i.key === key);
        if (item) Cart.updateQuantity(key, item.quantity - 1);
        return;
      }

      const plusBtn = e.target.closest('[data-line-plus]');
      if (plusBtn) {
        const key = plusBtn.getAttribute('data-line-plus');
        const item = Cart.getStateSnapshot().items.find((i) => i.key === key);
        if (item) {
          const liveProd = Catalog.getProductById(item.id);
          const col = Catalog.getColorVariant(liveProd, item.color);
          const sz = Catalog.getSizeEntry(col, item.size);
          const maxStock = sz ? sz.stock : item.maxStock;
          Cart.updateQuantity(key, item.quantity + 1, maxStock);
        }
        return;
      }

      const remBtn = e.target.closest('[data-remove-line]');
      if (remBtn) {
        Cart.removeItem(remBtn.getAttribute('data-remove-line'));
        showToast('Item removed from shopping bag.');
      }
    });
  }

  if (dom.clearCartBtn && Cart) {
    dom.clearCartBtn.addEventListener('click', () => {
      Cart.clearCart();
      showToast('Shopping bag cleared.');
    });
  }

  if (dom.proceedCheckoutBtn) {
    dom.proceedCheckoutBtn.addEventListener('click', openCheckout);
  }
  if (dom.checkoutForm) {
    dom.checkoutForm.addEventListener('submit', handleCheckoutSubmit);
  }

  if (dom.copyDraftBtn) {
    dom.copyDraftBtn.addEventListener('click', () => {
      if (navigator.clipboard && uiState.lastDraftText) {
        navigator.clipboard
          .writeText(uiState.lastDraftText)
          .then(() => showToast('Order request summary copied to clipboard.'))
          .catch(() => showToast('Summary ready for reference above.'));
      } else {
        showToast('Summary ready for reference above.');
      }
    });
  }

  if (dom.openStoryBtn) {
    dom.openStoryBtn.addEventListener('click', () => openModal(dom.storyModal));
  }

  if (dom.openAccountBtn && Cart) {
    dom.openAccountBtn.addEventListener('click', () => {
      renderAccountDrafts(Cart.getStateSnapshot().orderDrafts);
      openModal(dom.accountModal);
    });
  }

  document.addEventListener('click', (e) => {
    const waTrigger = e.target.closest('.whatsapp-placeholder-trigger');
    if (waTrigger) {
      const waHref = buildWhatsappHref(
        uiState.contact.whatsappNumber,
        `Hello ${uiState.contact.boutiqueName || 'KAARIGAI'}, I would like to enquire about your collection.`
      );
      if (waHref) {
        window.open(waHref, '_blank', 'noopener,noreferrer');
      } else {
        openModal(dom.whatsappModal);
      }
      return;
    }

    const igTrigger = e.target.closest('#footer-instagram-btn');
    if (igTrigger) {
      if (!isValidHttpUrl(uiState.contact.instagramUrl)) {
        e.preventDefault();
        showToast('Instagram profile link is not configured in Admin Contact Settings yet.');
      }
    }
  });

  if (dom.contactForm) {
    dom.contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nameEl = document.getElementById('contact-name');
      const msgEl = document.getElementById('contact-message');
      const interestEl = document.getElementById('contact-interest');
      const timeEl = document.getElementById('contact-visit-time');

      const name = nameEl.value.trim();
      const msg = msgEl.value.trim();

      dom.contactFeedback.hidden = false;
      if (name.length < 2 || msg.length < 6) {
        dom.contactFeedback.className = 'form-feedback-box is-error';
        dom.contactFeedback.textContent =
          'Please provide your name and a brief message about your styling or store enquiry.';
        return;
      }

      const teamLabel = uiState.contact.boutiqueName || uiState.contact.businessName || 'our boutique team';
      dom.contactFeedback.className = 'form-feedback-box';
      dom.contactFeedback.innerHTML =
        `<strong>Enquiry Prepared:</strong> Thank you, ${escapeHtml(name)}. Your interest in ` +
        `<em>${escapeHtml(interestEl.value)}</em> (${escapeHtml(timeEl.value)}) is ready for ${escapeHtml(teamLabel)}.`;
      dom.contactForm.reset();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      closeAllDrawers();
      closeMobileMenu();
      toggleSearchBar(false);
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY + 140;
      const contactEl = document.getElementById('contact');
      const colEl = document.getElementById('collections');

      if (contactEl && y >= contactEl.offsetTop) {
        setActiveNav('contact');
      } else if (colEl && y >= colEl.offsetTop) {
        setActiveNav('collections');
      } else if (window.scrollY > window.innerHeight * 0.8) {
        setActiveNav('about');
      } else {
        setActiveNav('home');
      }
    },
    { passive: true }
  );
}

/* =========================================================================
   HERO BACKGROUND SLIDESHOW (3-Second Smooth Crossfade)
   ========================================================================= */

function initHeroSlideshow() {
  const container = document.getElementById('hero-bg-slideshow');
  if (!container) return;

  const slides = container.querySelectorAll('.hero-bg-slide');
  if (slides.length < 2) return;

  let activeIndex = 0;
  let leavingTimer = null;

  slides.forEach((slide, index) => {
    slide.classList.remove('is-leaving', 'is-active');
    if (index === 0) slide.classList.add('is-active');
  });

  window.setInterval(() => {
    const prevIndex = activeIndex;
    activeIndex = (activeIndex + 1) % slides.length;

    slides.forEach((slide, index) => {
      slide.classList.remove('is-leaving', 'is-active');
      if (index === prevIndex) {
        slide.classList.add('is-leaving');
      } else if (index === activeIndex) {
        slide.classList.add('is-active');
      }
    });

    if (leavingTimer) {
      window.clearTimeout(leavingTimer);
    }
    leavingTimer = window.setTimeout(() => {
      if (slides[prevIndex]) {
        slides[prevIndex].classList.remove('is-leaving');
      }
    }, 1250);
  }, 3000);
}

function renderStoreContact(rawContact, contactStatus = 'ready', contactError = null) {
  const c = normalizeContactDoc(rawContact);
  uiState.contact = c;
  const configured = hasContactConfigured(c);

  const displayBoutique = c.boutiqueName || c.businessName || 'KAARIGAI Boutique';
  const displayBusiness = c.businessName || c.boutiqueName || 'KAARIGAI';
  const fullAddr = formatFullAddress(c);
  const hoursStr = formatBusinessHours(c);
  const waHref = buildWhatsappHref(c.whatsappNumber);
  const telHref = buildPhoneHref(c.mobileNumber);
  const igHandle = formatInstagramHandle(c.instagramUsername);
  const igUrlValid = isValidHttpUrl(c.instagramUrl);
  const fbUrlValid = isValidHttpUrl(c.facebookUrl);
  const mapsValid = isValidHttpUrl(c.googleMapsUrl);

  if (dom.contactBoutiqueHeading) dom.contactBoutiqueHeading.textContent = displayBoutique;
  if (dom.contactCardBadge) {
    dom.contactCardBadge.textContent = c.city ? `${c.city} Boutique` : displayBoutique;
  }
  if (dom.contactBusinessName) dom.contactBusinessName.textContent = displayBusiness;

  if (dom.contactAddressText) {
    if (fullAddr) {
      dom.contactAddressText.textContent = fullAddr;
    } else if (contactStatus === 'error' && contactError) {
      dom.contactAddressText.textContent = contactError;
    } else if (contactStatus === 'loading') {
      dom.contactAddressText.textContent = 'Loading boutique address from live settings...';
    } else {
      dom.contactAddressText.textContent = 'Boutique address will appear here once configured in Admin Settings.';
    }
  }

  if (dom.contactHoursText) {
    dom.contactHoursText.textContent =
      hoursStr || (contactStatus === 'loading' ? 'Loading business hours...' : 'Hours pending boutique configuration.');
  }

  if (dom.contactMobileItem && dom.contactMobileLink) {
    if (c.mobileNumber && telHref) {
      dom.contactMobileItem.hidden = false;
      dom.contactMobileLink.textContent = c.mobileNumber;
      dom.contactMobileLink.href = telHref;
    } else {
      dom.contactMobileItem.hidden = true;
    }
  }

  if (dom.contactWhatsappText) {
    if (c.whatsappNumber && waHref) {
      dom.contactWhatsappText.innerHTML =
        `<a class="contact-inline-link" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.whatsappNumber)}</a> &bull; Direct boutique WhatsApp chat`;
    } else if (c.whatsappNumber) {
      dom.contactWhatsappText.textContent = c.whatsappNumber;
    } else {
      dom.contactWhatsappText.textContent =
        configured
          ? 'WhatsApp concierge number not added yet.'
          : 'WhatsApp concierge details will appear once configured in Admin Settings.';
    }
  }

  if (dom.contactWhatsappBtnLabel) {
    dom.contactWhatsappBtnLabel.textContent = waHref ? 'Chat on WhatsApp' : 'WhatsApp Concierge';
  }

  if (dom.contactEmailItem && dom.contactEmailLink) {
    if (c.contactEmail) {
      dom.contactEmailItem.hidden = false;
      dom.contactEmailLink.textContent = c.contactEmail;
      dom.contactEmailLink.href = `mailto:${c.contactEmail}`;
    } else {
      dom.contactEmailItem.hidden = true;
    }
  }

  if (dom.contactSocialItem && dom.contactSocialLinks) {
    const socialParts = [];
    if (igHandle && igUrlValid) {
      socialParts.push(
        `<a class="contact-inline-link" href="${escapeHtml(c.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram (${escapeHtml(igHandle)})</a>`
      );
    } else if (igUrlValid) {
      socialParts.push(
        `<a class="contact-inline-link" href="${escapeHtml(c.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram Profile</a>`
      );
    } else if (igHandle) {
      socialParts.push(`<span>Instagram: ${escapeHtml(igHandle)}</span>`);
    }

    if (fbUrlValid) {
      socialParts.push(
        `<a class="contact-inline-link" href="${escapeHtml(c.facebookUrl)}" target="_blank" rel="noopener noreferrer">Facebook Page</a>`
      );
    }

    if (socialParts.length) {
      dom.contactSocialItem.hidden = false;
      dom.contactSocialLinks.innerHTML = socialParts.join(' ');
    } else {
      dom.contactSocialItem.hidden = true;
      dom.contactSocialLinks.innerHTML = '';
    }
  }

  if (dom.contactAdditionalItem && dom.contactAdditionalText) {
    if (c.additionalInfo) {
      dom.contactAdditionalItem.hidden = false;
      dom.contactAdditionalText.textContent = c.additionalInfo;
    } else {
      dom.contactAdditionalItem.hidden = true;
    }
  }

  if (dom.contactMapsBtn) {
    dom.contactMapsBtn.hidden = !mapsValid;
    dom.contactMapsBtn.href = mapsValid ? c.googleMapsUrl : '#';
  }

  // Update Footer Contacts
  if (dom.footerStoreHeading) {
    dom.footerStoreHeading.textContent = c.city ? `${c.city} Boutique` : displayBoutique;
  }
  if (dom.footerAddress) {
    if (fullAddr || c.businessName) {
      const addrLines = [c.businessName ? escapeHtml(c.businessName) : '', fullAddr ? escapeHtml(fullAddr) : '']
        .filter(Boolean)
        .join('<br />');
      dom.footerAddress.innerHTML = addrLines;
    } else {
      dom.footerAddress.textContent = 'Boutique address will appear once saved in Admin Settings.';
    }
  }
  if (dom.footerHoursText) {
    dom.footerHoursText.textContent = hoursStr || 'Configured in Admin Settings';
  }
  if (dom.footerContactMeta) {
    const metaLines = [];
    if (c.mobileNumber && telHref) {
      metaLines.push(`<div><strong>Phone:</strong> <a href="${escapeHtml(telHref)}">${escapeHtml(c.mobileNumber)}</a></div>`);
    }
    if (c.whatsappNumber && waHref) {
      metaLines.push(`<div><strong>WhatsApp:</strong> <a href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.whatsappNumber)}</a></div>`);
    }
    if (c.contactEmail) {
      metaLines.push(`<div><strong>Email:</strong> <a href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a></div>`);
    }
    if (igHandle) {
      metaLines.push(
        igUrlValid
          ? `<div><strong>Instagram:</strong> <a href="${escapeHtml(c.instagramUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(igHandle)}</a></div>`
          : `<div><strong>Instagram:</strong> ${escapeHtml(igHandle)}</div>`
      );
    }
    if (c.additionalInfo) {
      metaLines.push(`<div>${escapeHtml(c.additionalInfo)}</div>`);
    }
    dom.footerContactMeta.hidden = metaLines.length === 0;
    dom.footerContactMeta.innerHTML = metaLines.join('');
  }
  if (dom.footerMapLink) {
    dom.footerMapLink.hidden = !mapsValid;
    dom.footerMapLink.href = mapsValid ? c.googleMapsUrl : '#';
  }
  if (dom.footerInstagramBtn) {
    dom.footerInstagramBtn.href = igUrlValid ? c.instagramUrl : '#';
  }
  if (dom.footerInstagramLabel) {
    dom.footerInstagramLabel.textContent = igHandle ? `Instagram (${igHandle})` : 'Instagram';
  }
  if (dom.footerFacebookBtn) {
    dom.footerFacebookBtn.hidden = !fbUrlValid;
    dom.footerFacebookBtn.href = fbUrlValid ? c.facebookUrl : '#';
  }
  if (dom.footerCopyrightName) {
    dom.footerCopyrightName.textContent = displayBusiness;
  }

  // Mobile Nav Drawer + Story / WhatsApp Modals
  if (dom.mobileStoreLabel) dom.mobileStoreLabel.textContent = displayBusiness;
  if (dom.mobileStoreMeta) {
    const locSummary = [c.city, c.state].filter(Boolean).join(', ');
    const metaText = [locSummary, hoursStr].filter(Boolean).join(' • ');
    dom.mobileStoreMeta.textContent = metaText || 'Visit Admin Settings to publish boutique hours & location';
  }
  if (dom.storyModalBoutiqueMeta) {
    if (fullAddr || hoursStr) {
      const parts = [];
      if (fullAddr) parts.push(`Located at <strong>${escapeHtml(fullAddr)}</strong>`);
      if (hoursStr) parts.push(`open <strong>${escapeHtml(hoursStr)}</strong>`);
      dom.storyModalBoutiqueMeta.innerHTML = `${parts.join(', ')} with unhurried personal styling.`;
    } else {
      dom.storyModalBoutiqueMeta.textContent =
        'Visit our showroom to experience these textiles up close with unhurried personal styling.';
    }
  }
  if (dom.waModalStoreAddress) {
    dom.waModalStoreAddress.textContent = fullAddr
      ? `${displayBusiness} • ${fullAddr}`
      : 'Boutique location details will appear once configured in Admin Settings.';
  }
  if (dom.waModalStoreHours) {
    dom.waModalStoreHours.textContent = hoursStr ? `Hours: ${hoursStr}` : '';
  }
  if (dom.waModalMapsLink) {
    dom.waModalMapsLink.hidden = !mapsValid;
    dom.waModalMapsLink.href = mapsValid ? c.googleMapsUrl : '#';
  }
}

function handleCatalogUpdate(payload) {
  renderCategoryTabs();
  renderStoreContact(payload.contact, payload.contactStatus, payload.contactError);
  const shouldAnimate =
    payload.status === 'ready' && !uiState.hasAnimatedInitialProducts && payload.products.length > 0;
  if (shouldAnimate) {
    uiState.hasAnimatedInitialProducts = true;
  }
  renderProductsGrid(shouldAnimate);

  const Cart = getCart();
  if (Cart) {
    renderCartAndWishlist(Cart.getStateSnapshot());
  }

  // Keep open Product Detail Modal synchronized with live Firestore changes
  if (uiState.activeProduct && dom.productModal && !dom.productModal.hidden) {
    const refreshed = Catalog.getProductById(uiState.activeProduct.id);
    if (!refreshed) {
      closeAllModals();
      uiState.activeProduct = null;
      showToast('This product is no longer available in the active collection.');
    } else {
      uiState.activeProduct = refreshed;
      populateProductModalContent();
    }
  }
}

function init() {
  cacheDom();

  if (dom.footerYear) {
    dom.footerYear.textContent = String(new Date().getFullYear());
  }

  initHeroSlideshow();

  const Cart = getCart();
  const Animations = getAnimations();

  if (Cart) {
    Cart.subscribe(renderCartAndWishlist);
    renderCartAndWishlist(Cart.getStateSnapshot());
  }

  Catalog.subscribe(handleCatalogUpdate);
  const initialStatus = Catalog.getStatus();
  renderStoreContact(Catalog.getContact(), initialStatus.contactStatus, initialStatus.contactError);
  renderCategoryTabs();
  renderProductsGrid(false);
  bindEvents();

  if (Animations && typeof Animations.init === 'function') {
    Animations.init();
  }

  if (window.location.hash === '#about' && Animations) {
    window.setTimeout(() => {
      Animations.scrollToAboutStage();
    }, 250);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
