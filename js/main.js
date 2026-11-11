/**
 * KAARIGAI – Clothing for Women
 * Main UI & Interactive Storefront Controller
 * ---------------------------------------------------------------------------
 * Connects catalogue rendering, product detail gallery modal, cart & wishlist
 * drawers, Firebase-ready checkout draft submission, navigation, and modals.
 */

(function (global) {
  'use strict';

  const Catalog = global.KAARIGAI_CATALOG;
  const Cart = global.KAARIGAI_CART;
  const Animations = global.KAARIGAI_ANIMATIONS;

  if (!Catalog || !Cart) return;

  // Inline SVG Templates (zero emojis or external icon libraries)
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

  // Application UI State
  const uiState = {
    category: 'All',
    query: '',
    sort: 'featured',
    wishlistOnly: false,
    cardSelections: {}, // { productId: { size, color } }
    activeProduct: null,
    modalQty: 1,
    modalSize: '',
    modalColor: '',
    lastDraftText: ''
  };

  // Cached DOM references
  const dom = {};

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
    dom.pdWishlistBtn = document.getElementById('pd-wishlist-btn');
    dom.pdTitle = document.getElementById('pd-title');
    dom.pdPrice = document.getElementById('pd-price');
    dom.pdDescription = document.getElementById('pd-description');
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

    window.setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 260);
    }, 2600);
  }

  /* =========================================================================
     HEADER, SEARCH & MOBILE NAVIGATION
     ========================================================================= */

  function handleHeaderScroll() {
    if (!dom.header) return;
    if (window.scrollY > 28) {
      dom.header.classList.add('is-scrolled');
    } else {
      dom.header.classList.remove('is-scrolled');
    }
  }

  function setActiveNav(key) {
    dom.navLinks.forEach(function (link) {
      if (link.getAttribute('data-nav') === key) {
        link.classList.add('is-active');
      } else {
        link.classList.remove('is-active');
      }
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
     COLLECTIONS & PRODUCT GRID
     ========================================================================= */

  function getCardSelection(product) {
    if (!uiState.cardSelections[product.id]) {
      uiState.cardSelections[product.id] = {
        size: product.sizes[0] || 'Standard',
        color: product.colors[0] ? product.colors[0].name : 'Signature'
      };
    }
    return uiState.cardSelections[product.id];
  }

  function renderCategoryTabs() {
    if (!dom.categoryTabs) return;
    const allProducts = Catalog.getAllProducts();

    dom.categoryTabs.innerHTML = Catalog.CATEGORIES.map(function (cat) {
      const count =
        cat === 'All'
          ? allProducts.length
          : Catalog.filterProducts({ category: cat }).length;
      const isActive = uiState.category === cat;
      return (
        '<button type="button" role="tab" aria-selected="' +
        isActive +
        '" class="cat-tab' +
        (isActive ? ' is-active' : '') +
        '" data-category="' +
        escapeHtml(cat) +
        '">' +
        '<span>' +
        escapeHtml(cat) +
        '</span>' +
        '<span class="cat-count">(' +
        count +
        ')</span>' +
        '</button>'
      );
    }).join('');
  }

  function renderProductsGrid(shouldAnimate) {
    if (!dom.productsGrid) return;

    const snapshot = Cart.getStateSnapshot();
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
        ? 'curated sample pieces'
        : uiState.category.toLowerCase() + ' sample pieces';
      dom.resultsCountLabel.textContent =
        'Showing ' + filtered.length + ' ' + labelCat;
    }

    if (!filtered.length) {
      dom.productsGrid.innerHTML = '';
      if (dom.emptyResults) dom.emptyResults.hidden = false;
      if (Animations && typeof Animations.refresh === 'function') {
        window.requestAnimationFrame(Animations.refresh);
      }
      return;
    }

    if (dom.emptyResults) dom.emptyResults.hidden = true;

    dom.productsGrid.innerHTML = filtered
      .map(function (product) {
        const sel = getCardSelection(product);
        const wishlisted = Cart.isWishlisted(product.id);
        const primaryImg = product.images[0];
        const secondaryImg = product.images[1] || product.images[0];

        const colorsHtml = product.colors
          .map(function (c) {
            const active = sel.color === c.name ? ' is-selected' : '';
            return (
              '<button type="button" class="color-swatch-dot' +
              active +
              '" style="background-color:' +
              escapeHtml(c.hex) +
              '" data-card-color="' +
              escapeHtml(c.name) +
              '" data-pid="' +
              escapeHtml(product.id) +
              '" title="' +
              escapeHtml(c.name) +
              '" aria-label="Select colour ' +
              escapeHtml(c.name) +
              '"></button>'
            );
          })
          .join('');

        const sizesHtml = product.sizes
          .map(function (s) {
            const label = s.startsWith('Free Size') ? 'Free Size' : s;
            const active = sel.size === s ? ' is-selected' : '';
            return (
              '<button type="button" class="size-chip-mini' +
              active +
              '" data-card-size="' +
              escapeHtml(s) +
              '" data-pid="' +
              escapeHtml(product.id) +
              '">' +
              escapeHtml(label) +
              '</button>'
            );
          })
          .join('');

        return (
          '<article class="product-card" data-product-id="' +
          escapeHtml(product.id) +
          '">' +
          '<div class="product-media-wrap" data-open-detail="' +
          escapeHtml(product.id) +
          '">' +
          '<img class="product-img product-img-primary" src="' +
          escapeHtml(primaryImg) +
          '" alt="' +
          escapeHtml(product.name) +
          '" loading="lazy" />' +
          '<img class="product-img product-img-secondary" src="' +
          escapeHtml(secondaryImg) +
          '" alt="" aria-hidden="true" loading="lazy" />' +
          '<div class="product-card-top-overlay">' +
          '<span class="product-badge">' +
          escapeHtml(product.badge) +
          '</span>' +
          '<button type="button" class="card-wishlist-btn' +
          (wishlisted ? ' is-wishlisted' : '') +
          '" data-wishlist-toggle="' +
          escapeHtml(product.id) +
          '" aria-label="' +
          (wishlisted ? 'Remove from wishlist' : 'Save to wishlist') +
          '">' +
          SVG_ICONS.heart +
          '</button>' +
          '</div>' +
          '<span class="product-quickview-pill">View Details &amp; Gallery</span>' +
          '</div>' +
          '<div class="product-card-body">' +
          '<span class="product-cat-label">' +
          escapeHtml(product.category) +
          '</span>' +
          '<h3 class="product-title" data-open-detail="' +
          escapeHtml(product.id) +
          '">' +
          escapeHtml(product.name) +
          '</h3>' +
          '<div class="product-price-line">' +
          '<span class="product-price">' +
          Catalog.formatINR(product.samplePrice) +
          '</span>' +
          '<span class="product-price-note">Sample Demo</span>' +
          '</div>' +
          '<div class="product-variants-meta">' +
          '<div class="card-colors-row">' +
          '<span class="variant-mini-label">Colours:</span>' +
          colorsHtml +
          '</div>' +
          '<div class="card-sizes-row">' +
          '<span class="variant-mini-label">Sizes:</span>' +
          sizesHtml +
          '</div>' +
          '</div>' +
          '<div class="product-card-actions">' +
          '<button type="button" class="card-add-btn" data-add-cart="' +
          escapeHtml(product.id) +
          '">' +
          SVG_ICONS.cart +
          '<span>Add to Cart</span>' +
          '</button>' +
          '<button type="button" class="card-detail-btn" data-open-detail="' +
          escapeHtml(product.id) +
          '">Details</button>' +
          '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    if (shouldAnimate && Animations && typeof Animations.animateProductCards === 'function') {
      Animations.animateProductCards();
    }

    if (Animations && typeof Animations.refresh === 'function') {
      window.requestAnimationFrame(Animations.refresh);
    }
  }

  /* =========================================================================
     PRODUCT DETAIL MODAL
     ========================================================================= */

  function openProductDetail(productId) {
    const product = Catalog.getProductById(productId);
    if (!product || !dom.productModal) return;

    const sel = getCardSelection(product);
    uiState.activeProduct = product;
    uiState.modalSize = sel.size;
    uiState.modalColor = sel.color;
    uiState.modalQty = 1;

    dom.pdMainImage.src = product.images[0];
    dom.pdMainImage.alt = product.name;
    dom.pdBadge.textContent = product.badge;
    dom.pdCategory.textContent = product.category;
    dom.pdTitle.textContent = product.name;
    dom.pdPrice.textContent = Catalog.formatINR(product.samplePrice);
    dom.pdDescription.textContent = product.description;
    dom.pdFabric.textContent = product.fabric;
    dom.pdCare.textContent = product.care;
    dom.pdQtyValue.textContent = '1';
    if (dom.pdSizeGuidePanel) dom.pdSizeGuidePanel.hidden = true;

    syncModalWishlistButton();

    // Gallery Thumbnails
    const viewLabels = ['Full Look', 'Silhouette', 'Textile Detail'];
    dom.pdThumbnails.innerHTML = product.images
      .map(function (imgSrc, index) {
        return (
          '<button type="button" class="pd-thumb-btn' +
          (index === 0 ? ' is-active' : '') +
          '" data-thumb-src="' +
          escapeHtml(imgSrc) +
          '" aria-label="View ' +
          (viewLabels[index] || 'Angle ' + (index + 1)) +
          '">' +
          '<img src="' +
          escapeHtml(imgSrc) +
          '" alt="' +
          escapeHtml(product.name) +
          ' view ' +
          (index + 1) +
          '" />' +
          '</button>'
        );
      })
      .join('');

    renderModalVariants();
    renderRelatedProducts(product);

    openModal(dom.productModal);
    dom.productModal.querySelector('.modal-card').scrollTop = 0;
  }

  function syncModalWishlistButton() {
    if (!uiState.activeProduct || !dom.pdWishlistBtn) return;
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

    dom.pdColorName.textContent = uiState.modalColor;
    dom.pdColorList.innerHTML = product.colors
      .map(function (c) {
        const active = c.name === uiState.modalColor ? ' is-selected' : '';
        return (
          '<button type="button" class="pd-color-btn' +
          active +
          '" style="background-color:' +
          escapeHtml(c.hex) +
          '" data-modal-color="' +
          escapeHtml(c.name) +
          '" aria-label="Choose colour ' +
          escapeHtml(c.name) +
          '"></button>'
        );
      })
      .join('');

    dom.pdSizeName.textContent = uiState.modalSize;
    dom.pdSizeList.innerHTML = product.sizes
      .map(function (s) {
        const active = s === uiState.modalSize ? ' is-selected' : '';
        return (
          '<button type="button" class="pd-size-btn' +
          active +
          '" data-modal-size="' +
          escapeHtml(s) +
          '">' +
          escapeHtml(s) +
          '</button>'
        );
      })
      .join('');
  }

  function renderRelatedProducts(product) {
    if (!dom.pdRelatedGrid) return;
    const related = Catalog.getRelatedProducts(product, 3);
    dom.pdRelatedGrid.innerHTML = related
      .map(function (item) {
        return (
          '<button type="button" class="related-mini-card" data-open-detail="' +
          escapeHtml(item.id) +
          '">' +
          '<img src="' +
          escapeHtml(item.images[0]) +
          '" alt="' +
          escapeHtml(item.name) +
          '" loading="lazy" />' +
          '<div class="related-mini-body">' +
          '<h4>' +
          escapeHtml(item.name) +
          '</h4>' +
          '<span>' +
          Catalog.formatINR(item.samplePrice) +
          ' (Sample)</span>' +
          '</div>' +
          '</button>'
        );
      })
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
    document.querySelectorAll('.modal-overlay').forEach(function (m) {
      m.hidden = true;
    });
    if (unlockScroll !== false) {
      document.body.classList.remove('no-scroll');
    }
  }

  function renderCartAndWishlist(snapshot) {
    const state = snapshot || Cart.getStateSnapshot();

    // Update header badges
    if (dom.cartBadge) {
      dom.cartBadge.textContent = String(state.totals.itemCount);
      dom.cartBadge.classList.toggle('is-hidden', state.totals.itemCount === 0);
    }

    if (dom.wishlistBadge) {
      dom.wishlistBadge.textContent = String(state.wishlistIds.length);
      dom.wishlistBadge.classList.toggle('is-hidden', state.wishlistIds.length === 0);
    }

    // Cart Drawer Body
    if (dom.cartItemsContainer) {
      if (!state.items.length) {
        dom.cartItemsContainer.innerHTML =
          '<div class="drawer-empty">' +
          '<h3>Your Shopping Bag is Empty</h3>' +
          '<p>Explore silk sarees, handcrafted kurtis, and modern silhouettes to begin your selection.</p>' +
          '<button type="button" class="btn btn-primary" id="empty-bag-explore-btn">Explore Collections</button>' +
          '</div>';
        if (dom.cartDrawerFooter) dom.cartDrawerFooter.hidden = true;
      } else {
        if (dom.cartDrawerFooter) dom.cartDrawerFooter.hidden = false;
        dom.cartItemsContainer.innerHTML = state.items
          .map(function (item) {
            const lineSubtotal = item.unitPrice * item.quantity;
            return (
              '<div class="cart-line-item">' +
              '<img class="cart-line-thumb" src="' +
              escapeHtml(item.image) +
              '" alt="' +
              escapeHtml(item.name) +
              '" />' +
              '<div>' +
              '<div class="cart-line-top">' +
              '<h4 class="cart-line-title">' +
              escapeHtml(item.name) +
              '</h4>' +
              '<button type="button" class="cart-line-remove" data-remove-line="' +
              escapeHtml(item.key) +
              '" aria-label="Remove item">' +
              SVG_ICONS.trash +
              '</button>' +
              '</div>' +
              '<p class="cart-line-meta">Size: ' +
              escapeHtml(item.size) +
              ' • Colour: ' +
              escapeHtml(item.color) +
              '</p>' +
              '<div class="cart-line-bottom">' +
              '<div class="qty-control-mini">' +
              '<button type="button" data-line-minus="' +
              escapeHtml(item.key) +
              '" aria-label="Decrease quantity">' +
              SVG_ICONS.minus +
              '</button>' +
              '<span>' +
              item.quantity +
              '</span>' +
              '<button type="button" data-line-plus="' +
              escapeHtml(item.key) +
              '" aria-label="Increase quantity">' +
              SVG_ICONS.plus +
              '</button>' +
              '</div>' +
              '<span class="cart-line-price">' +
              Catalog.formatINR(lineSubtotal) +
              '</span>' +
              '</div>' +
              '</div>' +
              '</div>'
            );
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

    // Wishlist Drawer Body
    if (dom.wishlistItemsContainer) {
      const savedProducts = state.wishlistIds
        .map(function (id) {
          return Catalog.getProductById(id);
        })
        .filter(Boolean);

      if (!savedProducts.length) {
        dom.wishlistItemsContainer.innerHTML =
          '<div class="drawer-empty">' +
          '<h3>No Saved Pieces Yet</h3>' +
          '<p>Tap the heart icon on any KAARIGAI garment to keep a personal shortlist here.</p>' +
          '</div>';
      } else {
        dom.wishlistItemsContainer.innerHTML = savedProducts
          .map(function (prod) {
            return (
              '<div class="cart-line-item">' +
              '<img class="cart-line-thumb" src="' +
              escapeHtml(prod.images[0]) +
              '" alt="' +
              escapeHtml(prod.name) +
              '" />' +
              '<div>' +
              '<div class="cart-line-top">' +
              '<h4 class="cart-line-title">' +
              escapeHtml(prod.name) +
              '</h4>' +
              '<button type="button" class="cart-line-remove" data-wishlist-toggle="' +
              escapeHtml(prod.id) +
              '" aria-label="Remove from wishlist">' +
              SVG_ICONS.trash +
              '</button>' +
              '</div>' +
              '<p class="cart-line-meta">' +
              escapeHtml(prod.category) +
              ' • ' +
              Catalog.formatINR(prod.samplePrice) +
              ' (Sample)</p>' +
              '<div class="cart-line-bottom">' +
              '<button type="button" class="btn btn-sm btn-outline" data-open-detail="' +
              escapeHtml(prod.id) +
              '">View Piece</button>' +
              '<button type="button" class="btn btn-sm btn-primary" data-add-cart="' +
              escapeHtml(prod.id) +
              '">Add to Bag</button>' +
              '</div>' +
              '</div>' +
              '</div>'
            );
          })
          .join('');
      }
    }

    // Sync wishlist states inside grid and open modal
    syncGridWishlistIcons();
    syncModalWishlistButton();
    renderAccountDrafts(state.orderDrafts);
  }

  function syncGridWishlistIcons() {
    document.querySelectorAll('[data-wishlist-toggle]').forEach(function (btn) {
      const pid = btn.getAttribute('data-wishlist-toggle');
      if (btn.classList.contains('card-wishlist-btn')) {
        btn.classList.toggle('is-wishlisted', Cart.isWishlisted(pid));
      }
    });
  }

  /* =========================================================================
     CHECKOUT & FIREBASE-READY DRAFT FLOW
     ========================================================================= */

  function openCheckout() {
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
      .map(function (item) {
        return (
          '<div class="chk-mini-row">' +
          '<img src="' +
          escapeHtml(item.image) +
          '" alt="' +
          escapeHtml(item.name) +
          '" />' +
          '<div class="chk-mini-info">' +
          '<strong>' +
          escapeHtml(item.name) +
          '</strong>' +
          '<span>' +
          escapeHtml(item.size) +
          ' • ' +
          escapeHtml(item.color) +
          ' × ' +
          item.quantity +
          '</span>' +
          '</div>' +
          '<strong>' +
          Catalog.formatINR(item.unitPrice * item.quantity) +
          '</strong>' +
          '</div>'
        );
      })
      .join('');

    dom.checkoutSubtotal.textContent = Catalog.formatINR(state.totals.subtotal);
    dom.checkoutTotal.textContent = Catalog.formatINR(state.totals.total);

    openModal(dom.checkoutModal);
  }

  async function handleCheckoutSubmit(event) {
    event.preventDefault();
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
        name: name,
        mobile: mobileRaw,
        address: address,
        city: city,
        pincode: pincode,
        paymentMethod: paymentMethod
      });

      const draft = result.draft;
      const itemLines = draft.items
        .map(function (it) {
          return (
            '- ' +
            it.name +
            ' (' +
            it.size +
            ', ' +
            it.color +
            ') × ' +
            it.quantity +
            ' = ' +
            Catalog.formatINR(it.lineSubtotal)
          );
        })
        .join('\n');

      uiState.lastDraftText = [
        'KAARIGAI – Clothing for Women (Demo Order Request)',
        'Draft Ref: ' + draft.referenceId,
        'Status: Unconfirmed Demo Draft (Pending Backend/Store Verification)',
        'Customer: ' + draft.customer.name + ' (' + draft.customer.mobile + ')',
        'Address: ' +
          draft.customer.address +
          ', ' +
          draft.customer.city +
          ' - ' +
          draft.customer.pincode,
        'Payment Preference: ' + draft.payment.selectedMethod,
        'Items:',
        itemLines,
        'Sample Estimate: ' + Catalog.formatINR(draft.totals.sampleTotal)
      ].join('\n');

      dom.draftMetaBox.innerHTML =
        '<div><strong>Draft Reference:</strong> ' +
        escapeHtml(draft.referenceId) +
        '</div>' +
        '<div><strong>Status:</strong> Unconfirmed Demo Request (No Payment Processed)</div>' +
        '<div><strong>Customer:</strong> ' +
        escapeHtml(draft.customer.name) +
        ' • ' +
        escapeHtml(draft.customer.mobile) +
        '</div>' +
        '<div><strong>Delivery:</strong> ' +
        escapeHtml(draft.customer.address) +
        ', ' +
        escapeHtml(draft.customer.city) +
        ' - ' +
        escapeHtml(draft.customer.pincode) +
        '</div>' +
        '<div><strong>Payment Choice:</strong> ' +
        escapeHtml(draft.payment.selectedMethod) +
        '</div>' +
        '<div><strong>Sample Estimate:</strong> ' +
        Catalog.formatINR(draft.totals.sampleTotal) +
        '</div>';

      dom.checkoutFormView.hidden = true;
      dom.checkoutDraftResult.hidden = false;
      showToast('Order request draft saved locally (demo preview).');
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
        '<div class="account-draft-item">No local demo order drafts saved yet. Add a piece to your bag and create an order request draft from Checkout.</div>';
      return;
    }

    dom.accountDraftsList.innerHTML = drafts
      .map(function (d) {
        return (
          '<div class="account-draft-item">' +
          '<strong>' +
          escapeHtml(d.referenceId) +
          '</strong> — ' +
          Catalog.formatINR(d.totals.sampleTotal) +
          ' (' +
          d.items.length +
          ' item type' +
          (d.items.length === 1 ? '' : 's') +
          ')<br />' +
          '<span>Status: Demo Draft (Not Confirmed) • ' +
          escapeHtml(d.payment.selectedMethod) +
          '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  /* =========================================================================
     EVENT DELEGATION & BINDINGS
     ========================================================================= */

  function bindEvents() {
    window.addEventListener('scroll', handleHeaderScroll, { passive: true });
    handleHeaderScroll();

    // Smooth Navigation across Header, Hero & Footer anchors
    document.addEventListener('click', handleNavigationClick);

    // Search bar
    if (dom.openSearchBtn) {
      dom.openSearchBtn.addEventListener('click', function () {
        toggleSearchBar();
      });
    }
    if (dom.closeSearchBtn) {
      dom.closeSearchBtn.addEventListener('click', function () {
        toggleSearchBar(false);
      });
    }
    if (dom.headerSearchForm) {
      dom.headerSearchForm.addEventListener('submit', function (e) {
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

    // Mobile drawer
    if (dom.openMobileMenuBtn) dom.openMobileMenuBtn.addEventListener('click', openMobileMenu);
    if (dom.closeMobileMenuBtn) dom.closeMobileMenuBtn.addEventListener('click', closeMobileMenu);
    if (dom.mobileBackdrop) dom.mobileBackdrop.addEventListener('click', closeMobileMenu);

    // Quick category jump buttons (Mobile nav + Footer)
    document.addEventListener('click', function (e) {
      const catBtn = e.target.closest('[data-quick-cat]');
      if (!catBtn) return;
      const cat = catBtn.getAttribute('data-quick-cat');
      uiState.category = cat;
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

    // Category Tabs
    if (dom.categoryTabs) {
      dom.categoryTabs.addEventListener('click', function (e) {
        const tab = e.target.closest('[data-category]');
        if (!tab) return;
        uiState.category = tab.getAttribute('data-category');
        renderCategoryTabs();
        renderProductsGrid(true);
      });
    }

    // Inline Search, Wishlist Filter, Sort, Reset
    if (dom.collectionSearchInput) {
      dom.collectionSearchInput.addEventListener('input', function () {
        uiState.query = dom.collectionSearchInput.value;
        renderProductsGrid(false);
      });
    }

    if (dom.collectionSortSelect) {
      dom.collectionSortSelect.addEventListener('change', function () {
        uiState.sort = dom.collectionSortSelect.value;
        renderProductsGrid(true);
      });
    }

    if (dom.toggleWishlistFilter) {
      dom.toggleWishlistFilter.addEventListener('click', function () {
        uiState.wishlistOnly = !uiState.wishlistOnly;
        dom.toggleWishlistFilter.classList.toggle('is-active', uiState.wishlistOnly);
        dom.toggleWishlistFilter.setAttribute('aria-pressed', String(uiState.wishlistOnly));
        renderProductsGrid(true);
      });
    }

    if (dom.resetFiltersBtn) {
      dom.resetFiltersBtn.addEventListener('click', function () {
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

    // Product Grid + Card Interactions (Delegated)
    document.addEventListener('click', function (e) {
      // Wishlist Toggle (must come before detail trigger)
      const wishBtn = e.target.closest('[data-wishlist-toggle]');
      if (wishBtn) {
        e.stopPropagation();
        const pid = wishBtn.getAttribute('data-wishlist-toggle');
        const added = Cart.toggleWishlist(pid);
        showToast(added ? 'Saved to your wishlist.' : 'Removed from wishlist.');
        if (uiState.wishlistOnly) renderProductsGrid(false);
        return;
      }

      // Card Color Selection
      const colorBtn = e.target.closest('[data-card-color]');
      if (colorBtn) {
        const pid = colorBtn.getAttribute('data-pid');
        const colorName = colorBtn.getAttribute('data-card-color');
        const product = Catalog.getProductById(pid);
        if (product) {
          const sel = getCardSelection(product);
          sel.color = colorName;
          colorBtn
            .closest('.card-colors-row')
            .querySelectorAll('.color-swatch-dot')
            .forEach(function (dot) {
              dot.classList.toggle('is-selected', dot === colorBtn);
            });
        }
        return;
      }

      // Card Size Selection
      const sizeBtn = e.target.closest('[data-card-size]');
      if (sizeBtn) {
        const pid = sizeBtn.getAttribute('data-pid');
        const sizeVal = sizeBtn.getAttribute('data-card-size');
        const product = Catalog.getProductById(pid);
        if (product) {
          const sel = getCardSelection(product);
          sel.size = sizeVal;
          sizeBtn
            .closest('.card-sizes-row')
            .querySelectorAll('.size-chip-mini')
            .forEach(function (chip) {
              chip.classList.toggle('is-selected', chip === sizeBtn);
            });
        }
        return;
      }

      // Card Quick Add to Cart
      const addBtn = e.target.closest('[data-add-cart]');
      if (addBtn) {
        const pid = addBtn.getAttribute('data-add-cart');
        const product = Catalog.getProductById(pid);
        if (product) {
          const sel = getCardSelection(product);
          Cart.addItem(product, {
            size: sel.size,
            color: sel.color,
            quantity: 1
          });
          if (Animations) Animations.bumpCartBadge();
          showToast(product.name + ' added to shopping bag.');
        }
        return;
      }

      // Open Product Detail Modal
      const detailTrigger = e.target.closest('[data-open-detail]');
      if (detailTrigger) {
        const pid = detailTrigger.getAttribute('data-open-detail');
        openProductDetail(pid);
      }
    });

    // Product Detail Modal Controls
    if (dom.pdThumbnails) {
      dom.pdThumbnails.addEventListener('click', function (e) {
        const thumb = e.target.closest('[data-thumb-src]');
        if (!thumb) return;
        dom.pdMainImage.src = thumb.getAttribute('data-thumb-src');
        dom.pdThumbnails.querySelectorAll('.pd-thumb-btn').forEach(function (b) {
          b.classList.toggle('is-active', b === thumb);
        });
      });
    }

    if (dom.pdColorList) {
      dom.pdColorList.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-modal-color]');
        if (!btn) return;
        uiState.modalColor = btn.getAttribute('data-modal-color');
        renderModalVariants();
      });
    }

    if (dom.pdSizeList) {
      dom.pdSizeList.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-modal-size]');
        if (!btn) return;
        uiState.modalSize = btn.getAttribute('data-modal-size');
        renderModalVariants();
      });
    }

    if (dom.pdSizeGuideToggle && dom.pdSizeGuidePanel) {
      dom.pdSizeGuideToggle.addEventListener('click', function () {
        dom.pdSizeGuidePanel.hidden = !dom.pdSizeGuidePanel.hidden;
      });
    }

    if (dom.pdQtyMinus) {
      dom.pdQtyMinus.addEventListener('click', function () {
        uiState.modalQty = Math.max(1, uiState.modalQty - 1);
        dom.pdQtyValue.textContent = String(uiState.modalQty);
      });
    }

    if (dom.pdQtyPlus) {
      dom.pdQtyPlus.addEventListener('click', function () {
        uiState.modalQty = Math.min(20, uiState.modalQty + 1);
        dom.pdQtyValue.textContent = String(uiState.modalQty);
      });
    }

    if (dom.pdWishlistBtn) {
      dom.pdWishlistBtn.addEventListener('click', function () {
        if (!uiState.activeProduct) return;
        const added = Cart.toggleWishlist(uiState.activeProduct.id);
        showToast(added ? 'Saved to wishlist.' : 'Removed from wishlist.');
      });
    }

    if (dom.pdAddToCartBtn) {
      dom.pdAddToCartBtn.addEventListener('click', function () {
        if (!uiState.activeProduct) return;
        Cart.addItem(uiState.activeProduct, {
          size: uiState.modalSize,
          color: uiState.modalColor,
          quantity: uiState.modalQty
        });
        if (Animations) Animations.bumpCartBadge();
        showToast(uiState.activeProduct.name + ' added to bag.');
      });
    }

    if (dom.pdBuyNowBtn) {
      dom.pdBuyNowBtn.addEventListener('click', function () {
        if (!uiState.activeProduct) return;
        Cart.addItem(uiState.activeProduct, {
          size: uiState.modalSize,
          color: uiState.modalColor,
          quantity: uiState.modalQty
        });
        if (Animations) Animations.bumpCartBadge();
        openCheckout();
      });
    }

    // Drawer Open / Close Triggers
    if (dom.openCartBtn) {
      dom.openCartBtn.addEventListener('click', function () {
        openDrawer(dom.cartDrawer);
      });
    }

    if (dom.openWishlistBtn) {
      dom.openWishlistBtn.addEventListener('click', function () {
        openDrawer(dom.wishlistDrawer);
      });
    }

    if (dom.drawerBackdrop) {
      dom.drawerBackdrop.addEventListener('click', function () {
        closeAllDrawers();
      });
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-drawer]')) {
        closeAllDrawers();
      }
      if (e.target.closest('[data-close-modal]')) {
        closeAllModals();
      }
      if (e.target.closest('#empty-bag-explore-btn')) {
        closeAllDrawers();
        const col = document.getElementById('collections');
        if (col) col.scrollIntoView({ behavior: 'smooth' });
      }
    });

    // Cart Drawer Quantity & Removal Delegation
    if (dom.cartItemsContainer) {
      dom.cartItemsContainer.addEventListener('click', function (e) {
        const minusBtn = e.target.closest('[data-line-minus]');
        if (minusBtn) {
          const key = minusBtn.getAttribute('data-line-minus');
          const item = Cart.getStateSnapshot().items.find(function (i) {
            return i.key === key;
          });
          if (item) Cart.updateQuantity(key, item.quantity - 1);
          return;
        }

        const plusBtn = e.target.closest('[data-line-plus]');
        if (plusBtn) {
          const key = plusBtn.getAttribute('data-line-plus');
          const item = Cart.getStateSnapshot().items.find(function (i) {
            return i.key === key;
          });
          if (item) Cart.updateQuantity(key, item.quantity + 1);
          return;
        }

        const remBtn = e.target.closest('[data-remove-line]');
        if (remBtn) {
          Cart.removeItem(remBtn.getAttribute('data-remove-line'));
          showToast('Item removed from shopping bag.');
        }
      });
    }

    if (dom.clearCartBtn) {
      dom.clearCartBtn.addEventListener('click', function () {
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
      dom.copyDraftBtn.addEventListener('click', function () {
        if (navigator.clipboard && uiState.lastDraftText) {
          navigator.clipboard
            .writeText(uiState.lastDraftText)
            .then(function () {
              showToast('Order request summary copied to clipboard.');
            })
            .catch(function () {
              showToast('Summary ready for reference above.');
            });
        } else {
          showToast('Summary ready for reference above.');
        }
      });
    }

    // Story, Account & Placeholder Modals
    if (dom.openStoryBtn) {
      dom.openStoryBtn.addEventListener('click', function () {
        openModal(dom.storyModal);
      });
    }

    if (dom.openAccountBtn) {
      dom.openAccountBtn.addEventListener('click', function () {
        renderAccountDrafts(Cart.getStateSnapshot().orderDrafts);
        openModal(dom.accountModal);
      });
    }

    document.addEventListener('click', function (e) {
      if (e.target.closest('.whatsapp-placeholder-trigger')) {
        openModal(dom.whatsappModal);
      }
      if (e.target.closest('#footer-instagram-btn')) {
        showToast('Instagram showroom link placeholder — connect @kaarigai official handle when live.');
      }
    });

    // Contact Store Enquiry Form
    if (dom.contactForm) {
      dom.contactForm.addEventListener('submit', function (e) {
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

        dom.contactFeedback.className = 'form-feedback-box';
        dom.contactFeedback.innerHTML =
          '<strong>Enquiry Prepared (Frontend Demo):</strong> Thank you, ' +
          escapeHtml(name) +
          '. Your interest in <em>' +
          escapeHtml(interestEl.value) +
          '</em> (' +
          escapeHtml(timeEl.value) +
          ') is ready. Connect Firebase or WhatsApp Business to dispatch live notifications.';
        dom.contactForm.reset();
      });
    }

    // Escape Key Closes Modals, Drawers & Search
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeAllModals();
        closeAllDrawers();
        closeMobileMenu();
        toggleSearchBar(false);
      }
    });

    // Active Navigation Scroll Spy for Collections & Contact
    const sections = [
      { id: 'hero-about-stage', nav: 'home' },
      { id: 'collections', nav: 'collections' },
      { id: 'contact', nav: 'contact' }
    ];

    window.addEventListener(
      'scroll',
      function () {
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

  function init() {
    cacheDom();

    if (dom.footerYear) {
      dom.footerYear.textContent = String(new Date().getFullYear());
    }

    Cart.subscribe(renderCartAndWishlist);
    renderCategoryTabs();
    renderProductsGrid(false);
    renderCartAndWishlist(Cart.getStateSnapshot());
    bindEvents();

    if (Animations && typeof Animations.init === 'function') {
      Animations.init();
    }

    // Handle direct landing on #about hash cleanly
    if (window.location.hash === '#about' && Animations) {
      window.setTimeout(function () {
        Animations.scrollToAboutStage();
      }, 250);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
