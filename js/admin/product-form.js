/**
 * KAARIGAI – Admin Product Create & Edit Form Controller
 * ---------------------------------------------------------------------------
 * Manages:
 *   - Basic product details (Name, Price INR, Description, Category, Unique SKU)
 *   - Inline Firestore category creation directly from the form
 *   - Unlimited dynamic Color Variants within ONE single product document
 *   - Multi-select Sizes (XS..XXL) + per-size Stock Quantity inputs
 *   - Multiple Image URLs per Color with Add URL, Bulk Add URLs, Live Previews,
 *     Reordering (buttons + drag-drop), Remove, and Default Color/Image tracking
 */

import {
  STANDARD_SIZES,
  DEFAULT_CATEGORIES,
  isValidImageUrl
} from '../firebase-config.js';
import {
  createProduct,
  updateProduct,
  saveCategory,
  isSkuUnique,
  mapFirestoreError
} from './admin-service.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createEmptyVariant(seedIndex = 0) {
  const palette = [
    { name: '', hex: '#C6A66B' },
    { name: '', hex: '#38251F' },
    { name: '', hex: '#9E3A40' },
    { name: '', hex: '#2B5B4E' },
    { name: '', hex: '#D9A5A5' }
  ];
  const preset = palette[seedIndex % palette.length];
  return {
    uid: 'var_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    colorName: preset.name,
    colorCode: preset.hex,
    selectedSizes: ['S', 'M', 'L'],
    stockBySize: { XS: 5, S: 10, M: 10, L: 10, XL: 8, XXL: 5 },
    customSizes: [],
    images: [],
    bulkOpen: false
  };
}

export class ProductFormController {
  constructor(options) {
    this.getProducts = options.getProducts;
    this.getCategories = options.getCategories;
    this.showToast = options.showToast;
    this.onSaved = options.onSaved;
    this.onCancel = options.onCancel;

    this.mode = 'create'; // 'create' | 'edit'
    this.editingProductId = null;
    this.variants = [createEmptyVariant(0)];
    this.isSaving = false;
    this.dragState = null;

    this.cacheDom();
    this.bindEvents();
    this.syncCategoryDropdown();
    this.renderVariants();
  }

  cacheDom() {
    this.form = document.getElementById('product-editor-form');
    this.heading = document.getElementById('product-form-heading');
    this.subheading = document.getElementById('product-form-subheading');
    this.cancelBtn = document.getElementById('product-form-cancel-btn');
    this.errorBox = document.getElementById('product-form-errors');

    this.nameInput = document.getElementById('pf-name');
    this.priceInput = document.getElementById('pf-price');
    this.skuInput = document.getElementById('pf-sku');
    this.skuGenBtn = document.getElementById('pf-sku-gen-btn');
    this.skuStatusEl = document.getElementById('pf-sku-status');
    this.categorySelect = document.getElementById('pf-category');
    this.toggleNewCatBtn = document.getElementById('pf-toggle-new-cat-btn');
    this.inlineCatBox = document.getElementById('pf-inline-cat-box');
    this.inlineCatInput = document.getElementById('pf-inline-cat-name');
    this.inlineCatSaveBtn = document.getElementById('pf-inline-cat-save-btn');
    this.inlineCatCancelBtn = document.getElementById('pf-inline-cat-cancel-btn');

    this.descriptionInput = document.getElementById('pf-description');
    this.fabricInput = document.getElementById('pf-fabric');
    this.careInput = document.getElementById('pf-care');
    this.isActiveInput = document.getElementById('pf-is-active');

    this.variantsContainer = document.getElementById('color-variants-container');
    this.addColorBtn = document.getElementById('add-color-variant-btn');
    this.submitBtn = document.getElementById('product-form-submit-btn');
    this.resetBtn = document.getElementById('product-form-reset-btn');
  }

  syncCategoryDropdown(preferredSelection = '') {
    if (!this.categorySelect) return;
    const currentValue = preferredSelection || this.categorySelect.value || '';
    const firestoreCats = (this.getCategories() || []).map((c) => c.name);
    const merged = Array.from(new Set([...firestoreCats, ...DEFAULT_CATEGORIES]));

    this.categorySelect.innerHTML =
      '<option value="">Select Category</option>' +
      merged
        .map((catName) => `<option value="${escapeHtml(catName)}">${escapeHtml(catName)}</option>`)
        .join('');

    if (currentValue && merged.includes(currentValue)) {
      this.categorySelect.value = currentValue;
    } else if (currentValue) {
      const opt = document.createElement('option');
      opt.value = currentValue;
      opt.textContent = currentValue;
      this.categorySelect.appendChild(opt);
      this.categorySelect.value = currentValue;
    }
  }

  resetForCreate() {
    this.mode = 'create';
    this.editingProductId = null;
    this.variants = [createEmptyVariant(0)];
    if (this.form) this.form.reset();
    if (this.isActiveInput) this.isActiveInput.checked = true;
    this.syncCategoryDropdown();
    if (this.heading) this.heading.textContent = 'Add New Product';
    if (this.subheading) {
      this.subheading.textContent =
        'Create one unified product record with multiple colors, per-size stock, and curated image galleries.';
    }
    if (this.submitBtn) this.submitBtn.textContent = 'Save Product to Firestore';
    if (this.cancelBtn) this.cancelBtn.hidden = true;
    if (this.inlineCatBox) this.inlineCatBox.hidden = true;
    this.clearErrors();
    this.updateSkuStatus();
    this.renderVariants();
  }

  loadForEdit(product) {
    if (!product) return;
    this.mode = 'edit';
    this.editingProductId = product.id;
    this.clearErrors();

    this.nameInput.value = product.name || '';
    this.priceInput.value = String(product.price ?? 0);
    this.skuInput.value = product.sku || '';
    this.descriptionInput.value = product.description || '';
    this.fabricInput.value = product.fabric || '';
    this.careInput.value = product.care || '';
    this.isActiveInput.checked = product.isActive !== false;
    this.syncCategoryDropdown(product.category || '');

    // Ensure default color sits first at index 0
    const rawColors = Array.isArray(product.colors) ? product.colors.slice() : [];
    const defaultIdx = rawColors.findIndex((c) => c.colorName === product.defaultColor);
    if (defaultIdx > 0) {
      const [defCol] = rawColors.splice(defaultIdx, 1);
      rawColors.unshift(defCol);
    }

    this.variants = rawColors.length
      ? rawColors.map((col, idx) => {
          const selectedSizes = [];
          const stockBySize = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
          const customSizes = [];

          (col.sizes || []).forEach((s) => {
            selectedSizes.push(s.size);
            stockBySize[s.size] = Math.max(0, parseInt(s.stock, 10) || 0);
            if (!STANDARD_SIZES.includes(s.size)) {
              customSizes.push(s.size);
            }
          });

          return {
            uid: 'var_' + Date.now() + '_' + idx,
            colorName: col.colorName || '',
            colorCode: col.colorCode || '#C6A66B',
            selectedSizes,
            stockBySize,
            customSizes,
            images: Array.isArray(col.images) ? col.images.slice() : [],
            bulkOpen: false
          };
        })
      : [createEmptyVariant(0)];

    if (this.heading) this.heading.textContent = `Edit Product — ${product.name}`;
    if (this.subheading) {
      this.subheading.textContent = `Product ID: ${product.id} • Update pricing, default color, sizes, stock quantities, or image galleries.`;
    }
    if (this.submitBtn) this.submitBtn.textContent = 'Update Product';
    if (this.cancelBtn) this.cancelBtn.hidden = false;
    this.updateSkuStatus();
    this.renderVariants();
  }

  updateSkuStatus() {
    if (!this.skuStatusEl || !this.skuInput) return;
    const sku = this.skuInput.value.trim();
    if (!sku) {
      this.skuStatusEl.textContent = '';
      this.skuStatusEl.className = 'field-hint';
      return;
    }
    const unique = isSkuUnique(sku, this.getProducts(), this.editingProductId || '');
    if (unique) {
      this.skuStatusEl.textContent = 'Unique SKU available';
      this.skuStatusEl.className = 'field-hint is-success';
    } else {
      this.skuStatusEl.textContent = 'Duplicate SKU — already assigned to another product';
      this.skuStatusEl.className = 'field-hint is-error';
    }
  }

  generateSuggestedSku() {
    const cat = (this.categorySelect?.value || 'KRG').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'KRG';
    const namePart = (this.nameInput?.value || 'PIECE')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase() || 'ITEM';
    const rand = String(Math.floor(100 + Math.random() * 900));
    const candidate = `KRG-${cat}-${namePart}-${rand}`;
    if (this.skuInput) {
      this.skuInput.value = candidate;
      this.updateSkuStatus();
    }
  }

  clearErrors() {
    if (!this.errorBox) return;
    this.errorBox.hidden = true;
    this.errorBox.innerHTML = '';
  }

  showErrors(errors) {
    if (!this.errorBox) return;
    this.errorBox.innerHTML = `
      <strong>Please resolve the following before saving:</strong>
      <ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
    `;
    this.errorBox.hidden = false;
    this.errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderVariants() {
    if (!this.variantsContainer) return;

    this.variantsContainer.innerHTML = this.variants
      .map((variant, vIdx) => {
        const isDefault = vIdx === 0;
        const sizeChoices = [...STANDARD_SIZES, ...variant.customSizes];

        const sizeCheckboxesHtml = sizeChoices
          .map((sz) => {
            const checked = variant.selectedSizes.includes(sz);
            return `
              <label class="variant-size-check ${checked ? 'is-checked' : ''}">
                <input
                  type="checkbox"
                  data-variant-size-toggle="${vIdx}"
                  value="${escapeHtml(sz)}"
                  ${checked ? 'checked' : ''}
                />
                <span>${escapeHtml(sz)}</span>
              </label>
            `;
          })
          .join('');

        const stockInputsHtml = variant.selectedSizes.length
          ? variant.selectedSizes
              .map((sz) => {
                const qty = Math.max(0, parseInt(variant.stockBySize[sz], 10) || 0);
                return `
                  <div class="variant-stock-cell">
                    <label for="stock-${escapeHtml(variant.uid)}-${escapeHtml(sz)}">${escapeHtml(sz)}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      id="stock-${escapeHtml(variant.uid)}-${escapeHtml(sz)}"
                      data-variant-stock-input="${vIdx}"
                      data-size-key="${escapeHtml(sz)}"
                      value="${qty}"
                      placeholder="0"
                    />
                  </div>
                `;
              })
              .join('')
          : '<p class="variant-empty-hint">Select one or more sizes above to configure stock quantities.</p>';

        const imagesHtml = variant.images.length
          ? variant.images
              .map((url, imgIdx) => {
                const isMainDefault = isDefault && imgIdx === 0;
                return `
                  <div
                    class="variant-img-card"
                    draggable="true"
                    data-variant-index="${vIdx}"
                    data-img-index="${imgIdx}"
                  >
                    <div class="variant-img-preview-wrap">
                      <img
                        src="${escapeHtml(url)}"
                        alt="${escapeHtml(variant.colorName || 'Color')} preview ${imgIdx + 1}"
                        data-preview-img
                      />
                      <span class="variant-img-broken" hidden>Preview unavailable</span>
                      ${
                        isMainDefault
                          ? '<span class="variant-img-default-pill">Default Image</span>'
                          : imgIdx === 0
                          ? '<span class="variant-img-primary-pill">Main Look</span>'
                          : ''
                      }
                    </div>
                    <div class="variant-img-meta" title="${escapeHtml(url)}">${escapeHtml(url)}</div>
                    <div class="variant-img-actions">
                      <button
                        type="button"
                        class="btn-mini"
                        data-img-move="left"
                        data-v-idx="${vIdx}"
                        data-img-idx="${imgIdx}"
                        ${imgIdx === 0 ? 'disabled' : ''}
                        title="Move Left"
                        aria-label="Move image left"
                      >&larr;</button>
                      <button
                        type="button"
                        class="btn-mini"
                        data-img-move="right"
                        data-v-idx="${vIdx}"
                        data-img-idx="${imgIdx}"
                        ${imgIdx === variant.images.length - 1 ? 'disabled' : ''}
                        title="Move Right"
                        aria-label="Move image right"
                      >&rarr;</button>
                      <button
                        type="button"
                        class="btn-mini is-danger"
                        data-img-remove
                        data-v-idx="${vIdx}"
                        data-img-idx="${imgIdx}"
                        title="Remove image"
                        aria-label="Remove image"
                      >&times;</button>
                    </div>
                  </div>
                `;
              })
              .join('')
          : '<div class="variant-no-images">No images added yet for this color. Add at least one valid image URL above.</div>';

        const colorTotal = variant.selectedSizes.reduce(
          (acc, sz) => acc + Math.max(0, parseInt(variant.stockBySize[sz], 10) || 0),
          0
        );

        return `
          <article class="variant-card ${isDefault ? 'is-default-variant' : ''}" data-variant-card="${vIdx}">
            <header class="variant-card-header">
              <div class="variant-title-group">
                <span class="variant-swatch-preview" style="background-color:${escapeHtml(variant.colorCode)}"></span>
                <div>
                  <h4>
                    Color Variant #${vIdx + 1}
                    ${
                      isDefault
                        ? '<span class="admin-pill pill-gold">Default Product Color</span>'
                        : ''
                    }
                  </h4>
                  <p>${escapeHtml(variant.colorName || 'Unnamed shade')} • ${variant.selectedSizes.length} sizes • ${colorTotal} total units</p>
                </div>
              </div>
              <div class="variant-header-actions">
                ${
                  !isDefault
                    ? `<button type="button" class="admin-btn admin-btn-ghost admin-btn-sm" data-set-default-variant="${vIdx}">Make Default</button>`
                    : ''
                }
                <button
                  type="button"
                  class="admin-btn admin-btn-danger-ghost admin-btn-sm"
                  data-remove-variant="${vIdx}"
                  ${this.variants.length <= 1 ? 'disabled title="At least one color variant is required"' : ''}
                >Remove Color</button>
              </div>
            </header>

            <div class="variant-grid-two">
              <div class="admin-field">
                <label>Color Name <span class="req">*</span></label>
                <input
                  type="text"
                  data-variant-color-name="${vIdx}"
                  value="${escapeHtml(variant.colorName)}"
                  placeholder="e.g., Crimson Red, Jet Black, Emerald Green"
                  required
                />
              </div>

              <div class="admin-field">
                <label>Color Picker &amp; Hex Code <span class="req">*</span></label>
                <div class="color-picker-combo">
                  <input
                    type="color"
                    data-variant-color-picker="${vIdx}"
                    value="${escapeHtml(variant.colorCode)}"
                    aria-label="Pick color swatch"
                  />
                  <input
                    type="text"
                    data-variant-color-hex="${vIdx}"
                    value="${escapeHtml(variant.colorCode)}"
                    placeholder="#C6A66B"
                    maxlength="7"
                  />
                </div>
              </div>
            </div>

            <div class="variant-section-block">
              <div class="variant-section-head">
                <label>Available Sizes <span class="req">*</span></label>
                <div class="variant-quick-tools">
                  <button type="button" class="text-action-btn" data-select-all-sizes="${vIdx}">Select All (XS–XXL)</button>
                  <button type="button" class="text-action-btn" data-add-free-size="${vIdx}">+ Free Size</button>
                </div>
              </div>
              <div class="variant-size-checklist">
                ${sizeCheckboxesHtml}
              </div>
            </div>

            <div class="variant-section-block">
              <div class="variant-section-head">
                <label>Stock Quantity per Size <span class="req">*</span></label>
                <div class="bulk-stock-applier">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Qty"
                    data-bulk-stock-val="${vIdx}"
                    aria-label="Apply quantity to all checked sizes"
                  />
                  <button type="button" class="admin-btn admin-btn-outline admin-btn-xs" data-apply-bulk-stock="${vIdx}">
                    Apply to Checked Sizes
                  </button>
                </div>
              </div>
              <div class="variant-stock-grid">
                ${stockInputsHtml}
              </div>
            </div>

            <div class="variant-section-block">
              <div class="variant-section-head">
                <label>Color Gallery Image URLs <span class="req">*</span></label>
                <button type="button" class="text-action-btn" data-toggle-bulk-imgs="${vIdx}">
                  ${variant.bulkOpen ? 'Hide Bulk URL Input' : '+ Add Multiple URLs'}
                </button>
              </div>

              <div class="single-url-add-row">
                <input
                  type="url"
                  data-single-url-input="${vIdx}"
                  placeholder="https://example.com/dress-red-1.jpg or assets/products/..."
                />
                <button type="button" class="admin-btn admin-btn-outline" data-add-single-url="${vIdx}">
                  Add URL
                </button>
              </div>

              <div class="bulk-url-box" ${variant.bulkOpen ? '' : 'hidden'}>
                <textarea
                  rows="3"
                  data-bulk-url-input="${vIdx}"
                  placeholder="Paste multiple image URLs (one per line or comma-separated)..."
                ></textarea>
                <div class="bulk-url-actions">
                  <span class="field-hint">Tip: First image becomes the primary thumbnail for this color variant.</span>
                  <button type="button" class="admin-btn admin-btn-outline admin-btn-sm" data-add-bulk-urls="${vIdx}">
                    Add All URLs
                  </button>
                </div>
              </div>

              <div class="variant-images-grid">
                ${imagesHtml}
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    // Wire broken-image fallback listener on rendered previews
    this.variantsContainer.querySelectorAll('[data-preview-img]').forEach((imgEl) => {
      imgEl.addEventListener('error', () => {
        const brokenTag = imgEl.parentElement?.querySelector('.variant-img-broken');
        if (brokenTag) brokenTag.hidden = false;
        imgEl.classList.add('is-broken');
      });
    });
  }

  addSingleImageUrl(vIdx) {
    const input = this.variantsContainer?.querySelector(`[data-single-url-input="${vIdx}"]`);
    if (!input) return;
    const url = input.value.trim();
    if (!url) {
      this.showToast('Enter an image URL before clicking Add URL.');
      return;
    }
    if (!isValidImageUrl(url)) {
      this.showToast('Please enter a valid http/https image URL or clean asset path.');
      return;
    }
    if (!this.variants[vIdx].images.includes(url)) {
      this.variants[vIdx].images.push(url);
    }
    input.value = '';
    this.renderVariants();
  }

  addBulkImageUrls(vIdx) {
    const textarea = this.variantsContainer?.querySelector(`[data-bulk-url-input="${vIdx}"]`);
    if (!textarea) return;
    const raw = textarea.value;
    const candidates = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!candidates.length) {
      this.showToast('Paste at least one image URL.');
      return;
    }

    let addedCount = 0;
    let rejectedCount = 0;
    candidates.forEach((url) => {
      if (isValidImageUrl(url)) {
        if (!this.variants[vIdx].images.includes(url)) {
          this.variants[vIdx].images.push(url);
          addedCount += 1;
        }
      } else {
        rejectedCount += 1;
      }
    });

    if (addedCount > 0) {
      this.variants[vIdx].bulkOpen = false;
      this.renderVariants();
      this.showToast(
        `Added ${addedCount} image URL${addedCount === 1 ? '' : 's'}${rejectedCount ? ` (${rejectedCount} invalid skipped)` : ''}.`
      );
    } else {
      this.showToast('No valid image URLs detected. Use https://... or asset paths.');
    }
  }

  validateAndBuildPayload() {
    const errors = [];
    const name = this.nameInput.value.trim();
    const priceRaw = this.priceInput.value.trim();
    const price = Number(priceRaw);
    const sku = this.skuInput.value.trim();
    const category = this.categorySelect.value.trim();
    const description = this.descriptionInput.value.trim();

    if (name.length < 2) errors.push('Product Name must be at least 2 characters.');
    if (priceRaw === '' || !Number.isFinite(price) || price < 0) {
      errors.push('Product Price (₹) must be a valid non-negative number.');
    }
    if (sku.length < 2) {
      errors.push('Product SKU must be at least 2 characters.');
    } else if (!isSkuUnique(sku, this.getProducts(), this.editingProductId || '')) {
      errors.push(`Product SKU "${sku}" is already used by another product.`);
    }
    if (!category) errors.push('Select or create a Product Category.');
    if (description.length < 5) {
      errors.push('Product Description should be at least 5 characters.');
    }

    if (!this.variants.length) {
      errors.push('At least one Color Variant is required.');
    }

    const seenColorNames = new Set();
    const cleanColors = this.variants.map((v, idx) => {
      const label = `Color Variant #${idx + 1}`;
      const cName = v.colorName.trim();
      const cCode = v.colorCode.trim();

      if (!cName) {
        errors.push(`${label}: Color Name is required.`);
      } else if (seenColorNames.has(cName.toLowerCase())) {
        errors.push(`${label}: Duplicate color name "${cName}". Each color within a product must be distinct.`);
      } else {
        seenColorNames.add(cName.toLowerCase());
      }

      if (!/^#([0-9A-F]{3}){1,2}$/i.test(cCode)) {
        errors.push(`${label}: Color hex code must be valid (e.g., #C6A66B).`);
      }

      if (!v.selectedSizes.length) {
        errors.push(`${label} (${cName || 'Unnamed'}): Select at least one available size.`);
      }

      const sizes = v.selectedSizes.map((sz) => {
        const qtyRaw = v.stockBySize[sz];
        const qty = parseInt(qtyRaw, 10);
        if (!Number.isFinite(qty) || qty < 0) {
          errors.push(`${label} size ${sz}: Stock quantity must be 0 or greater.`);
        }
        return { size: sz, stock: Math.max(0, qty || 0) };
      });

      const validImgs = v.images.filter((url) => isValidImageUrl(url));
      if (!validImgs.length) {
        errors.push(`${label} (${cName || 'Unnamed'}): Add at least one valid Image URL.`);
      }

      return {
        colorName: cName,
        colorCode: cCode,
        sizes,
        images: validImgs
      };
    });

    return {
      errors,
      values: {
        name,
        price: Number.isFinite(price) ? price : 0,
        sku,
        category,
        description,
        fabric: this.fabricInput.value.trim(),
        care: this.careInput.value.trim(),
        isActive: this.isActiveInput.checked,
        colors: cleanColors
      }
    };
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.isSaving) return;
    this.clearErrors();

    const { errors, values } = this.validateAndBuildPayload();
    if (errors.length) {
      this.showErrors(errors);
      return;
    }

    this.isSaving = true;
    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.textContent = this.mode === 'edit' ? 'Updating Firestore...' : 'Saving to Firestore...';
    }

    try {
      let savedId;
      if (this.mode === 'edit' && this.editingProductId) {
        savedId = await updateProduct(this.editingProductId, values, this.getProducts());
        this.showToast(`"${values.name}" updated in Firestore.`);
      } else {
        savedId = await createProduct(values, this.getProducts());
        this.showToast(`"${values.name}" published to Firestore catalogue.`);
      }

      if (this.onSaved) {
        this.onSaved({ mode: this.mode, productId: savedId, productName: values.name });
      }
    } catch (err) {
      this.showErrors([mapFirestoreError(err)]);
    } finally {
      this.isSaving = false;
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.textContent = this.mode === 'edit' ? 'Update Product' : 'Save Product to Firestore';
      }
    }
  }

  bindEvents() {
    if (this.skuInput) {
      this.skuInput.addEventListener('input', () => this.updateSkuStatus());
    }

    if (this.skuGenBtn) {
      this.skuGenBtn.addEventListener('click', () => this.generateSuggestedSku());
    }

    if (this.toggleNewCatBtn && this.inlineCatBox) {
      this.toggleNewCatBtn.addEventListener('click', () => {
        this.inlineCatBox.hidden = !this.inlineCatBox.hidden;
        if (!this.inlineCatBox.hidden && this.inlineCatInput) {
          this.inlineCatInput.focus();
        }
      });
    }

    if (this.inlineCatCancelBtn && this.inlineCatBox) {
      this.inlineCatCancelBtn.addEventListener('click', () => {
        this.inlineCatBox.hidden = true;
        if (this.inlineCatInput) this.inlineCatInput.value = '';
      });
    }

    if (this.inlineCatSaveBtn && this.inlineCatInput) {
      this.inlineCatSaveBtn.addEventListener('click', async () => {
        const name = this.inlineCatInput.value.trim();
        if (name.length < 2) {
          this.showToast('Category name must be at least 2 characters.');
          return;
        }
        this.inlineCatSaveBtn.disabled = true;
        try {
          const saved = await saveCategory(name, '', this.getCategories());
          this.inlineCatInput.value = '';
          this.inlineCatBox.hidden = true;
          this.syncCategoryDropdown(saved.name);
          if (this.categorySelect) this.categorySelect.value = saved.name;
          this.showToast(`Category "${saved.name}" created and selected.`);
        } catch (err) {
          this.showToast(mapFirestoreError(err));
        } finally {
          this.inlineCatSaveBtn.disabled = false;
        }
      });
    }

    if (this.addColorBtn) {
      this.addColorBtn.addEventListener('click', () => {
        this.variants.push(createEmptyVariant(this.variants.length));
        this.renderVariants();
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this.resetForCreate();
      });
    }

    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => {
        this.resetForCreate();
        if (this.onCancel) this.onCancel();
      });
    }

    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    if (!this.variantsContainer) return;

    // Input synchronization inside variant cards
    this.variantsContainer.addEventListener('input', (e) => {
      const target = e.target;

      if (target.hasAttribute('data-variant-color-name')) {
        const idx = parseInt(target.getAttribute('data-variant-color-name'), 10);
        if (this.variants[idx]) this.variants[idx].colorName = target.value;
      } else if (target.hasAttribute('data-variant-color-picker')) {
        const idx = parseInt(target.getAttribute('data-variant-color-picker'), 10);
        if (this.variants[idx]) {
          this.variants[idx].colorCode = target.value.toUpperCase();
          const card = target.closest('[data-variant-card]');
          const hexInput = card?.querySelector(`[data-variant-color-hex="${idx}"]`);
          const dot = card?.querySelector('.variant-swatch-preview');
          if (hexInput) hexInput.value = this.variants[idx].colorCode;
          if (dot) dot.style.backgroundColor = this.variants[idx].colorCode;
        }
      } else if (target.hasAttribute('data-variant-color-hex')) {
        const idx = parseInt(target.getAttribute('data-variant-color-hex'), 10);
        const val = target.value.trim();
        if (this.variants[idx]) {
          this.variants[idx].colorCode = val;
          if (/^#[0-9A-F]{6}$/i.test(val)) {
            const card = target.closest('[data-variant-card]');
            const picker = card?.querySelector(`[data-variant-color-picker="${idx}"]`);
            const dot = card?.querySelector('.variant-swatch-preview');
            if (picker) picker.value = val;
            if (dot) dot.style.backgroundColor = val;
          }
        }
      } else if (target.hasAttribute('data-variant-stock-input')) {
        const idx = parseInt(target.getAttribute('data-variant-stock-input'), 10);
        const szKey = target.getAttribute('data-size-key');
        if (this.variants[idx] && szKey) {
          this.variants[idx].stockBySize[szKey] = Math.max(0, parseInt(target.value, 10) || 0);
        }
      }
    });

    // Checkbox toggling for Sizes
    this.variantsContainer.addEventListener('change', (e) => {
      const target = e.target;
      if (target.hasAttribute('data-variant-size-toggle')) {
        const idx = parseInt(target.getAttribute('data-variant-size-toggle'), 10);
        const sz = target.value;
        const variant = this.variants[idx];
        if (!variant) return;

        if (target.checked) {
          if (!variant.selectedSizes.includes(sz)) {
            variant.selectedSizes.push(sz);
            if (variant.stockBySize[sz] === undefined) {
              variant.stockBySize[sz] = 10;
            }
          }
        } else {
          variant.selectedSizes = variant.selectedSizes.filter((s) => s !== sz);
        }
        this.renderVariants();
      }
    });

    // Prevent Enter key inside single-URL input from submitting main product form
    this.variantsContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.hasAttribute('data-single-url-input')) {
        e.preventDefault();
        const idx = parseInt(e.target.getAttribute('data-single-url-input'), 10);
        this.addSingleImageUrl(idx);
      }
    });

    // Click actions inside variant cards
    this.variantsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.hasAttribute('data-remove-variant')) {
        const idx = parseInt(btn.getAttribute('data-remove-variant'), 10);
        if (this.variants.length > 1) {
          this.variants.splice(idx, 1);
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-set-default-variant')) {
        const idx = parseInt(btn.getAttribute('data-set-default-variant'), 10);
        if (idx > 0 && idx < this.variants.length) {
          const [chosen] = this.variants.splice(idx, 1);
          this.variants.unshift(chosen);
          this.renderVariants();
          this.showToast(`"${chosen.colorName || 'Color variant'}" set as Default Product Color.`);
        }
      } else if (btn.hasAttribute('data-select-all-sizes')) {
        const idx = parseInt(btn.getAttribute('data-select-all-sizes'), 10);
        const variant = this.variants[idx];
        if (variant) {
          STANDARD_SIZES.forEach((sz) => {
            if (!variant.selectedSizes.includes(sz)) variant.selectedSizes.push(sz);
            if (variant.stockBySize[sz] === undefined) variant.stockBySize[sz] = 10;
          });
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-add-free-size')) {
        const idx = parseInt(btn.getAttribute('data-add-free-size'), 10);
        const variant = this.variants[idx];
        if (variant) {
          if (!variant.customSizes.includes('Free Size')) variant.customSizes.push('Free Size');
          if (!variant.selectedSizes.includes('Free Size')) variant.selectedSizes.push('Free Size');
          if (variant.stockBySize['Free Size'] === undefined) variant.stockBySize['Free Size'] = 10;
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-apply-bulk-stock')) {
        const idx = parseInt(btn.getAttribute('data-apply-bulk-stock'), 10);
        const bulkInput = this.variantsContainer.querySelector(`[data-bulk-stock-val="${idx}"]`);
        const qty = Math.max(0, parseInt(bulkInput?.value, 10) || 0);
        const variant = this.variants[idx];
        if (variant) {
          variant.selectedSizes.forEach((sz) => {
            variant.stockBySize[sz] = qty;
          });
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-toggle-bulk-imgs')) {
        const idx = parseInt(btn.getAttribute('data-toggle-bulk-imgs'), 10);
        if (this.variants[idx]) {
          this.variants[idx].bulkOpen = !this.variants[idx].bulkOpen;
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-add-single-url')) {
        const idx = parseInt(btn.getAttribute('data-add-single-url'), 10);
        this.addSingleImageUrl(idx);
      } else if (btn.hasAttribute('data-add-bulk-urls')) {
        const idx = parseInt(btn.getAttribute('data-add-bulk-urls'), 10);
        this.addBulkImageUrls(idx);
      } else if (btn.hasAttribute('data-img-move')) {
        const dir = btn.getAttribute('data-img-move');
        const vIdx = parseInt(btn.getAttribute('data-v-idx'), 10);
        const imgIdx = parseInt(btn.getAttribute('data-img-idx'), 10);
        const imgs = this.variants[vIdx]?.images;
        if (!imgs) return;
        const swapWith = dir === 'left' ? imgIdx - 1 : imgIdx + 1;
        if (swapWith >= 0 && swapWith < imgs.length) {
          [imgs[imgIdx], imgs[swapWith]] = [imgs[swapWith], imgs[imgIdx]];
          this.renderVariants();
        }
      } else if (btn.hasAttribute('data-img-remove')) {
        const vIdx = parseInt(btn.getAttribute('data-v-idx'), 10);
        const imgIdx = parseInt(btn.getAttribute('data-img-idx'), 10);
        if (this.variants[vIdx]?.images) {
          this.variants[vIdx].images.splice(imgIdx, 1);
          this.renderVariants();
        }
      }
    });

    // HTML5 Drag & Drop Reordering within same color variant
    this.variantsContainer.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.variant-img-card');
      if (!card) return;
      this.dragState = {
        vIdx: parseInt(card.getAttribute('data-variant-index'), 10),
        imgIdx: parseInt(card.getAttribute('data-img-index'), 10)
      };
      card.classList.add('is-dragging');
    });

    this.variantsContainer.addEventListener('dragover', (e) => {
      const card = e.target.closest('.variant-img-card');
      if (!card || !this.dragState) return;
      const targetVIdx = parseInt(card.getAttribute('data-variant-index'), 10);
      if (targetVIdx === this.dragState.vIdx) {
        e.preventDefault();
      }
    });

    this.variantsContainer.addEventListener('drop', (e) => {
      const card = e.target.closest('.variant-img-card');
      if (!card || !this.dragState) return;
      const targetVIdx = parseInt(card.getAttribute('data-variant-index'), 10);
      const targetImgIdx = parseInt(card.getAttribute('data-img-index'), 10);
      if (targetVIdx === this.dragState.vIdx && targetImgIdx !== this.dragState.imgIdx) {
        e.preventDefault();
        const imgs = this.variants[targetVIdx]?.images;
        if (imgs) {
          const [moved] = imgs.splice(this.dragState.imgIdx, 1);
          imgs.splice(targetImgIdx, 0, moved);
          this.renderVariants();
        }
      }
      this.dragState = null;
    });

    this.variantsContainer.addEventListener('dragend', () => {
      this.dragState = null;
      this.variantsContainer.querySelectorAll('.variant-img-card.is-dragging').forEach((el) => {
        el.classList.remove('is-dragging');
      });
    });
  }
}

