# KAARIGAI — Clothing for Women

Luxury 3D-inspired Indian women's fashion storefront built exclusively with **HTML5**, **CSS3**, **Vanilla JavaScript**, **inline SVG icons**, and **GSAP + ScrollTrigger**.

## Project Structure

```text
C:\Users\mohan\Desktop\k\
├── index.html          # Semantic HTML5 layout, inline SVG icons, drawers & modals
├── css/
│   └── style.css       # Warm Ivory, Deep Brown, Soft Rose & Champagne Gold editorial design
├── js/
│   ├── products.js     # Sample demo catalog across 6 categories + query/filter utilities
│   ├── cart.js         # localStorage cart/wishlist + FirebaseOrderService adapter
│   ├── animations.js   # GSAP ScrollTrigger right-to-left 3D dress choreography & reveals
│   └── main.js         # Storefront UI controller, product gallery modal & checkout flow
├── assets/
│   ├── images/         # Transparent signature couture dress & boutique interior imagery
│   ├── products/       # Multi-angle editorial & detail imagery for all 12 sample products
│   └── logo/           # Original KAARIGAI logo + alpha-masked transparent PNG
└── README.md
```

## Key Features

- **Signature 3D Scroll Animation**: The hero section pins seamlessly via GSAP `ScrollTrigger`; the transparent couture dress glides smoothly from **RIGHT to LEFT** with 3D rotation (`rotateY` / `rotateZ`), gentle zoom, synchronized ground shadow, and golden thread reveal before settling inside the left pedestal to unveil **"The Art of KAARIGAI"** on the right. Respects `prefers-reduced-motion`.
- **Collections & Multi-Image Product Details**: Filterable across *All*, *New Arrivals*, *Sarees*, *Kurtis*, *Dresses*, *Tops*, and *Ethnic Wear*, with colour/size selection, search, sorting, wishlist toggling, 3-angle product detail modal, size guide, and related pieces.
- **Persistent Cart & Firebase-Ready Checkout**: Uses `localStorage` for bag and wishlist persistence. Checkout constructs a structured Firestore-compatible payload via `KAARIGAI_CART.FirebaseOrderService` and transparently labels submissions as unconfirmed demo drafts until connected to a live backend and verified payment gateway.
- **Inline SVG Icons Only**: Every UI icon is rendered as crisp inline `<svg>` without emojis, icon fonts, or third-party icon packs.

## Store Details

- **Business**: Kaarigai Clothing for Women
- **Address**: 1st Floor, PPS Palamudir Cholai, Kovilpatti Rd, near Kamarajar Silai, Manapparai, Tamil Nadu 621306
- **Hours**: 9:30 AM – 9:30 PM, every day

## Sample Data & Backend Notes

- Product pricing, sizes, and stock tags in `js/products.js` are marked sample demo placeholders pending verified inventory.
- No phone number is fabricated; WhatsApp actions open an explicit placeholder modal pending the store's official WhatsApp number.
- Replace `KAARIGAI_CART.FirebaseOrderService.submitOrderDraft` in `js/cart.js` with Firestore writes and server-side payment verification before going live.
