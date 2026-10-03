(function () {
  'use strict';

  var SIZE = 4;
  var START_TILES = 2;
  var WIN_VALUE = 2048;
  var STORAGE_KEY = 'best-score-2048';

  var boardEl = document.getElementById('board');
  var gridBgEl = document.getElementById('grid-bg');
  var tileLayerEl = document.getElementById('tile-layer');
  var scoreEl = document.getElementById('score');
  var bestEl = document.getElementById('best');
  var overlayEl = document.getElementById('overlay');
  var overlayTitleEl = document.getElementById('overlay-title');
  var overlayTextEl = document.getElementById('overlay-text');
  var overlayRetryEl = document.getElementById('overlay-retry');
  var overlayKeepEl = document.getElementById('overlay-keep');
  var newGameEl = document.getElementById('new-game');

  var grid = [];
  var tileEls = [];
  var score = 0;
  var best = 0;
  var gameOver = false;
  var won = false;
  var keepPlaying = false;
  var animating = false;

  var cellSize = 0;
  var gap = 12;

  function readMetrics() {
    var styles = getComputedStyle(document.documentElement);
    var g = parseFloat(styles.getPropertyValue('--gap'));
    if (!isNaN(g)) gap = g;
    var layerRect = tileLayerEl.getBoundingClientRect();
    cellSize = (layerRect.width - gap * (SIZE - 1)) / SIZE;
  }

  function tilePosition(row, col) {
    return { x: col * (cellSize + gap), y: row * (cellSize + gap) };
  }

  function applyTileLayout(el, row, col) {
    var pos = tilePosition(row, col);
    el.style.width = cellSize + 'px';
    el.style.height = cellSize + 'px';
    el.style.transform = 'translate(' + pos.x + 'px, ' + pos.y + 'px)';
    el.style.fontSize = fontSizeForValue(el.dataset.value) + 'px';
  }

  function fontSizeForValue(value) {
    var v = parseInt(value, 10) || 2;
    var base = cellSize * 0.45;
    var digits = String(v).length;
    var factor = digits <= 2 ? 1 : digits === 3 ? 0.78 : digits === 4 ? 0.62 : 0.5;
    return Math.max(12, Math.round(base * factor));
  }

  function buildGridBackground() {
    gridBgEl.innerHTML = '';
    for (var i = 0; i < SIZE * SIZE; i++) {
      var cell = document.createElement('div');
      cell.className = 'grid-cell';
      gridBgEl.appendChild(cell);
    }
  }

  function tileClass(value) {
    if (value > 2048) return 'tile t-super';
    return 'tile t' + value;
  }

  function createTileElement(value, row, col) {
    var el = document.createElement('div');
    el.className = tileClass(value);
    el.dataset.value = String(value);
    var inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.textContent = String(value);
    el.appendChild(inner);
    tileLayerEl.appendChild(el);
    applyTileLayout(el, row, col);
    return el;
  }

  function repositionAll() {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (tileEls[r][c]) {
          applyTileLayout(tileEls[r][c], r, c);
          tileEls[r][c].style.fontSize = fontSizeForValue(grid[r][c]) + 'px';
        }
      }
    }
  }

  function updateScore() {
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch (e) {}
    }
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('pop');
  }

  function emptyCells() {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (!grid[r][c]) cells.push({ r: r, c: c });
      }
    }
    return cells;
  }

  function addRandomTile() {
    var cells = emptyCells();
    if (!cells.length) return null;
    var pick = cells[Math.floor(Math.random() * cells.length)];
    var value = Math.random() < 0.9 ? 2 : 4;
    grid[pick.r][pick.c] = value;
    var el = createTileElement(value, pick.r, pick.c);
    el.classList.add('new');
    tileEls[pick.r][pick.c] = el;
    return { r: pick.r, c: pick.c };
  }

  function newGame() {
    grid = [];
    tileEls = [];
    for (var r = 0; r < SIZE; r++) {
      grid[r] = [];
      for (var c = 0; c < SIZE; c++) grid[r][c] = 0;
    }
    score = 0;
    gameOver = false;
    won = false;
    keepPlaying = false;
    animating = false;
    tileLayerEl.innerHTML = '';
    scoreEl.textContent = '0';
    hideOverlay();
    readMetrics();
    for (var i = 0; i < START_TILES; i++) {
      try {
        addRandomTile();
      } catch (e) {
        if (window.console && console.error) console.error('2048 add tile error:', e);
      }
    }
  }

  function getEmptyMatrix() {
    var m = [];
    for (var r = 0; r < SIZE; r++) {
      m[r] = [];
      for (var c = 0; c < SIZE; c++) m[r][c] = null;
    }
    return m;
  }

  function traverse(direction, callback) {
    var rows = [], cols = [];
    for (var i = 0; i < SIZE; i++) { rows.push(i); cols.push(i); }
    var rowOrder = direction === 'up' ? rows.slice() : rows.slice().reverse();
    var colOrder = direction === 'left' ? cols.slice() : cols.slice().reverse();
    for (var ri = 0; ri < rowOrder.length; ri++) {
      for (var ci = 0; ci < colOrder.length; ci++) {
        callback(rowOrder[ri], colOrder[ci]);
      }
    }
  }

  function vectorOf(direction) {
    switch (direction) {
      case 'up': return { dr: -1, dc: 0 };
      case 'down': return { dr: 1, dc: 0 };
      case 'left': return { dr: 0, dc: -1 };
      case 'right': return { dr: 0, dc: 1 };
    }
    return { dr: 0, dc: 0 };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function moveDirection(direction) {
    var vec = vectorOf(direction);
    var moved = false;
    var merged = [];
    var traversed = getEmptyMatrix();
    var newGrid = [];
    for (var r = 0; r < SIZE; r++) {
      newGrid[r] = [];
      for (var c = 0; c < SIZE; c++) newGrid[r][c] = 0;
    }

    traverse(direction, function (row, col) {
      var value = grid[row][col];
      if (!value) return;
      var nr = row + vec.dr;
      var nc = col + vec.dc;
      while (inBounds(nr + vec.dr, nc + vec.dc) && traversed[nr][nc] === null) {
        nr += vec.dr;
        nc += vec.dc;
      }
      if (inBounds(nr, nc) && traversed[nr][nc] === null) {
        traversed[nr][nc] = { value: value, from: { r: row, c: col } };
      } else if (inBounds(nr, nc) && traversed[nr][nc].value === value) {
        traversed[nr][nc] = { value: value * 2, mergedFrom: traversed[nr][nc], from: { r: row, c: col } };
        merged.push({ r: nr, c: nc });
      } else {
        nr -= vec.dr;
        nc -= vec.dc;
        traversed[nr][nc] = { value: value, from: { r: row, c: col } };
      }
      if (nr !== row || nc !== col) moved = true;
    });

    for (var rr = 0; rr < SIZE; rr++) {
      for (var cc = 0; cc < SIZE; cc++) {
        if (traversed[rr][cc]) newGrid[rr][cc] = traversed[rr][cc].value;
      }
    }
    return { moved: moved, merged: merged, traversed: traversed, newGrid: newGrid };
  }

  function animateAndCommit(direction, result) {
    var traversed = result.traversed;
    var newEls = getEmptyMatrix();
    var mergedSet = {};
    for (var i = 0; i < result.merged.length; i++) {
      mergedSet[result.merged[i].r + ',' + result.merged[i].c] = true;
    }
    tileLayerEl.innerHTML = '';

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var entry = traversed[r][c];
        if (!entry) { newEls[r][c] = null; continue; }
        var value = entry.value;
        var el = document.createElement('div');
        el.className = tileClass(value);
        el.dataset.value = String(value);
        var inner = document.createElement('div');
        inner.className = 'tile-inner';
        inner.textContent = String(value);
        el.appendChild(inner);
        var from = entry.from;
        var startPos = tilePosition(from.r, from.c);
        var endPos = tilePosition(r, c);
        el.style.width = cellSize + 'px';
        el.style.height = cellSize + 'px';
        el.style.fontSize = fontSizeForValue(value) + 'px';
        el.style.transition = 'none';
        el.style.transform = 'translate(' + startPos.x + 'px, ' + startPos.y + 'px)';
        if (mergedSet[r + ',' + c]) el.classList.add('merged');
        tileLayerEl.appendChild(el);
        newEls[r][c] = el;
        void el.offsetWidth;
        el.style.transition = 'transform 0.12s ease-in-out';
        el.style.transform = 'translate(' + endPos.x + 'px, ' + endPos.y + 'px)';
      }
    }

    grid = result.newGrid;
    tileEls = newEls;

    var gained = 0;
    for (var mi = 0; mi < result.merged.length; mi++) {
      gained += grid[result.merged[mi].r][result.merged[mi].c];
    }
    if (gained > 0) {
      score += gained;
      updateScore();
    }

    setTimeout(function () {
      for (var rr = 0; rr < SIZE; rr++) {
        for (var cc = 0; cc < SIZE; cc++) {
          if (tileEls[rr][cc]) {
            tileEls[rr][cc].classList.remove('merged');
            tileEls[rr][cc].classList.remove('new');
          }
        }
      }
    }, 200);
  }

  function move(direction) {
    if (animating || gameOver) return;
    var result = moveDirection(direction);
    if (!result.moved) {
      if (!movesAvailable()) showGameOver();
      return;
    }
    animating = true;
    animateAndCommit(direction, result);
    setTimeout(function () {
      animating = false;
      addRandomTile();
      if (!won && hasValue(WIN_VALUE)) {
        won = true;
        showWin();
        return;
      }
      if (!movesAvailable()) showGameOver();
    }, 130);
  }

  function hasValue(value) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (grid[r][c] === value) return true;
      }
    }
    return false;
  }

  function movesAvailable() {
    if (emptyCells().length > 0) return true;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = grid[r][c];
        if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
        if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function showOverlay(title, text, showKeep) {
    overlayTitleEl.textContent = title;
    overlayTextEl.textContent = text;
    overlayKeepEl.hidden = !showKeep;
    overlayEl.classList.add('show');
  }

  function hideOverlay() {
    overlayEl.classList.remove('show');
  }

  function showWin() {
    showOverlay('你赢了！', '成功拼出 2048，当前得分：' + score, true);
  }

  function showGameOver() {
    gameOver = true;
    showOverlay('游戏结束', '最终得分：' + score, false);
  }

  var keyMap = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  function onKeyDown(e) {
    var key = e.key || e.keyCode;
    var direction = keyMap[key] || keyMap[String(e.key).toLowerCase()];
    if (!direction) return;
    e.preventDefault();
    try {
      move(direction);
    } catch (err) {
      if (window.console && console.error) console.error('2048 move error:', err);
    }
  }

  var touchStartX = 0;
  var touchStartY = 0;
  var touchActive = false;

  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    touchActive = true;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (touchActive) e.preventDefault();
  }

  function onTouchEnd(e) {
    if (!touchActive) return;
    touchActive = false;
    var touch = e.changedTouches[0];
    if (!touch) return;
    var dx = touch.clientX - touchStartX;
    var dy = touch.clientY - touchStartY;
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);
    var threshold = 24;
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      move(dx > 0 ? 'right' : 'left');
    } else {
      move(dy > 0 ? 'down' : 'up');
    }
  }

  function loadBest() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      best = stored ? parseInt(stored, 10) || 0 : 0;
    } catch (e) {
      best = 0;
    }
    bestEl.textContent = best;
  }

  function onResize() {
    readMetrics();
    repositionAll();
  }

  function bindEvents() {
    document.addEventListener('keydown', onKeyDown);
    boardEl.addEventListener('touchstart', onTouchStart, { passive: true });
    boardEl.addEventListener('touchmove', onTouchMove, { passive: false });
    boardEl.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('resize', onResize);
    newGameEl.addEventListener('click', newGame);
    overlayRetryEl.addEventListener('click', newGame);
    overlayKeepEl.addEventListener('click', function () {
      keepPlaying = true;
      hideOverlay();
    });
  }

  function init() {
    // Bind input handlers first so the game is always playable, even if a
    // later rendering step fails (e.g. localStorage blocked under file://).
    try {
      bindEvents();
    } catch (e) {
      // Ignore; keyboard handler is the important one.
    }

    try {
      buildGridBackground();
    } catch (e) {}

    try {
      loadBest();
    } catch (e) {}

    try {
      readMetrics();
    } catch (e) {}

    try {
      newGame();
    } catch (e) {
      if (window.console && console.error) console.error('2048 init error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
