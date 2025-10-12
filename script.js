// ===== 設定 =====
const FRAME_COUNT = 31;                 // ← 実枚数に合わせる
const FRAME_DIR   = "img07/"; // ← 画像フォルダ
const EXT         = ".webp";
const PAD_DIGITS  = 2;                  // 01.webp 形式なら 2

// スクラブ感度（小さいほどゆっくり）
const GAIN = { mouse: 0.04, touch: 0.08 };

// クリック/タップ判定とドラッグ検出（PCで画面全体クリックを有効に）
let didDrag = false;
const DRAG_THRESHOLD = 6;   // これ以上の移動でドラッグ扱い
const TAP_MAX_DIST   = 14;  // タップ判定の許容移動量（px）
const TAP_MAX_TIME   = 400; // タップ判定の許容時間（ms）

// ===== 連番生成 =====
const zpad = (n, len = PAD_DIGITS) => String(n).padStart(len, "0");
const FRAMES = Array.from({ length: FRAME_COUNT }, (_, i) => `${FRAME_DIR}${zpad(i + 1)}${EXT}`);

// ===== 要素取得 =====
const TARGET = document.getElementById("scrubber") || document.getElementById("scrubber");
const IMG    = document.getElementById("frame");
const LOADER = document.getElementById("loader");

// ===== 状態 =====
let current = 0;
let rafId = null;
let lastX = null;
let accum = 0;

// タップ開始記録
let tapStartX = 0, tapStartY = 0, tapStartT = 0;

// ===== ユーティリティ =====
const wrap = (i, len) => ((i % len) + len) % len; // ループ（循環）インデックス

function show(index){
  index = wrap(index, FRAMES.length); // 最後→最初/最初→最後に循環
  if (index === current) return;
  current = index;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => { IMG.src = FRAMES[index]; });
}

function gotoPrev(){ show(current - 1); }
function gotoNext(){ show(current + 1); }
function handleTapByScreenX(clientX){
  const mid = window.innerWidth / 2;
  (clientX >= mid) ? gotoNext() : gotoPrev();
}

// ===== 初期1枚ロード =====
(function preloadFirst(){
  if (!IMG || !LOADER) return;
  const im = new Image();
  im.src = FRAMES[0];
  im.onload = () => {
    IMG.src = im.src;
    LOADER.classList.add("hidden");
  };
})();

// ===== 距離(dx)ベースのゆっくりスクラブ =====
function handleMoveDX(clientX, pointerType = "mouse"){
  if (lastX == null) lastX = clientX;
  const dx = clientX - lastX;
  lastX = clientX;

  const gain = (pointerType === "touch") ? GAIN.touch : GAIN.mouse;
  accum += dx * gain;

  const step = (accum > 0) ? Math.floor(accum) : Math.ceil(accum);
  if (step !== 0){
    show(current + step);
    accum -= step;
  }
}

// ===== イベント登録 =====
(function bindEvents(){
  if (!TARGET){ console.error("No target element (#scrub-area or #scrubber)"); return; }

  // Pointer（マウス/ペン/一部タッチ）
  TARGET.addEventListener("pointerdown", e => {
    lastX = e.clientX; accum = 0;
    tapStartX = e.clientX; tapStartY = e.clientY; tapStartT = performance.now();
    didDrag = false; // ← 開始時にリセット
  }, { passive: true });

  TARGET.addEventListener("pointermove", e => {
    const type = (e.pointerType === "touch") ? "touch" : "mouse";
    handleMoveDX(e.clientX, type);

    // ドラッグ判定（一定量動いたらタップ扱いを外す）
    if (tapStartT) {
      if (Math.abs(e.clientX - tapStartX) > DRAG_THRESHOLD ||
          Math.abs(e.clientY - tapStartY) > DRAG_THRESHOLD) {
        didDrag = true;
      }
    }
  }, { passive: true });

  TARGET.addEventListener("pointerup", e => {
    lastX = null; accum = 0;
    const dt = performance.now() - tapStartT;
    const dx = Math.abs(e.clientX - tapStartX);
    const dy = Math.abs(e.clientY - tapStartY);
    const isTap = !didDrag && (dt <= TAP_MAX_TIME) && (dx <= TAP_MAX_DIST) && (dy <= TAP_MAX_DIST);
    if (isTap) handleTapByScreenX(e.clientX);
  }, { passive: true });

  // iOS Safari 用の touch（クリック遅延回避）
  TARGET.addEventListener("touchstart", e => {
    if (!e.touches.length) return;
    const t = e.touches[0];
    lastX = t.clientX; accum = 0;
    tapStartX = t.clientX; tapStartY = t.clientY; tapStartT = performance.now();
    didDrag = false;
  }, { passive: true });

  TARGET.addEventListener("touchmove", e => {
    if (!e.touches.length) return;
    handleMoveDX(e.touches[0].clientX, "touch");
  }, { passive: true });

  TARGET.addEventListener("touchend", e => {
    lastX = null; accum = 0;
    const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (t){
      const dt = performance.now() - tapStartT;
      const dx = Math.abs(t.clientX - tapStartX);
      const dy = Math.abs(t.clientY - tapStartY);
      const isTap = !didDrag && (dt <= TAP_MAX_TIME) && (dx <= TAP_MAX_DIST) && (dy <= TAP_MAX_DIST);
      if (isTap) handleTapByScreenX(t.clientX);
    }
  }, { passive: true });

  // クリック専用フォールバック（PCでビュー全体を確実にクリック可に）
  TARGET.addEventListener("click", e => {
    if (!didDrag) handleTapByScreenX(e.clientX);
  });
})();

// キーボード（矢印キー）で前後操作
window.addEventListener("keydown", e => {
  if (e.key === "ArrowRight") {
    gotoNext();
  } else if (e.key === "ArrowLeft") {
    gotoPrev();
  }
});

