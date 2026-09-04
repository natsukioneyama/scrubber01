// ==============================
//  Scrubber (stable/throttled)
//  Natsuki Oneyama site
// ==============================

// ===== 設定 =====
const FRAME_COUNT  = 19;        // 実枚数に合わせる
const FRAME_DIR    = "img/"; // 画像フォルダ
const EXT          = ".webp";
const PAD_DIGITS   = 2;         // 01.webp 形式なら 2

// スクロール量 → フレーム進みの感度（小さいほどゆっくり）
const GAIN = { mouse: 0.04, touch: 0.08 };

// フレーム更新の間引き（Safari/iOS 安定化）
let lastFrameTime = 0;
const FRAME_INTERVAL = 16; // 60fps（重い端末なら 20〜33 に）

// ===== 連番パス生成 =====
const zpad = (n, len = PAD_DIGITS) => String(n).padStart(len, "0");
const FRAMES = Array.from({ length: FRAME_COUNT }, (_, i) => `${FRAME_DIR}${zpad(i + 1)}${EXT}`);

// ===== 要素参照 =====
const TARGET = document.getElementById("scrubber") || document.body; // 中央のコンテナ
const IMG    = document.getElementById("frame");                      // 実際に表示する画像
const LOADER = document.getElementById("loader");                     // “loading…” 表示（あれば）

// ===== 状態管理 =====
let current = 0;           // 現在フレーム（整数）
let curFloat = 0;          // 浮動小数で蓄積（感度に使う）
let isDragging = false;
let startX = 0;
let lastX  = 0;
let inputType = "mouse";   // 'mouse' | 'touch'

// クリック/タップの判定（ドラッグ扱いにするしきい値）
const DRAG_THRESHOLD = 6;   // px
let didDrag = false;

// 画像先読み（軽量）— 最初と近傍だけ
const preload = (index) => {
  const idxs = [index, index + 1, index - 1].map(wrap);
  idxs.forEach(i => {
    const img = new Image();
    img.decoding = "async";
    img.src = FRAMES[i];
  });
};

// ラップ（0..FRAME_COUNT-1）
function wrap(i) {
  if (i < 0) return FRAME_COUNT - 1;
  if (i >= FRAME_COUNT) return 0;
  return i;
}

// 画像差し替え（rAF でバッチ）
let rafId = 0;
let pendingIndex = null;

function requestSwap(toIndex) {
  pendingIndex = toIndex;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (pendingIndex == null) return;
    const idx = pendingIndex;
    pendingIndex = null;

    if (idx === current) return;
    current = idx;
    IMG.src = FRAMES[current];
    preload(current);
  });
}

// 進める（正/負のデルタ）
function advance(delta) {
  // 間引き：Safari の過剰 move を抑制
  const now = performance.now();
  if (now - lastFrameTime < FRAME_INTERVAL) return;
  lastFrameTime = now;

  curFloat += delta;
  // 浮動 → 整数フレーム
  let next = Math.round(curFloat);

  // ループ
  next = ((next % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;

  if (next !== current) requestSwap(next);
}

// スワイプ・ドラッグのハンドラ（画像上のみ）
function onPointerDown(clientX, type) {
  isDragging = true;
  inputType = type;
  startX = lastX = clientX;
  didDrag = false;
}

function onPointerMove(clientX) {
  if (!isDragging) return;
  const dx = clientX - lastX;
  lastX = clientX;

  // ほんの少しでも動いたらドラッグ扱い
  if (Math.abs(clientX - startX) > DRAG_THRESHOLD) didDrag = true;

  const gain = inputType === "touch" ? GAIN.touch : GAIN.mouse;
  advance(dx * gain);
}

function onPointerUp(clientX) {
  if (!isDragging) return;
  isDragging = false;

  // ドラッグじゃなければ “左右クリック/タップ” として前後送り
  if (!didDrag) handleTapByScreenX(clientX);
}

// 画像内の左右で前後送り
function handleTapByScreenX(clientX) {
  const rect = IMG.getBoundingClientRect();
  const mid = rect.left + rect.width / 2;
  (clientX >= mid) ? gotoNext() : gotoPrev();
}

// 前後・ラップ
function gotoNext() { requestSwap(wrap(current + 1)); curFloat = current; }
function gotoPrev() { requestSwap(wrap(current - 1)); curFloat = current; }

// ===== イベント bind（画像の上だけ） =====
function bindEvents() {
  // マウス
  IMG.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onPointerDown(e.clientX, "mouse");
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    onPointerMove(e.clientX);
  }, { passive: false });

  window.addEventListener("mouseup", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    onPointerUp(e.clientX);
  });

  IMG.addEventListener("mouseenter", (e) => { lastX = e.clientX; });

IMG.addEventListener("mousemove", (e) => {
  // 既にドラッグ中なら上の処理に任せる
  if (isDragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  advance(dx * GAIN.mouse); // ← 既存の感度＆スロットルが効く
});

  // タッチ
  IMG.addEventListener("touchstart", (e) => {
    if (!e.touches || e.touches.length === 0) return;
    e.preventDefault();
    onPointerDown(e.touches[0].clientX, "touch");
  }, { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (!isDragging || !e.touches || e.touches.length === 0) return;
    e.preventDefault(); // ページスクロールを防ぐ
    onPointerMove(e.touches[0].clientX);
  }, { passive: false });

window.addEventListener("touchend", (e) => {
  if (!isDragging) return;            // ← 追加：ドラッグ中以外は何もしない
  e.preventDefault();
  const x = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : lastX;
  onPointerUp(x);
}, { passive: false });

  // クリック（マウスの軽いタップ用フォールバック）
  IMG.addEventListener("click", (e) => {
    // すでにドラッグとして処理していれば無視
    if (didDrag) return;
    handleTapByScreenX(e.clientX);
  });

  // キーボード（左右キー）
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); gotoNext(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); gotoPrev(); }
  });
}

// ===== 初期化 =====
function init() {
  // 最初の画像 & 近傍を先読み
  IMG.decoding = "async";
  IMG.loading  = "eager";
  IMG.src = FRAMES[current];
  preload(current);

  // “loading…” があれば非表示へ
  if (LOADER) LOADER.classList.add("hidden");

  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);

// ---- Intro auto-scrub animation ----
window.addEventListener("load", () => {
  const images = document.querySelectorAll(".frame img");
  if (!images.length) return;

  let i = 0;
  const max = images.length;
  const interval = 50; // ミリ秒ごとの切り替え速度（50ms = 約20fps）
  const totalDuration = 2000; // 全体の再生時間（ミリ秒）

  const autoPlay = setInterval(() => {
    // 全画像を一旦非表示
    images.forEach(img => img.style.display = "none");
    // 次の画像を表示
    images[i % max].style.display = "block";
    i++;
  }, interval);

  // 指定時間後に停止
  setTimeout(() => {
    clearInterval(autoPlay);
    // 最後に最初の画像で止めたい場合
    images.forEach(img => img.style.display = "none");
    images[0].style.display = "block";
  }, totalDuration);
});

