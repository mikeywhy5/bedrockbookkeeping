(function () {
  "use strict";

  document.documentElement.classList.add("js-enabled");
  document.documentElement.classList.remove("no-js");

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- BGD Reactive Dot Grid (hero photo placeholder) ---- */
  var heroPhotoDots = document.getElementById("heroPhotoDots");
  var heroPhotoDotsHot = document.getElementById("heroPhotoDotsHot");
  if (heroPhotoDots && heroPhotoDotsHot) {
    // .hero-photo has pointer-events:none so hero text can be interacted
    // with on top of it, so track the cursor from the document instead.
    document.addEventListener("pointermove", function (e) {
      var r = heroPhotoDots.getBoundingClientRect();
      heroPhotoDotsHot.style.setProperty("--x", (e.clientX - r.left) + "px");
      heroPhotoDotsHot.style.setProperty("--y", (e.clientY - r.top) + "px");
    }, { passive: true });
  }

  /* ---- HVR Drawing Border (continuous orbit around contact CTA) ---- */
  var contactDraw = document.getElementById("contactCtaDraw");
  if (contactDraw && !prefersReducedMotion) {
    var drawTemplate = contactDraw.querySelector(".contact-cta-draw-seg-template");
    var SEGMENTS = 24;
    var LOOP_MS = 7000;
    var len = 0;
    var segLen = 0;
    var segEls = [];

    // a solid line clone per slice, each a little dimmer than the last, so
    // the tail reads as one smooth line fading to black instead of a hard
    // dash edge or a dot marking the head
    function buildSegments() {
      segEls.forEach(function (el) { el.remove(); });
      segEls = [];
      for (var i = 0; i < SEGMENTS; i++) {
        var seg = drawTemplate.cloneNode(false);
        seg.classList.remove("contact-cta-draw-seg-template");
        seg.classList.add("contact-cta-draw-seg");
        seg.style.opacity = Math.pow(1 - i / SEGMENTS, 1.8);
        contactDraw.appendChild(seg);
        segEls.push(seg);
      }
    }

    function syncDrawLength() {
      // the template is display:none so it can't resolve its percentage-
      // based width/height and always reports 0; measure a live clone instead
      len = segEls[0].getTotalLength();
      segLen = (len * 0.22) / SEGMENTS;
      segEls.forEach(function (seg) {
        seg.style.strokeDasharray = segLen + " " + len;
      });
    }

    function tick(now) {
      var progress = (now % LOOP_MS) / LOOP_MS;
      var lead = progress * len;
      for (var i = 0; i < SEGMENTS; i++) {
        // each slice ends where the previous one begins, so together they
        // tile one continuous line running back from the leading point
        segEls[i].style.strokeDashoffset = segLen * (i + 1) - lead;
      }
      requestAnimationFrame(tick);
    }

    buildSegments();
    syncDrawLength();
    window.addEventListener("load", syncDrawLength);
    window.addEventListener("resize", syncDrawLength);
    requestAnimationFrame(tick);
  }

  /* ---- BGD Grid Worm (Budget Tool CTA background) ---- */
  var wormCanvas = document.getElementById("wormCanvas");
  if (wormCanvas && !prefersReducedMotion) {
    var wctx = wormCanvas.getContext("2d");
    var WORM_CELL = 24;
    var WORM_MAX_LENGTH = 20;
    var wormCols, wormRows, wormW, wormH, wormBlocked;
    var snake, dir, length, food, mode, offscreenTicks;
    var wormTimer = null;

    var DIRS = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];

    function wormResizeCanvas() {
      var mainEl = document.getElementById("main");
      var startEl = document.querySelector(".budget-cta-panel");
      var endEl = document.querySelector(".budget-cta-panel");
      if (!mainEl || !startEl || !endEl) return false;
      var mainRect = mainEl.getBoundingClientRect();
      var startRect = startEl.getBoundingClientRect();
      var endRect = endEl.getBoundingClientRect();
      var top = startRect.top - mainRect.top;
      var height = endRect.bottom - startRect.top;
      if (height <= 0) return false;
      wormCanvas.style.top = top + "px";
      wormCanvas.style.height = height + "px";
      wormW = wormCanvas.width = wormCanvas.offsetWidth;
      wormH = wormCanvas.height = height;
      wormCols = Math.max(6, Math.floor(wormW / WORM_CELL));
      wormRows = Math.max(6, Math.floor(wormH / WORM_CELL));
      wormComputeBlocked();
      return true;
    }

    // marks the grid cells under the headline, copy, and button as
    // off-limits so the worm's path stays clear of the text
    function wormComputeBlocked() {
      wormBlocked = [];
      for (var y = 0; y < wormRows; y++) wormBlocked.push(new Array(wormCols).fill(false));
      var panel = document.querySelector(".budget-cta-panel");
      if (!panel) return;
      var canvasRect = wormCanvas.getBoundingClientRect();
      var pad = 8;
      var els = panel.querySelectorAll("h2, .lede, .budget-tool-cta-btn");
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var c0 = Math.max(0, Math.floor((r.left - canvasRect.left - pad) / WORM_CELL));
        var c1 = Math.min(wormCols - 1, Math.ceil((r.right - canvasRect.left + pad) / WORM_CELL));
        var r0 = Math.max(0, Math.floor((r.top - canvasRect.top - pad) / WORM_CELL));
        var r1 = Math.min(wormRows - 1, Math.ceil((r.bottom - canvasRect.top + pad) / WORM_CELL));
        for (var y = r0; y <= r1; y++) {
          for (var x = c0; x <= c1; x++) {
            if (wormBlocked[y]) wormBlocked[y][x] = true;
          }
        }
      });
    }

    function wormInBounds(x, y) {
      return x >= 0 && x < wormCols && y >= 0 && y < wormRows;
    }

    function wormCellBlocked(x, y) {
      return !!(wormBlocked[y] && wormBlocked[y][x]);
    }

    function wormRandCell() {
      return { x: Math.floor(Math.random() * wormCols), y: Math.floor(Math.random() * wormRows) };
    }

    function wormCellFree(x, y) {
      for (var i = 0; i < snake.length; i++) {
        if (snake[i].x === x && snake[i].y === y) return false;
      }
      return true;
    }

    // picks a genuinely random free cell, only rejecting ones that land too
    // close to the head, so food doesn't always land in the same spot but
    // still makes the worm travel a real distance to reach it
    var WORM_FOOD_MIN_DIST = 100; // px
    function wormPlaceFood() {
      var head = snake[0];
      var c, tries = 0, dist;
      do {
        c = wormRandCell();
        var dx = (c.x - head.x) * WORM_CELL;
        var dy = (c.y - head.y) * WORM_CELL;
        dist = Math.sqrt(dx * dx + dy * dy);
        tries++;
      } while (
        (!wormCellFree(c.x, c.y) || wormCellBlocked(c.x, c.y) || dist < WORM_FOOD_MIN_DIST) &&
        tries < 300
      );
      food = c;
    }

    function wormFindFreeCell() {
      var c, tries = 0;
      do {
        c = wormRandCell();
        tries++;
      } while (wormCellBlocked(c.x, c.y) && tries < 300);
      return c;
    }

    function wormReset() {
      var start = wormFindFreeCell();
      dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      var tries = 0;
      while (!wormInBounds(start.x - dir.dx * 2, start.y - dir.dy * 2) && tries < 8) {
        dir = DIRS[Math.floor(Math.random() * DIRS.length)];
        tries++;
      }
      snake = [];
      for (var i = 0; i < 3; i++) {
        snake.push({ x: start.x - dir.dx * i, y: start.y - dir.dy * i });
      }
      length = 3;
      mode = "wander";
      offscreenTicks = 0;
      wormPlaceFood();
    }

    // shortest-path step toward target around blocked (text/button) cells,
    // so the worm can actually route from one side of the panel to the
    // other instead of getting stuck butting against the text block
    function wormBfsDir(head, target) {
      if (head.x === target.x && head.y === target.y) return null;
      var visited = [];
      for (var y = 0; y < wormRows; y++) visited.push(new Array(wormCols).fill(false));
      var cameFrom = Object.create(null);
      var key = function (x, y) { return x + "," + y; };
      visited[head.y][head.x] = true;
      var queue = [head];
      var qi = 0;
      var found = false;
      while (qi < queue.length && !found) {
        var cur = queue[qi++];
        for (var i = 0; i < DIRS.length; i++) {
          var d = DIRS[i];
          var nx = cur.x + d.dx, ny = cur.y + d.dy;
          if (!wormInBounds(nx, ny) || wormCellBlocked(nx, ny) || visited[ny][nx]) continue;
          visited[ny][nx] = true;
          cameFrom[key(nx, ny)] = cur;
          if (nx === target.x && ny === target.y) { found = true; break; }
          queue.push({ x: nx, y: ny });
        }
      }
      if (!found) return null;
      var cur = target;
      var prev = cameFrom[key(cur.x, cur.y)];
      while (prev && !(prev.x === head.x && prev.y === head.y)) {
        cur = prev;
        prev = cameFrom[key(cur.x, cur.y)];
      }
      return { dx: cur.x - head.x, dy: cur.y - head.y };
    }

    // mostly drifts toward the food (so it actually gets eaten instead of
    // wandering off into a grid that spans several screens), but still turns
    // randomly often enough to look like it's wandering rather than homing in
    function wormChooseDir() {
      var head = snake[0];
      var options = DIRS.filter(function (d) {
        if (d.dx === -dir.dx && d.dy === -dir.dy) return false;
        var nx = head.x + d.dx, ny = head.y + d.dy;
        return wormInBounds(nx, ny) && !wormCellBlocked(nx, ny);
      });
      if (options.length === 0) {
        // boxed in: allow reversing, but never step onto text/button cells
        options = DIRS.filter(function (d) {
          var nx = head.x + d.dx, ny = head.y + d.dy;
          return wormInBounds(nx, ny) && !wormCellBlocked(nx, ny);
        });
      }
      if (options.length === 0) return null; // fully boxed in by text on every side

      if (food && Math.random() < 0.65) {
        var bfsDir = wormBfsDir(head, food);
        if (bfsDir && options.some(function (d) { return d.dx === bfsDir.dx && d.dy === bfsDir.dy; })) {
          return bfsDir;
        }
        var best = options[0], bestDist = Infinity;
        options.forEach(function (d) {
          var dist = Math.abs(head.x + d.dx - food.x) + Math.abs(head.y + d.dy - food.y);
          if (dist < bestDist) { bestDist = dist; best = d; }
        });
        return best;
      }

      var keepsCurrent = options.some(function (d) { return d.dx === dir.dx && d.dy === dir.dy; });
      if (keepsCurrent && Math.random() > 0.25) return dir;
      return options[Math.floor(Math.random() * options.length)];
    }

    // during the exit dash, keep heading toward the edge but detour around
    // text/button cells instead of cutting through them
    function wormChooseExitDir() {
      var head = snake[0];
      var options = DIRS.filter(function (d) {
        var nx = head.x + d.dx, ny = head.y + d.dy;
        if (wormInBounds(nx, ny) && wormCellBlocked(nx, ny)) return false;
        return true; // leaving the grid entirely is fine, that's the goal
      });
      if (options.length === 0) return dir;
      var keepsCurrent = options.some(function (d) { return d.dx === dir.dx && d.dy === dir.dy; });
      if (keepsCurrent) return dir;
      var exitDx = dir.dx, exitDy = dir.dy;
      var best = options[0], bestScore = -Infinity;
      options.forEach(function (d) {
        var score = d.dx * exitDx + d.dy * exitDy;
        if (score > bestScore) { bestScore = score; best = d; }
      });
      return best;
    }

    function wormRoundRect(x, y, w, h, r) {
      wctx.beginPath();
      wctx.moveTo(x + r, y);
      wctx.arcTo(x + w, y, x + w, y + h, r);
      wctx.arcTo(x + w, y + h, x, y + h, r);
      wctx.arcTo(x, y + h, x, y, r);
      wctx.arcTo(x, y, x + w, y, r);
      wctx.closePath();
      wctx.fill();
    }

    function wormDraw() {
      wctx.clearRect(0, 0, wormW, wormH);

      if (food) {
        wctx.fillStyle = "#F5EBD7";
        wctx.beginPath();
        wctx.arc(food.x * WORM_CELL + WORM_CELL / 2, food.y * WORM_CELL + WORM_CELL / 2, 4, 0, Math.PI * 2);
        wctx.fill();
      }

      wctx.fillStyle = "#FF7A1A";
      var pad = 3;
      for (var i = 0; i < snake.length; i++) {
        var s = snake[i];
        if (!wormInBounds(s.x, s.y)) continue;
        wormRoundRect(s.x * WORM_CELL + pad / 2, s.y * WORM_CELL + pad / 2, WORM_CELL - pad, WORM_CELL - pad, 5);
      }
    }

    function wormTick() {
      var head = snake[0];

      if (mode === "exit") {
        dir = wormChooseExitDir();
        var ex = head.x + dir.dx, ey = head.y + dir.dy;
        snake.unshift({ x: ex, y: ey });
        snake.pop();
        if (!wormInBounds(ex, ey)) offscreenTicks++;
        if (offscreenTicks > length + 2) wormReset();
        wormDraw();
        return;
      }

      var chosen = wormChooseDir();
      if (!chosen) { wormReset(); wormDraw(); return; }
      dir = chosen;
      var nx = head.x + dir.dx, ny = head.y + dir.dy;
      snake.unshift({ x: nx, y: ny });

      var ate = food && nx === food.x && ny === food.y;
      if (ate) {
        length++;
        if (length >= WORM_MAX_LENGTH) {
          mode = "exit";
          food = null;
          // head for whichever side is closer so it reliably exits quickly
          // even though the grid can be many screens tall
          dir = (nx < wormCols / 2) ? { dx: -1, dy: 0 } : { dx: 1, dy: 0 };
        } else {
          wormPlaceFood();
        }
      } else {
        snake.pop();
      }

      wormDraw();
    }

    function wormStart() {
      if (!wormResizeCanvas()) return;
      wormReset();
      wormDraw();
      if (wormTimer) clearInterval(wormTimer);
      wormTimer = setInterval(wormTick, 230);
    }

    window.addEventListener("resize", wormStart);
    window.addEventListener("load", wormStart);
    wormStart();
  }

  /* ---- HVR 3D Tilt Card (owner section) ---- */
  var tiltCard = document.getElementById("ownerTiltCard");
  var tiltGloss = document.getElementById("ownerTiltGloss");
  if (tiltCard && tiltGloss && !prefersReducedMotion) {
    var TILT_MAX = 8; // degrees, kept subtle for a content-heavy card
    tiltCard.addEventListener("pointermove", function (e) {
      var r = tiltCard.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      tiltCard.classList.add("is-tilting");
      tiltCard.style.transform =
        "rotateY(" + (px - 0.5) * 2 * TILT_MAX + "deg) " +
        "rotateX(" + (0.5 - py) * 2 * TILT_MAX + "deg)";
      tiltGloss.style.setProperty("--gx", px * 100 + "%");
      tiltGloss.style.setProperty("--gy", py * 100 + "%");
    });
    tiltCard.addEventListener("pointerleave", function () {
      tiltCard.classList.remove("is-tilting");
      tiltCard.style.transform = "";
      tiltGloss.style.setProperty("--gx", "50%");
      tiltGloss.style.setProperty("--gy", "50%");
    });
  }

  /* ---- SCR Text Fills on Scroll ---- */
  var whyChooseHeading = document.getElementById("whyChooseHeading");
  var whyChooseFill = document.getElementById("whyChooseFill");
  var capsWord = document.getElementById("whyChooseCapsWord");
  if (whyChooseHeading && !prefersReducedMotion) {
    var fillTicking = false;
    var capsLetters = [];

    if (capsWord) {
      capsWord.innerHTML = capsWord.textContent
        .split("")
        .map(function (c) { return "<span>" + c + "</span>"; })
        .join("");
      capsLetters = Array.prototype.slice.call(capsWord.querySelectorAll("span"));
    }

    var fillSpans = [whyChooseFill, capsWord].filter(Boolean);

    var measureFillSpans = function () {
      var headRect = whyChooseHeading.getBoundingClientRect();
      if (headRect.width === 0) return;
      fillSpans.forEach(function (span) {
        var r = span.getBoundingClientRect();
        span._start = (r.left - headRect.left) / headRect.width;
        span._end = (r.right - headRect.left) / headRect.width;
      });
      capsLetters.forEach(function (letter) {
        var r = letter.getBoundingClientRect();
        letter._threshold = (r.left - headRect.left) / headRect.width;
      });
    };

    var SLOW_FACTOR = 0.7; // scales the scroll distance the fill needs; <1 makes it complete faster

    var updateFill = function () {
      var vh = window.innerHeight;
      var rect = whyChooseHeading.getBoundingClientRect();
      var total = (vh + rect.height) * SLOW_FACTOR;
      var p = Math.min(Math.max((vh - rect.top) / total, 0), 1);
      // Each span fills on its own local percentage, remapped from the
      // single global sweep so it reads as one continuous pass changing
      // color as it crosses from "Why Choose" into "Bedrock Bookkeeping".
      fillSpans.forEach(function (span) {
        var spanP = (p - span._start) / (span._end - span._start);
        spanP = Math.min(Math.max(spanP, 0), 1);
        span.style.setProperty("--p", spanP * 100 + "%");
      });
      // Each letter snaps to caps individually, right as the fill sweeps over it.
      capsLetters.forEach(function (letter) {
        letter.classList.toggle("is-capped", p >= letter._threshold);
      });
      fillTicking = false;
    };

    measureFillSpans();
    updateFill();
    window.addEventListener("scroll", function () {
      if (!fillTicking) {
        window.requestAnimationFrame(updateFill);
        fillTicking = true;
      }
    }, { passive: true });
    window.addEventListener("resize", function () {
      measureFillSpans();
      updateFill();
    }, { passive: true });
  }

  /* ---- TRN-01 Page Load Curtain, handing off into the header via LAY-03 ---- */
  var curtain = document.getElementById("page-curtain");
  var headerLogoText = document.getElementById("header-logo-text");

  if (curtain && !prefersReducedMotion) {
    // The curtain's big centered wordmark stands in for the header's until
    // it flies into place, so hide the real one to avoid showing both at once.
    if (headerLogoText) headerLogoText.style.opacity = "0";

    var flipLogoIntoHeader = function () {
      var heading = document.getElementById("curtain-heading");
      if (!heading || !headerLogoText) {
        curtain.remove();
        if (headerLogoText) headerLogoText.style.opacity = "1";
        return;
      }

      // FLIP: measure where the curtain text is, then fake the header
      // wordmark into that exact spot before animating it home.
      var fromRect = heading.getBoundingClientRect();
      var toRect = headerLogoText.getBoundingClientRect();
      var scale = fromRect.width / toRect.width;
      var dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
      var dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);

      headerLogoText.style.position = "relative";
      headerLogoText.style.zIndex = "5";
      headerLogoText.style.transition = "none";
      headerLogoText.style.transformOrigin = "center center";
      headerLogoText.style.transform = "translate(" + dx + "px, " + dy + "px) scale(" + scale + ")";
      headerLogoText.style.opacity = "1";

      void headerLogoText.offsetWidth; // commit the starting position before animating away from it

      curtain.remove();

      headerLogoText.style.transition = "transform 0.38s cubic-bezier(0.65, 0, 0.35, 1)";
      headerLogoText.style.transform = "none";

      window.setTimeout(function () {
        headerLogoText.style.transition = "";
        headerLogoText.style.transformOrigin = "";
        headerLogoText.style.position = "";
        headerLogoText.style.zIndex = "";
        headerLogoText.style.transform = "";
      }, 420);
    };

    window.setTimeout(function () {
      curtain.classList.add("is-open");
      // Intro animation (the 0.5s wipe) finishes 0.5s from here; hold the
      // wordmark centered for another 0.4s past that before it flies into the header.
      window.setTimeout(flipLogoIntoHeader, 900);
    }, 200);
  } else if (curtain) {
    curtain.remove();
  }

  /* ---- LAY-03 Shrinking Sticky Header ---- */
  var header = document.querySelector(".site-header");
  if (header) {
    var headerTicking = false;
    var updateHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
      headerTicking = false;
    };
    updateHeader();
    window.addEventListener("scroll", function () {
      if (!headerTicking) {
        window.requestAnimationFrame(updateHeader);
        headerTicking = true;
      }
    }, { passive: true });
  }

  /* ---- TRN-04 Slide-Out Drawer ---- */
  var toggle = document.querySelector(".nav-toggle");
  var mobileMenu = document.querySelector(".mobile-menu");
  var menuScrim = document.querySelector(".menu-scrim");
  var menuClose = document.querySelector(".mobile-menu-close");

  function openMenu() {
    mobileMenu.classList.add("is-open");
    if (menuScrim) menuScrim.classList.add("is-open");
    mobileMenu.removeAttribute("inert"); // let the now-visible links back into the tab order
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    var firstLink = mobileMenu.querySelector("a");
    if (firstLink) firstLink.focus();
    // Restart the "Budget Tool" bounce from zero so its 0.3s delay + 3.25s
    // loop is always timed from this exact open, not wherever it was left.
    if (!prefersReducedMotion) {
      var drawerBounce = mobileMenu.querySelector(".nav-bounce-drawer");
      if (drawerBounce) {
        drawerBounce.style.animation = "none";
        void drawerBounce.offsetWidth;
        drawerBounce.style.animation = "";
        drawerBounce.style.animationPlayState = "running";
      }
    }
  }
  function closeMenu() {
    mobileMenu.classList.remove("is-open");
    if (menuScrim) menuScrim.classList.remove("is-open");
    mobileMenu.setAttribute("inert", ""); // off-canvas links shouldn't be tabbable or announced
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    toggle.focus();
    var drawerBounce = mobileMenu.querySelector(".nav-bounce-drawer");
    if (drawerBounce) drawerBounce.style.animationPlayState = "paused";
  }
  if (toggle && mobileMenu) {
    toggle.addEventListener("click", function () {
      var isOpen = mobileMenu.classList.contains("is-open");
      isOpen ? closeMenu() : openMenu();
    });
    if (menuClose) menuClose.addEventListener("click", closeMenu);
    if (menuScrim) menuScrim.addEventListener("click", closeMenu);
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && mobileMenu.classList.contains("is-open")) closeMenu();
    });
  }

  /* ---- Scroll reveal animation (GSAP if available, CSS fallback otherwise) ---- */
  function revealImmediately() {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  if (prefersReducedMotion || typeof gsap === "undefined") {
    revealImmediately();
  } else {
    gsap.registerPlugin(ScrollTrigger);

    var groups = {};
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      var group = el.getAttribute("data-reveal-group") || el;
      if (!groups[group] || group === el) {
        groups[group] = groups[group] || [];
      }
    });

    // Stagger elements sharing a data-reveal-group, animate singles individually.
    var handled = new Set();
    document.querySelectorAll("[data-reveal-group]").forEach(function (el) {
      var key = el.getAttribute("data-reveal-group");
      if (handled.has(key)) return;
      handled.add(key);
      var items = document.querySelectorAll('[data-reveal-group="' + key + '"]');
      gsap.set(items, { opacity: 0, y: 24 });
      gsap.to(items, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: items[0],
          start: "top 85%",
          once: true
        }
      });
    });

    document.querySelectorAll("[data-reveal]:not([data-reveal-group])").forEach(function (el) {
      gsap.set(el, { opacity: 0, y: 24 });
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          once: true
        }
      });
    });

    // Hero entrance (runs immediately, no scroll trigger needed).
    // Each step is only queued if its element actually exists on this page,
    // since not every page's hero has the same pieces (badges, card, etc).
    if (document.querySelector(".hero")) {
      var heroTl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.9 } });
      var heroSteps = [
        [".hero .eyebrow", { opacity: 0, y: 14 }, undefined],
        [".hero h1", { opacity: 0, y: 22 }, "-=0.6"],
        [".hero .lede", { opacity: 0, y: 16 }, "-=0.6"],
        [".hero-actions", { opacity: 0, y: 16 }, "-=0.55"],
        [".hero-badges", { opacity: 0, y: 16 }, "-=0.5"],
        [".hero-photo", { opacity: 0, y: 24, scale: 0.97 }, "-=0.75"]
      ];
      heroSteps.forEach(function (step) {
        if (document.querySelector(step[0])) {
          heroTl.from(step[0], step[1], step[2]);
        }
      });
    }

    // Hero card bars grow in once the entrance timeline is underway.
    var heroBars = document.querySelectorAll(".hero-bars .col");
    if (heroBars.length) {
      gsap.set(heroBars, { scaleY: 0 });
      gsap.to(heroBars, { scaleY: 1, duration: 0.7, ease: "power3.out", stagger: 0.08, delay: 0.6 });
    }

    // Entrance / splash page (index.html): logo scales in, tagline follows.
    if (document.querySelector(".entrance-link")) {
      // .entrance-hint isn't animated here: it has its own perpetual CSS
      // pulse (see styles.css), and animating opacity from both GSAP and
      // a CSS keyframe animation at once causes the two to fight.
      gsap.timeline({ defaults: { ease: "power3.out", duration: 1 } })
        .from(".entrance-logo", { opacity: 0, scale: 0.85, y: 16 })
        .from(".entrance-tagline", { opacity: 0, y: 12 }, "-=0.6");
    }

    // Coming soon page: same intro treatment, plus its own text block.
    if (document.querySelector(".coming-soon")) {
      gsap.timeline({ defaults: { ease: "power3.out", duration: 1 } })
        .from(".coming-soon .entrance-logo", { opacity: 0, scale: 0.85, y: 16 })
        .from(".coming-soon .entrance-tagline", { opacity: 0, y: 12 }, "-=0.6")
        .from(".coming-soon-message", { opacity: 0, y: 12 }, "-=0.5")
        .from(".coming-soon-contact", { opacity: 0, y: 10 }, "-=0.5");
    }
  }

  /* ---- Contact form (progressive: works with any form backend endpoint) ---- */
  var form = document.querySelector("#contact-form");
  if (form) {
    var status = form.querySelector(".form-status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('button[type="submit"]');
      var endpoint = form.getAttribute("action");
      var placeholderEndpoint = !endpoint || endpoint.indexOf("YOUR_FORM_ID") !== -1;

      /* ---- UI Button Load to Success ---- */
      // Lock the current width first so the collapse to a circle animates
      // from a real number instead of jumping straight to 50px.
      submitBtn.style.width = submitBtn.offsetWidth + "px";
      submitBtn.disabled = true;
      void submitBtn.offsetWidth; // force layout to commit the locked width before collapsing
      submitBtn.classList.add("is-busy");

      function showStatus(type, message) {
        status.className = "form-status " + type;
        status.setAttribute("role", "alert");
        status.textContent = message;
        if (type === "success") {
          submitBtn.classList.remove("is-busy");
          submitBtn.classList.add("is-done");
          submitBtn.disabled = true;
        } else {
          submitBtn.classList.remove("is-busy");
          submitBtn.style.width = "";
          submitBtn.disabled = false;
        }
      }

      if (placeholderEndpoint) {
        // No form backend configured yet: surface a clear message instead of failing silently.
        window.setTimeout(function () {
          showStatus(
            "error",
            "This form isn't connected to an inbox yet. In the meantime, please email " +
            "mikeyounie@hotmail.com or call directly."
          );
        }, 400);
        return;
      }

      fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form)
      })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            showStatus("success", "Thanks — your message is in. We'll reply within one business day.");
          } else {
            showStatus("error", "Something went wrong sending that. Please try again or email us directly.");
          }
        })
        .catch(function () {
          showStatus("error", "Something went wrong sending that. Please try again or email us directly.");
        });
    });
  }

  /* ---- Current year ---- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
