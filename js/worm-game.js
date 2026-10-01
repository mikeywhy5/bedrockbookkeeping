(function () {
  "use strict";

  var canvas = document.getElementById("wormGameCanvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("wormGameOverlay");
  var overlayTitle = document.getElementById("wormGameOverlayTitle");
  var overlayText = document.getElementById("wormGameOverlayText");
  var startBtn = document.getElementById("wormGameStartBtn");
  var lengthEl = document.getElementById("wormGameLength");
  var bestEl = document.getElementById("wormGameBest");

  var CELL = 24;
  var TICK_MS = 130;

  var cols, rows;
  var snake, dir, pendingDir, length, food, state, timer;
  var prizeClaimed = false;
  var bonusMode = false;

  // each milestone recolors the worm and fires a pulse in that color;
  // checked in ascending order so the highest one reached always wins
  var COLOR_TIERS = [
    { length: 20, head: "#86EFAC", body: "#34D399", ring: "52, 211, 153" },
    { length: 40, head: "#FCA5A5", body: "#F87171", ring: "248, 113, 113" },
    { length: 60, head: "#D8B4FE", body: "#A855F7", ring: "168, 85, 247" }
  ];
  var BASE_HEAD = "#FFA057";
  var BASE_BODY = "#FF7A1A";

  function currentTier(len) {
    var tier = null;
    for (var i = 0; i < COLOR_TIERS.length; i++) {
      if (len >= COLOR_TIERS[i].length) tier = COLOR_TIERS[i];
    }
    return tier;
  }

  var BEST_KEY = "bedrock-worm-game-best";
  var best = 0;
  try {
    best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
  } catch (e) { best = 0; }
  bestEl.textContent = best;

  function saveBest() {
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
  }

  function sizeCanvas() {
    var wrap = canvas.parentElement;
    var width = Math.round(wrap.getBoundingClientRect().width);
    var height = Math.round(Math.min(width * 0.6, window.innerHeight * 0.7));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    cols = Math.max(10, Math.floor(width / CELL));
    rows = Math.max(10, Math.floor(height / CELL));
  }

  function randCell() {
    return { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  }

  function cellFree(x, y) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === x && snake[i].y === y) return false;
    }
    return true;
  }

  function placeFood() {
    var c, tries = 0;
    do {
      c = randCell();
      tries++;
    } while (!cellFree(c.x, c.y) && tries < 300);
    food = c;
  }

  function resetGame() {
    var startX = Math.floor(cols / 2);
    var startY = Math.floor(rows / 2);
    dir = { dx: 1, dy: 0 };
    pendingDir = dir;
    snake = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY }
    ];
    length = 3;
    lengthEl.textContent = length;
    bonusMode = false;
    placeFood();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (food) {
      ctx.fillStyle = "#F5EBD7";
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    var tier = currentTier(length);
    var headColor = tier ? tier.head : BASE_HEAD;
    var bodyColor = tier ? tier.body : BASE_BODY;

    var pad = 3;
    for (var i = 0; i < snake.length; i++) {
      var s = snake[i];
      ctx.fillStyle = i === 0 ? headColor : bodyColor;
      roundRect(s.x * CELL + pad / 2, s.y * CELL + pad / 2, CELL - pad, CELL - pad, 5);
    }
  }

  function showOverlay(title, html, btnLabel) {
    overlayTitle.textContent = title;
    overlayText.innerHTML = html;
    startBtn.textContent = btnLabel;
    startBtn.classList.remove("is-claim");
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function celebrate(ringRgb) {
    state = "celebrating";
    bonusMode = true;
    clearInterval(timer);
    var head = snake[0];
    var cx = head.x * CELL + CELL / 2;
    var cy = head.y * CELL + CELL / 2;
    var duration = 200;
    var start = performance.now();
    var maxRadius = Math.max(canvas.width, canvas.height) * 0.55;

    function frame(now) {
      var elapsed = now - start;
      var t = Math.min(elapsed / duration, 1);
      draw();
      ctx.beginPath();
      ctx.arc(cx, cy, t * maxRadius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(" + ringRgb + ", " + (1 - t) + ")";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (elapsed < duration) {
        requestAnimationFrame(frame);
      } else {
        draw();
        state = "playing";
        timer = setInterval(tick, TICK_MS);
      }
    }
    requestAnimationFrame(frame);
  }

  function endGame(reason) {
    state = "gameover";
    clearInterval(timer);
    showCursor();
    prizeClaimed = false;
    if (length > best) {
      best = length;
      bestEl.textContent = best;
      saveBest();
    }
    var msg = reason === "wall"
      ? "The worm hit the wall at " + length + " units long."
      : "The worm ran into itself at " + length + " units long.";
    showOverlay("Game over", msg, bonusMode ? "CLAIM PRIZE" : "Try Again");
    if (bonusMode) startBtn.classList.add("is-claim");
  }

  function tick() {
    dir = pendingDir;
    var head = snake[0];
    var nx = head.x + dir.dx;
    var ny = head.y + dir.dy;

    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
      endGame("wall");
      return;
    }

    var ate = food && nx === food.x && ny === food.y;
    var body = ate ? snake : snake.slice(0, snake.length - 1);
    for (var i = 0; i < body.length; i++) {
      if (body[i].x === nx && body[i].y === ny) {
        endGame("self");
        return;
      }
    }

    snake.unshift({ x: nx, y: ny });
    if (ate) {
      length++;
      lengthEl.textContent = length;
      placeFood();
      var hitTier = null;
      for (var j = 0; j < COLOR_TIERS.length; j++) {
        if (COLOR_TIERS[j].length === length) hitTier = COLOR_TIERS[j];
      }
      if (hitTier) {
        draw();
        celebrate(hitTier.ring);
        return;
      }
    } else {
      snake.pop();
    }

    draw();
  }

  function startGame() {
    sizeCanvas();
    resetGame();
    state = "playing";
    hideOverlay();
    canvas.focus();
    draw();
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  var KEY_DIRS = {
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 }
  };

  canvas.addEventListener("keydown", function (e) {
    var next = KEY_DIRS[e.key];
    if (!next) return;
    e.preventDefault();
    if (state !== "playing") return;
    // ignore reversing directly into the neck
    if (next.dx === -dir.dx && next.dy === -dir.dy) return;
    pendingDir = next;
  });

  var cursorTimer = null;
  var CURSOR_IDLE_MS = 200;

  function showCursor() {
    clearTimeout(cursorTimer);
    canvas.classList.remove("cursor-hidden");
  }

  canvas.addEventListener("mousemove", function () {
    showCursor();
    if (state !== "playing") return;
    cursorTimer = setTimeout(function () {
      canvas.classList.add("cursor-hidden");
    }, CURSOR_IDLE_MS);
  });

  canvas.addEventListener("mouseleave", showCursor);

  startBtn.addEventListener("click", function () {
    if (state === "gameover" && bonusMode && !prizeClaimed) {
      prizeClaimed = true;
      showOverlay("CONGRATULATIONS", "You've earned <span class=\"worm-game-highlight\">20% OFF</span>! Use code \"<span class=\"worm-game-highlight\">BOOKWORM</span>\" to earn your discount", "Try Again");
      return;
    }
    startGame();
  });

  window.addEventListener("resize", function () {
    if (state === "playing") {
      clearInterval(timer);
      state = "idle";
      showCursor();
      showOverlay("Ready?", "The board resized — press Start to play again.", "Start Game");
    }
    if (state !== "playing") {
      sizeCanvas();
      if (snake) draw();
    }
  });

  sizeCanvas();
  resetGame();
  state = "idle";
  draw();
})();
