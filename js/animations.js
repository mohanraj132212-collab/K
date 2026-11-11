/**
 * KAARIGAI – Clothing for Women
 * GSAP + ScrollTrigger Choreography (with Vanilla Sticky Fallback)
 * ---------------------------------------------------------------------------
 * Implements the signature Hero-to-Heritage scroll transition:
 *   Initial : Golden embroidered dress stands large on the RIGHT of Hero.
 *   Scroll  : Stage pins -> Hero copy dissolves -> Dress gradually scales down
 *             and glides diagonally towards the bottom-left -> Settles centered
 *             horizontally & vertically inside the Heritage & Craftsmanship frame
 *             (without cropping) as "The Art of KAARIGAI" reveals on the RIGHT.
 */

(function (global) {
  'use strict';

  let signatureScrollTrigger = null;
  let stickyFallbackActive = false;

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function mapRange(val, inMin, inMax, outMin, outMax) {
    if (val <= inMin) return outMin;
    if (val >= inMax) return outMax;
    const t = (val - inMin) / (inMax - inMin);
    return outMin + (outMax - outMin) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Computes exact pixel offsets and scale for the dress transition relative to
   * the centered flex anchor (#dress-flight-anchor), ensuring zero horizontal
   * overflow, diagonal bottom-left motion, gradual scale-down, and exact
   * horizontal & vertical centering inside #about-pedestal across viewports.
   */
  function computeDressGeometry() {
    const anchor = document.getElementById('dress-flight-anchor');
    const tiltEl = document.getElementById('dress-3d-tilt');
    const dressImg = document.getElementById('signature-dress-img');
    const pedestal = document.getElementById('about-pedestal');

    if (!anchor || !tiltEl || !pedestal) {
      return {
        startX: 280,
        startY: -36,
        endX: -280,
        endY: 36,
        endScale: 0.75,
        isMobile: false
      };
    }

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const anchorRect = anchor.getBoundingClientRect();
    const pedRect = pedestal.getBoundingClientRect();

    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    const anchorCenterY = anchorRect.top + anchorRect.height / 2;

    // Untransformed dress dimensions (offsetWidth/Height ignore CSS transforms)
    const dressW = tiltEl.offsetWidth || 360;
    const naturalRatio =
      dressImg && dressImg.naturalWidth && dressImg.naturalHeight
        ? dressImg.naturalHeight / dressImg.naturalWidth
        : 1007 / 832;
    const dressH = tiltEl.offsetHeight || Math.round(dressW * naturalRatio);

    // RIGHT starting position in Hero
    const rightMargin = isMobile ? 14 : Math.max(24, anchorRect.width * 0.04);
    const maxSafeRight = anchorRect.width / 2 - dressW / 2 - rightMargin;
    const desiredRight = anchorRect.width * (isMobile ? 0.23 : 0.285);
    const startX = Math.round(
      Math.max(isMobile ? 36 : 80, Math.min(desiredRight, maxSafeRight))
    );

    // LEFT destination position measured from #about-pedestal's true geometric center
    const pedCenterX = pedRect.left + pedRect.width / 2;
    const pedCenterY = pedRect.top + pedRect.height / 2;
    const endX = Math.round(pedCenterX - anchorCenterX);
    const endY = Math.round(pedCenterY - anchorCenterY);

    // Vertical start position in Hero:
    // Placed comfortably in the upper-mid right (clear of fixed header & CTA)
    // and higher than #about-pedestal so the dress travels diagonally bottom-left.
    const headerEl = document.getElementById('site-header');
    const headerH = headerEl ? headerEl.offsetHeight : isMobile ? 68 : 78;

    let startY;
    if (isMobile) {
      const heroCenter = document.getElementById('hero-center-band');
      const heroLower = document.getElementById('hero-lower-copy');
      const topLimit =
        (heroCenter ? heroCenter.offsetTop + heroCenter.offsetHeight : headerH + 110) + 12;
      const bottomLimit =
        (heroLower ? heroLower.offsetTop : anchorRect.height - 230) - 12;
      const safeCenterY = (topLimit + bottomLimit) / 2;
      const targetCenterY = Math.min(safeCenterY, pedCenterY - 24);
      const minCenterY = topLimit + dressH / 2;
      const maxCenterY = Math.max(minCenterY, bottomLimit - dressH / 2);
      const clampedCenterY = Math.max(minCenterY, Math.min(targetCenterY, maxCenterY));
      startY = Math.round(clampedCenterY - anchorCenterY);
    } else {
      const minTopClear = headerH + 28;
      const idealStartCenterY = headerH + (anchorRect.height - headerH) * 0.42;
      const minCenterY = minTopClear + dressH / 2;
      const maxCenterY = Math.max(minCenterY, pedCenterY - 45);
      const clampedCenterY = Math.max(minCenterY, Math.min(idealStartCenterY, maxCenterY));
      startY = Math.round(clampedCenterY - anchorCenterY);
    }

    // Scale down smoothly to fit entirely inside the rounded Heritage frame without cropping
    const pedW = pedestal.offsetWidth || pedRect.width || 410;
    const pedH = pedestal.offsetHeight || pedRect.height || 560;
    const safeInnerW = pedW * (isMobile ? 0.74 : 0.76);
    const safeInnerH = pedH * (isMobile ? 0.76 : 0.78);
    const fitScale = Math.min(safeInnerW / dressW, safeInnerH / dressH);
    const endScale = Number(Math.max(0.45, Math.min(0.92, fitScale)).toFixed(3));

    return {
      startX: startX,
      startY: startY,
      endX: endX,
      endY: endY,
      endScale: endScale,
      isMobile: isMobile
    };
  }

  /**
   * Offline / Blocked-CDN Sticky Scroll Fallback:
   * Preserves the exact same smooth diagonal bottom-left shrink choreography
   * using CSS position:sticky and requestAnimationFrame if GSAP CDN is blocked.
   */
  function initStickyFallback() {
    const stage = document.getElementById('hero-about-stage');
    const heroBackdrop = document.getElementById('hero-luxury-backdrop');
    const heroCenter = document.getElementById('hero-center-band');
    const heroLower = document.getElementById('hero-lower-copy');
    const heroScrollCue = document.getElementById('hero-scroll-cue');
    const dressTilt = document.getElementById('dress-3d-tilt');
    const dressShadow = document.getElementById('dress-floor-shadow');
    const aboutPedestal = document.getElementById('about-pedestal');
    const pedestalArch = aboutPedestal ? aboutPedestal.querySelector('.pedestal-arch') : null;
    const aboutRight = document.getElementById('about-right-content');
    const aboutStaggers = document.querySelectorAll('.about-stagger');
    const threadPath = document.getElementById('signature-thread-path');

    if (!stage || !dressTilt) return;

    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceQuery.matches) {
      if (aboutPedestal) aboutPedestal.style.opacity = '1';
      if (aboutRight) {
        aboutRight.style.opacity = '1';
        aboutRight.classList.add('is-interactive');
      }
      return;
    }

    stickyFallbackActive = true;
    stage.classList.add('is-sticky-fallback');

    let threadLen = 1400;
    if (threadPath && typeof threadPath.getTotalLength === 'function') {
      threadLen = threadPath.getTotalLength();
      threadPath.style.strokeDasharray = String(threadLen);
      threadPath.style.strokeDashoffset = String(threadLen);
    }

    let rafId = null;

    function updateFrame() {
      rafId = null;
      if (reduceQuery.matches) return;

      const stageRect = stage.getBoundingClientRect();
      const travel = Math.max(1, stage.offsetHeight - window.innerHeight);
      const progress = clamp01(-stageRect.top / travel);
      const geo = computeDressGeometry();

      // Step 1: Hero dissolve (0.00 -> 0.26)
      const cueFade = 1 - clamp01(progress / 0.12);
      if (heroScrollCue) {
        heroScrollCue.style.opacity = String(cueFade);
        heroScrollCue.style.transform =
          'translateX(-50%) translateY(' + ((1 - cueFade) * 12).toFixed(1) + 'px)';
      }

      const lowerT = clamp01(progress / 0.22);
      if (heroLower) {
        heroLower.style.opacity = String(1 - lowerT);
        heroLower.style.transform = 'translateY(' + (-28 * lowerT).toFixed(1) + 'px)';
      }

      const centerT = clamp01((progress - 0.02) / 0.24);
      if (heroCenter) {
        heroCenter.style.opacity = String(1 - centerT);
        const s = 1 - 0.08 * centerT;
        heroCenter.style.transform =
          'translateY(' + (-24 * centerT).toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      }

      if (heroBackdrop) {
        const bgT = clamp01((progress - 0.06) / 0.36);
        heroBackdrop.style.opacity = String(1 - bgT);
        heroBackdrop.style.transform = 'scale(' + (1 + 0.02 * bgT).toFixed(4) + ')';
      }

      // Step 2: Continuous Diagonal Bottom-Left Glide & Gradual Scale-Down (0.04 -> 0.78)
      const flightT = clamp01((progress - 0.04) / 0.74);
      const easeX = easeInOutQuad(flightT);
      const easeY = easeInOutSine(flightT);
      const easeScale = easeInOutSine(flightT);

      const dx = mapRange(easeX, 0, 1, geo.startX, geo.endX);
      const dy = mapRange(easeY, 0, 1, geo.startY, geo.endY);
      const sc = mapRange(easeScale, 0, 1, 1, geo.endScale);

      let rotY = -4;
      let rotZ = 1;
      if (flightT <= 0.5) {
        const half = easeInOutSine(flightT / 0.5);
        rotY = mapRange(half, 0, 1, -4, -13);
        rotZ = mapRange(half, 0, 1, 1, -2);
      } else {
        const half = easeOutCubic((flightT - 0.5) / 0.5);
        rotY = mapRange(half, 0, 1, -13, 0);
        rotZ = mapRange(half, 0, 1, -2, 0);
      }

      dressTilt.style.transform =
        'translate3d(' +
        dx.toFixed(1) +
        'px, ' +
        dy.toFixed(1) +
        'px, 0) scale(' +
        sc.toFixed(3) +
        ') rotateY(' +
        rotY.toFixed(2) +
        'deg) rotateZ(' +
        rotZ.toFixed(2) +
        'deg)';

      if (dressShadow) {
        const shadowT = clamp01((progress - 0.04) / 0.38);
        dressShadow.style.opacity = String((0.85 * (1 - shadowT)).toFixed(3));
        dressShadow.style.transform = 'scaleX(' + (1 - 0.35 * shadowT).toFixed(3) + ')';
      }

      if (threadPath) {
        const threadT = clamp01((progress - 0.08) / 0.68);
        threadPath.style.strokeDashoffset = String(threadLen * (1 - threadT));
      }

      // Step 3: Reveal Heritage Frame LEFT & About Text RIGHT (0.40 -> 0.80)
      const pedT = easeOutCubic(clamp01((progress - 0.4) / 0.32));
      if (aboutPedestal) {
        aboutPedestal.style.opacity = String(pedT);
      }
      if (pedestalArch) {
        pedestalArch.style.transform = 'scale(' + (0.95 + 0.05 * pedT).toFixed(3) + ')';
      }

      const rightT = easeOutCubic(clamp01((progress - 0.45) / 0.31));
      if (aboutRight) {
        aboutRight.style.opacity = String(rightT);
        aboutRight.style.transform = 'translateX(' + ((1 - rightT) * 36).toFixed(1) + 'px)';
        aboutRight.classList.toggle('is-interactive', progress >= 0.56);
      }

      aboutStaggers.forEach(function (el, idx) {
        const stT = easeOutCubic(clamp01((progress - (0.48 + idx * 0.035)) / 0.22));
        el.style.opacity = String(stT);
        el.style.transform = 'translateY(' + ((1 - stT) * 18).toFixed(1) + 'px)';
      });
    }

    function onScrollOrResize() {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateFrame);
      }
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    updateFrame();
  }

  function initSignatureScrollStage() {
    const gsap = global.gsap;
    const ScrollTrigger = global.ScrollTrigger;

    const stagePin = document.getElementById('stage-pin');
    const heroBackdrop = document.getElementById('hero-luxury-backdrop');
    const heroCenter = document.getElementById('hero-center-band');
    const heroWordmark = document.getElementById('hero-wordmark');
    const heroLower = document.getElementById('hero-lower-copy');
    const heroScrollCue = document.getElementById('hero-scroll-cue');
    const dressTilt = document.getElementById('dress-3d-tilt');
    const dressImg = document.getElementById('signature-dress-img');
    const dressShadow = document.getElementById('dress-floor-shadow');
    const aboutPedestal = document.getElementById('about-pedestal');
    const pedestalArch = aboutPedestal ? aboutPedestal.querySelector('.pedestal-arch') : null;
    const aboutRight = document.getElementById('about-right-content');
    const aboutStaggers = document.querySelectorAll('.about-stagger');
    const threadPath = document.getElementById('signature-thread-path');

    if (!stagePin || !dressTilt) return;

    // Fallback smoothly if GSAP CDN did not load
    if (!gsap || !ScrollTrigger) {
      initStickyFallback();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    // Prepare golden SVG thread stroke dash for scrubbed drawing
    let threadLen = 1400;
    if (threadPath && typeof threadPath.getTotalLength === 'function') {
      threadLen = threadPath.getTotalLength();
      gsap.set(threadPath, {
        strokeDasharray: threadLen,
        strokeDashoffset: threadLen
      });
    }

    const mm = gsap.matchMedia();

    // Respect user reduced-motion accessibility preference
    mm.add('(prefers-reduced-motion: reduce)', function () {
      gsap.set([heroBackdrop, aboutPedestal, aboutRight].filter(Boolean), {
        clearProps: 'all',
        opacity: 1
      });
      if (aboutRight) aboutRight.classList.add('is-interactive');
      gsap.set(dressTilt, { clearProps: 'all' });
    });

    function buildMotionStage() {
      const geo = computeDressGeometry();

      // Set initial RIGHT-side Hero resting pose
      gsap.set(dressTilt, {
        x: geo.startX,
        y: geo.startY,
        scale: 1,
        rotationY: -4,
        rotationZ: 1,
        transformOrigin: 'center center'
      });

      if (heroBackdrop) {
        gsap.set(heroBackdrop, { opacity: 1, scale: 1, transformOrigin: 'center center' });
      }
      gsap.set(heroCenter, { opacity: 1, y: 0, scale: 1 });
      gsap.set(heroLower, { opacity: 1, y: 0 });
      gsap.set(heroScrollCue, { opacity: 1, y: 0 });
      gsap.set(aboutPedestal, { opacity: 0 });
      if (pedestalArch) {
        gsap.set(pedestalArch, { scale: 0.95, transformOrigin: 'center center' });
      }
      gsap.set(aboutRight, { opacity: 0, x: 36 });
      gsap.set(aboutStaggers, { opacity: 0, y: 18 });
      if (dressShadow) {
        gsap.set(dressShadow, { opacity: 0.85, scaleX: 1 });
      }

      // Gentle ambient float ONLY while resting at the top of Hero (y = 0 during scroll/settled)
      let floatTween = null;
      let isFloating = false;

      function startFloat() {
        if (!dressImg || isFloating) return;
        isFloating = true;
        floatTween = gsap.to(dressImg, {
          y: -6,
          duration: 3.0,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }

      function stopFloat() {
        if (!isFloating) return;
        isFloating = false;
        if (floatTween) {
          floatTween.kill();
          floatTween = null;
        }
        if (dressImg) {
          gsap.to(dressImg, {
            y: 0,
            duration: 0.25,
            ease: 'power2.out',
            overwrite: 'auto'
          });
        }
      }

      // Subtle entrance reveal only when landing at top of page
      let introTl = null;
      const heroLowerChildren = heroLower ? Array.prototype.slice.call(heroLower.children) : [];
      if (window.scrollY <= 30) {
        introTl = gsap.timeline({
          defaults: { ease: 'power3.out' },
          onComplete: function () {
            if (window.scrollY <= 30) {
              startFloat();
            }
          }
        });
        introTl
          .from('#hero-eyebrow', { y: 18, opacity: 0, duration: 0.6 })
          .from(heroWordmark, { y: 28, opacity: 0, duration: 0.75 }, '-=0.38')
          .from(heroLowerChildren, { y: 20, opacity: 0, duration: 0.65, stagger: 0.08 }, '-=0.48')
          .from(
            dressImg,
            { opacity: 0, scale: 0.95, duration: 0.8, clearProps: 'opacity,scale' },
            '-=0.6'
          );
      } else {
        gsap.set(dressImg, { opacity: 1, scale: 1, y: 0 });
      }

      // Signature Hero -> Diagonal Bottom-Left Shrink -> Heritage Frame Timeline
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: '#hero-about-stage',
          start: 'top top',
          end: function () {
            return window.matchMedia('(max-width: 767px)').matches ? '+=155%' : '+=185%';
          },
          pin: '#stage-pin',
          scrub: 0.6,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: function (self) {
            if (self.progress > 0.02) {
              if (introTl && introTl.isActive()) {
                introTl.kill();
                introTl = null;
                gsap.set(
                  ['#hero-eyebrow', heroWordmark].concat(heroLowerChildren).filter(Boolean),
                  { clearProps: 'opacity,transform' }
                );
                gsap.set(dressImg, { opacity: 1, scale: 1 });
              }
              stopFloat();
            } else if (!introTl || introTl.progress() >= 1) {
              startFloat();
            }

            if (aboutRight) {
              if (self.progress >= 0.56) {
                aboutRight.classList.add('is-interactive');
              } else {
                aboutRight.classList.remove('is-interactive');
              }
            }
          }
        }
      });

      signatureScrollTrigger = scrollTl.scrollTrigger;

      // Anchor start pose at progress = 0 across refreshes
      scrollTl.set(
        dressTilt,
        {
          x: function () {
            return computeDressGeometry().startX;
          },
          y: function () {
            return computeDressGeometry().startY;
          },
          scale: 1,
          rotationY: -4,
          rotationZ: 1
        },
        0
      );

      // Step 1: Dissolve Hero copy gracefully (0.00 -> 0.26)
      scrollTl
        .to(
          heroScrollCue,
          { opacity: 0, y: 12, duration: 0.12, ease: 'power1.out' },
          0
        )
        .to(
          heroLower,
          { opacity: 0, y: -28, duration: 0.22, ease: 'power2.inOut' },
          0
        )
        .to(
          heroCenter,
          {
            opacity: 0,
            scale: 0.92,
            y: -24,
            duration: 0.24,
            ease: 'power2.inOut'
          },
          0.02
        );

      if (heroBackdrop) {
        scrollTl.to(
          heroBackdrop,
          { opacity: 0, scale: 1.02, duration: 0.36, ease: 'power1.out' },
          0.06
        );
      }

      // Step 2: Continuous Diagonal Bottom-Left Glide & Gradual Scale-Down (0.04 -> 0.78)
      scrollTl
        .fromTo(
          dressTilt,
          {
            x: function () {
              return computeDressGeometry().startX;
            }
          },
          {
            x: function () {
              return computeDressGeometry().endX;
            },
            duration: 0.74,
            ease: 'power2.inOut',
            immediateRender: false
          },
          0.04
        )
        .fromTo(
          dressTilt,
          {
            y: function () {
              return computeDressGeometry().startY;
            },
            scale: 1
          },
          {
            y: function () {
              return computeDressGeometry().endY;
            },
            scale: function () {
              return computeDressGeometry().endScale;
            },
            duration: 0.74,
            ease: 'sine.inOut',
            immediateRender: false
          },
          0.04
        )
        .fromTo(
          dressTilt,
          {
            rotationY: -4,
            rotationZ: 1
          },
          {
            rotationY: -13,
            rotationZ: -2,
            duration: 0.37,
            ease: 'sine.inOut',
            immediateRender: false
          },
          0.04
        )
        .to(
          dressTilt,
          {
            rotationY: 0,
            rotationZ: 0,
            duration: 0.37,
            ease: 'sine.out'
          },
          0.41
        );

      if (dressShadow) {
        scrollTl.to(
          dressShadow,
          { scaleX: 0.65, opacity: 0, duration: 0.38, ease: 'power1.out' },
          0.04
        );
      }

      if (threadPath) {
        scrollTl.to(
          threadPath,
          {
            strokeDashoffset: 0,
            duration: 0.68,
            ease: 'power1.inOut'
          },
          0.08
        );
      }

      // Step 3: Reveal Heritage Frame LEFT & "The Art of KAARIGAI" RIGHT (0.40 -> 0.82)
      scrollTl.to(
        aboutPedestal,
        {
          opacity: 1,
          duration: 0.32,
          ease: 'power2.out'
        },
        0.4
      );

      if (pedestalArch) {
        scrollTl.fromTo(
          pedestalArch,
          { scale: 0.95 },
          {
            scale: 1,
            duration: 0.34,
            ease: 'power2.out',
            immediateRender: false
          },
          0.4
        );
      }

      scrollTl
        .to(
          aboutRight,
          {
            opacity: 1,
            x: 0,
            duration: 0.31,
            ease: 'power2.out'
          },
          0.45
        )
        .to(
          aboutStaggers,
          {
            opacity: 1,
            y: 0,
            stagger: 0.045,
            duration: 0.26,
            ease: 'power2.out'
          },
          0.48
        );

      // Calm settled dwell before releasing pin cleanly into Collections
      scrollTl.to({}, { duration: 0.16 }, 0.84);

      function handleDressLoad() {
        ScrollTrigger.refresh();
      }

      if (dressImg && !dressImg.complete) {
        dressImg.addEventListener('load', handleDressLoad);
      }

      return function cleanup() {
        if (dressImg) {
          dressImg.removeEventListener('load', handleDressLoad);
        }
        if (floatTween) floatTween.kill();
        if (introTl) introTl.kill();
        signatureScrollTrigger = null;
      };
    }

    // Separate desktop & mobile contexts so viewport changes rebuild exact offsets cleanly
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', buildMotionStage);
    mm.add('(max-width: 767px) and (prefers-reduced-motion: no-preference)', buildMotionStage);
  }

  function initSectionRevealsAndParallax() {
    const gsap = global.gsap;
    const ScrollTrigger = global.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      gsap.utils.toArray('.reveal-on-scroll').forEach(function (el) {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.75,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
          scrollTrigger: {
            trigger: el,
            start: 'top 86%',
            once: true
          }
        });
      });

      const storePhoto = document.querySelector('.store-photo');
      if (storePhoto) {
        gsap.to(storePhoto, {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: {
            trigger: '.store-photo-wrap',
            start: 'top bottom',
            end: 'bottom top',
            scrub: true
          }
        });
      }
    });
  }

  function animateProductCards() {
    const gsap = global.gsap;
    if (!gsap) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = document.querySelectorAll('#products-grid .product-card');
    if (!cards.length) return;

    gsap.fromTo(
      cards,
      { y: 20, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.5,
        stagger: 0.045,
        ease: 'power2.out',
        clearProps: 'transform,opacity'
      }
    );
  }

  function bumpCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.classList.remove('is-bumping');
    void badge.offsetWidth;
    badge.classList.add('is-bumping');
    window.setTimeout(function () {
      badge.classList.remove('is-bumping');
    }, 340);
  }

  /**
   * Scrolls precisely to the settled Heritage & Craftsmanship state inside the
   * signature stage so clicking "About" displays the dress centered in its frame.
   */
  function scrollToAboutStage() {
    if (signatureScrollTrigger) {
      const st = signatureScrollTrigger;
      const targetY = st.start + (st.end - st.start) * 0.94;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      return;
    }

    if (stickyFallbackActive) {
      const stage = document.getElementById('hero-about-stage');
      if (stage) {
        const travel = Math.max(1, stage.offsetHeight - window.innerHeight);
        window.scrollTo({ top: stage.offsetTop + travel * 0.94, behavior: 'smooth' });
        return;
      }
    }

    const aboutEl = document.getElementById('about') || document.getElementById('hero-about-stage');
    if (aboutEl) {
      aboutEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function refresh() {
    if (global.ScrollTrigger) {
      global.ScrollTrigger.refresh();
    }
  }

  function loadScript(src, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      let done = false;
      const timer = window.setTimeout(function () {
        if (!done) {
          done = true;
          reject(new Error('Script load timeout: ' + src));
        }
      }, timeoutMs || 3000);
      s.onload = function () {
        if (!done) {
          done = true;
          window.clearTimeout(timer);
          resolve();
        }
      };
      s.onerror = function () {
        if (!done) {
          done = true;
          window.clearTimeout(timer);
          reject(new Error('Script load error: ' + src));
        }
      };
      document.head.appendChild(s);
    });
  }

  function primeRightInitialPose() {
    const dressTilt = document.getElementById('dress-3d-tilt');
    if (!dressTilt) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const geo = computeDressGeometry();
    dressTilt.style.transform =
      'translate3d(' +
      geo.startX.toFixed(1) +
      'px, ' +
      geo.startY.toFixed(1) +
      'px, 0) scale(1) rotateY(-4deg) rotateZ(1deg)';
  }

  function initAllAnimations() {
    primeRightInitialPose();

    if (global.gsap && global.ScrollTrigger) {
      initSignatureScrollStage();
      initSectionRevealsAndParallax();
      return;
    }

    // Load GSAP + ScrollTrigger dynamically without blocking initial page/storefront render
    loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js', 3000)
      .then(function () {
        return loadScript(
          'https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/ScrollTrigger.min.js',
          3000
        );
      })
      .then(function () {
        initSignatureScrollStage();
        initSectionRevealsAndParallax();
      })
      .catch(function () {
        // Offline / blocked-CDN graceful fallback preserves full diagonal scroll choreography
        initStickyFallback();
      });
  }

  global.KAARIGAI_ANIMATIONS = {
    init: initAllAnimations,
    animateProductCards: animateProductCards,
    bumpCartBadge: bumpCartBadge,
    scrollToAboutStage: scrollToAboutStage,
    refresh: refresh
  };
})(window);
