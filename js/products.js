/**
 * KAARIGAI – Clothing for Women
 * Sample Product Catalogue (Demo Inventory)
 * ---------------------------------------------------------------------------
 * NOTE: All prices, stock badges, and SKU codes below are clearly marked
 * sample demo placeholders until Kaarigai Clothing for Women supplies
 * verified live inventory and pricing.
 */

(function (global) {
  'use strict';

  const CATEGORIES = [
    'All',
    'New Arrivals',
    'Sarees',
    'Kurtis',
    'Dresses',
    'Tops',
    'Ethnic Wear'
  ];

  const PRODUCTS = [
    {
      id: 'krg-saree-01',
      slug: 'ivory-champagne-kanjivaram-silk-saree',
      name: 'Ivory & Champagne Zari Kanjivaram Saree',
      category: 'Sarees',
      tags: ['Sarees', 'New Arrivals'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 12450,
      badge: 'New Arrival • Sample',
      shortNote: 'Handloom pure mulberry silk silhouette with woven gold zari border.',
      description:
        'Sample Demo Piece — Inspired by classic temple weaves of Tamil Nadu, this luminous ivory Kanjivaram silk drape features intricate champagne-gold zari paisley motifs along the pallu and border, finished with hand-knotted tassels.',
      fabric: 'Pure Mulberry Kanjivaram Silk Blend (Sample Spec)',
      care: 'Dry clean only. Store wrapped in unbleached muslin cloth away from moisture.',
      sizes: ['Free Size (5.5m + 0.8m Blouse)'],
      colors: [
        { name: 'Warm Ivory & Gold', hex: '#EDE2C8' },
        { name: 'Champagne Mist', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/saree-kanjivaram.jpg',
        'assets/products/saree-kanjivaram-drape.jpg',
        'assets/products/saree-kanjivaram-detail.jpg'
      ]
    },
    {
      id: 'krg-saree-02',
      slug: 'soft-rose-floral-organza-saree',
      name: 'Soft Rose Floral Embroidered Organza Saree',
      category: 'Sarees',
      tags: ['Sarees'],
      isNewArrival: false,
      isSampleDemo: true,
      samplePrice: 6850,
      badge: 'Atelier Pick • Sample',
      shortNote: 'Featherlight dusty rose organza adorned with champagne resham scalloping.',
      description:
        'Sample Demo Piece — Crafted in gossamer soft-rose silk organza, delicately framed by scalloped zari embroidery and subtle floral buttis for daytime celebrations and intimate evening gatherings.',
      fabric: 'Silk Organza with Zari & Resham Work (Sample Spec)',
      care: 'Professional dry clean recommended. Steam press lightly on reverse.',
      sizes: ['Free Size (5.5m + 0.8m Blouse)'],
      colors: [
        { name: 'Soft Rose', hex: '#D9A5A5' },
        { name: 'Champagne Blush', hex: '#E6C8BE' }
      ],
      images: [
        'assets/products/saree-organza.jpg',
        'assets/products/saree-organza-drape.jpg',
        'assets/products/saree-organza-detail.jpg'
      ]
    },
    {
      id: 'krg-kurti-01',
      slug: 'chikankari-ivory-chanderi-kurti-set',
      name: 'Chikankari Ivory Chanderi Straight Kurti Set',
      category: 'Kurtis',
      tags: ['Kurtis', 'New Arrivals'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 3650,
      badge: 'New Arrival • Sample',
      shortNote: 'Breathable ivory Chanderi silk kurti with tonal embroidery & organza dupatta.',
      description:
        'Sample Demo Piece — An effortlessly poised straight-cut ivory Chanderi kurti enriched with heritage needlework along the yoke and cuffs, paired with tailored cigarette trousers and a sheer pearl-edged dupatta.',
      fabric: 'Chanderi Silk Cotton with Mulmul Lining (Sample Spec)',
      care: 'Gentle hand wash cold or dry clean. Dry in shade.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Warm Ivory', hex: '#F3ECE0' },
        { name: 'Antique Gold Accent', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/kurti-ivory.jpg',
        'assets/products/kurti-ivory-drape.jpg',
        'assets/products/kurti-ivory-detail.jpg'
      ]
    },
    {
      id: 'krg-kurti-02',
      slug: 'deep-espresso-raw-silk-kurti',
      name: 'Deep Espresso Raw Silk Zari Kurti',
      category: 'Kurtis',
      tags: ['Kurtis'],
      isNewArrival: false,
      isSampleDemo: true,
      samplePrice: 3950,
      badge: 'Signature • Sample',
      shortNote: 'Rich espresso raw silk tailored silhouette with antique gold neckline work.',
      description:
        'Sample Demo Piece — Anchored in Kaarigai’s signature deep espresso palette, this structured raw silk kurti highlights fine champagne-gold paisley embroidery along the placket and sleeve hems.',
      fabric: 'Slub Raw Silk Blend (Sample Spec)',
      care: 'Dry clean recommended to preserve metallic zari embroidery.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Deep Brown', hex: '#38251F' },
        { name: 'Burnished Bronze', hex: '#69473A' }
      ],
      images: [
        'assets/products/kurti-espresso.jpg',
        'assets/products/kurti-espresso-drape.jpg',
        'assets/products/kurti-espresso-detail.jpg'
      ]
    },
    {
      id: 'krg-dress-01',
      slug: 'champagne-pleated-silk-atelier-gown',
      name: 'Champagne Pleated Silk Atelier Dress',
      category: 'Dresses',
      tags: ['Dresses', 'New Arrivals'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 5900,
      badge: 'New Arrival • Sample',
      shortNote: 'Fluid sunray-pleated champagne maxi dress with wrapped waist tie.',
      description:
        'Sample Demo Piece — Sculpted with architectural micro-pleats that catch light with every step, featuring a draped V-neckline, belted waist sash, and flowing floor-grazing skirt.',
      fabric: 'Lustrous Pleated Satin Silk (Sample Spec)',
      care: 'Dry clean only. Hang on padded hanger to protect pleats.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Champagne Gold', hex: '#C6A66B' },
        { name: 'Sand Ivory', hex: '#E3D4B9' }
      ],
      images: [
        'assets/products/dress-champagne.jpg',
        'assets/products/dress-champagne-drape.jpg',
        'assets/products/dress-champagne-detail.jpg'
      ]
    },
    {
      id: 'krg-dress-02',
      slug: 'monochrome-botanical-belted-midi-dress',
      name: 'Monochrome Botanical Belted Midi Dress',
      category: 'Dresses',
      tags: ['Dresses'],
      isNewArrival: false,
      isSampleDemo: true,
      samplePrice: 2850,
      badge: 'Resort Edit • Sample',
      shortNote: 'Crisp monochrome botanical leaf-print tiered midi dress with waist sash.',
      description:
        'Sample Demo Piece — Effortless resort and daytime wear featuring a bold monochrome botanical leaf motif, structured bodice straps, self-tie waist belt, and airy tiered flare skirt.',
      fabric: 'Breathable Woven Cotton Poplin (Sample Spec)',
      care: 'Gentle cold machine wash inside out. Warm iron on reverse.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Ivory & Onyx', hex: '#242120' },
        { name: 'Chalk White', hex: '#F6F4EE' }
      ],
      images: [
        'assets/products/dress-botanical.jpg',
        'assets/products/dress-botanical-drape.jpg',
        'assets/products/dress-botanical-detail.jpg'
      ]
    },
    {
      id: 'krg-top-01',
      slug: 'ivory-zardozi-accent-peplum-top',
      name: 'Ivory Zardozi Mandarin Peplum Top',
      category: 'Tops',
      tags: ['Tops', 'New Arrivals'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 2750,
      badge: 'New Arrival • Sample',
      shortNote: 'Tailored ivory silk peplum blouse with gold zardozi collar and waist belt.',
      description:
        'Sample Demo Piece — Bridging couture craftsmanship and modern tailoring, this structured ivory peplum top showcases hand-worked champagne zardozi embroidery along the mandarin collar, front placket, and cinched waist.',
      fabric: 'Structured Matka Silk Blend (Sample Spec)',
      care: 'Dry clean only.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Warm Ivory', hex: '#F5EFE4' },
        { name: 'Champagne Trim', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/top-ivory.jpg',
        'assets/products/top-ivory-drape.jpg',
        'assets/products/top-ivory-detail.jpg'
      ]
    },
    {
      id: 'krg-top-02',
      slug: 'soft-rose-mirrorwork-silk-tunic-top',
      name: 'Soft Rose Mirrorwork Silk Tunic Top',
      category: 'Tops',
      tags: ['Tops'],
      isNewArrival: false,
      isSampleDemo: true,
      samplePrice: 2950,
      badge: 'Festive Top • Sample',
      shortNote: 'Dusty rose embroidered tunic blouse with champagne zari & mirrorwork neckline.',
      description:
        'Sample Demo Piece — Styled effortlessly with wide-leg trousers or tailored skirts, this soft rose tunic top shimmers gently with fine mirrorwork and gold thread embroidery around the scoop neckline.',
      fabric: 'Pure Chanderi Silk Georgette (Sample Spec)',
      care: 'Dry clean only.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Soft Rose', hex: '#D9A5A5' },
        { name: 'Rosewood', hex: '#B97E7E' }
      ],
      images: [
        'assets/products/top-rose.jpg',
        'assets/products/top-rose-drape.jpg',
        'assets/products/top-rose-detail.jpg'
      ]
    },
    {
      id: 'krg-ethnic-01',
      slug: 'royal-ivory-gold-kalidar-anarkali',
      name: 'Royal Ivory & Gold Kalidar Anarkali Set',
      category: 'Ethnic Wear',
      tags: ['Ethnic Wear'],
      isNewArrival: false,
      isSampleDemo: true,
      samplePrice: 11200,
      badge: 'Couture • Sample',
      shortNote: 'Floor-grazing 24-kali ivory silk Anarkali with scalloped zari dupatta.',
      description:
        'Sample Demo Piece — A statement heirloom silhouette cut in 24 flowing panels of warm ivory silk, lavishly bordered in antique champagne-gold embroidery and paired with a sheer scalloped dupatta.',
      fabric: 'Silk Tissue & Embroidered Organza Dupatta (Sample Spec)',
      care: 'Dry clean only. Store folded with tissue.',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Ivory Champagne', hex: '#EFE5D0' },
        { name: 'Antique Gold', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/ethnic-anarkali.jpg',
        'assets/products/ethnic-anarkali-drape.jpg',
        'assets/products/ethnic-anarkali-detail.jpg'
      ]
    },
    {
      id: 'krg-ethnic-02',
      slug: 'dusty-rose-mirrorwork-sharara-ensemble',
      name: 'Dusty Rose Mirrorwork Sharara Ensemble',
      category: 'Ethnic Wear',
      tags: ['Ethnic Wear', 'New Arrivals'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 8950,
      badge: 'New Arrival • Sample',
      shortNote: 'Three-piece soft rose mirrorwork kurta, flared sharara & scalloped dupatta.',
      description:
        'Sample Demo Piece — Graceful movement meets celebratory craft in this three-piece dusty rose ensemble featuring hand-set mirror embroidery on the bodice and sweeping pleated sharara tiers.',
      fabric: 'Silk Crepe & Organza Dupatta (Sample Spec)',
      care: 'Dry clean only.',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Soft Rose', hex: '#D9A5A5' },
        { name: 'Champagne Silver', hex: '#D7C7A9' }
      ],
      images: [
        'assets/products/ethnic-sharara.jpg',
        'assets/products/ethnic-sharara-drape.jpg',
        'assets/products/ethnic-sharara-detail.jpg'
      ]
    },
    {
      id: 'krg-new-01',
      slug: 'espresso-gold-banarasi-festive-lehenga',
      name: 'Espresso & Gold Woven Banarasi Lehenga',
      category: 'New Arrivals',
      tags: ['New Arrivals', 'Ethnic Wear'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 14800,
      badge: 'New Arrival • Sample',
      shortNote: 'Deep espresso brocade Banarasi lehenga skirt, sculpted blouse & organza veil.',
      description:
        'Sample Demo Piece — From our latest festive atelier drop, this deep espresso Banarasi silk lehenga is woven in glowing champagne-gold kadhua motifs and balanced with a featherlight zari-bordered organza dupatta.',
      fabric: 'Katan Silk Brocade & Tissue Organza (Sample Spec)',
      care: 'Dry clean only.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Deep Brown & Gold', hex: '#38251F' },
        { name: 'Champagne Gold', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/new-banarasi.jpg',
        'assets/products/new-banarasi-drape.jpg',
        'assets/products/new-banarasi-detail.jpg'
      ]
    },
    {
      id: 'krg-new-02',
      slug: 'sculpted-champagne-draped-saree-gown',
      name: 'Sculpted Champagne Pre-Draped Saree Gown',
      category: 'New Arrivals',
      tags: ['New Arrivals', 'Dresses', 'Sarees'],
      isNewArrival: true,
      isSampleDemo: true,
      samplePrice: 9600,
      badge: 'New Arrival • Sample',
      shortNote: 'Modern Indo-Western belted saree gown in liquid ivory & rose-gold silk.',
      description:
        'Sample Demo Piece — Designed for contemporary red-carpet poise without pins or pleats, this pre-draped saree gown pairs crushed metallic champagne pleats with an ivory crepe drape and cinched metallic belt.',
      fabric: 'Crushed Tissue Silk & Fluid Crepe (Sample Spec)',
      care: 'Dry clean only. Steam lightly from inside.',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      colors: [
        { name: 'Ivory Champagne', hex: '#EAE0CE' },
        { name: 'Rose Gold', hex: '#C6A66B' }
      ],
      images: [
        'assets/products/new-drape-gown.jpg',
        'assets/products/new-drape-gown-drape.jpg',
        'assets/products/new-drape-gown-detail.jpg'
      ]
    }
  ];

  function formatINR(amount) {
    return '₹' + Number(amount || 0).toLocaleString('en-IN');
  }

  function getAllProducts() {
    return PRODUCTS.slice();
  }

  function getProductById(id) {
    return PRODUCTS.find((p) => p.id === id || p.slug === id) || null;
  }

  function getRelatedProducts(product, limit) {
    if (!product) return [];
    const max = limit || 3;
    const sameCategory = PRODUCTS.filter(
      (p) => p.id !== product.id && (p.category === product.category || p.tags.some((t) => product.tags.includes(t)))
    );
    const others = PRODUCTS.filter(
      (p) => p.id !== product.id && !sameCategory.some((s) => s.id === p.id)
    );
    return sameCategory.concat(others).slice(0, max);
  }

  function filterProducts(options) {
    const opts = options || {};
    const category = opts.category || 'All';
    const query = (opts.query || '').trim().toLowerCase();
    const sort = opts.sort || 'featured';
    const wishlistOnly = Boolean(opts.wishlistOnly);
    const wishlistIds = opts.wishlistIds || [];

    let list = PRODUCTS.filter((product) => {
      const matchesCat =
        category === 'All' ||
        product.category === category ||
        product.tags.includes(category) ||
        (category === 'New Arrivals' && product.isNewArrival);

      if (!matchesCat) return false;

      if (wishlistOnly && !wishlistIds.includes(product.id)) {
        return false;
      }

      if (query) {
        const haystack = [
          product.name,
          product.category,
          product.shortNote,
          product.description,
          product.fabric,
          product.tags.join(' ')
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    if (sort === 'price-asc') {
      list = list.slice().sort((a, b) => a.samplePrice - b.samplePrice);
    } else if (sort === 'price-desc') {
      list = list.slice().sort((a, b) => b.samplePrice - a.samplePrice);
    } else if (sort === 'newest') {
      list = list.slice().sort((a, b) => Number(b.isNewArrival) - Number(a.isNewArrival));
    }

    return list;
  }

  global.KAARIGAI_CATALOG = {
    CATEGORIES: CATEGORIES,
    PRODUCTS: PRODUCTS,
    formatINR: formatINR,
    getAllProducts: getAllProducts,
    getProductById: getProductById,
    getRelatedProducts: getRelatedProducts,
    filterProducts: filterProducts
  };
})(window);
