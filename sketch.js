// rundviskom — fullscreen / installation variant
//
// A trimmed version of the main tool. The canvas fills the whole viewport and
// only three persistent controls are exposed: draw mode (letters / images),
// background colour, and clear. The image picker appears only while in IMAGES
// mode (mirroring how the main tool hides its images field).
//
// Recording, art-board sizing, the accordion, background image/video upload and
// the overlay toggle are all intentionally removed here; the brand overlay
// texture is kept on permanently.
//
// ROTATION: the whole composition is drawn rotated 90deg counter-clockwise so a
// portrait signal reads upright on a physically-horizontal screen. The canvas
// element stays axis-aligned to the viewport (so p5's pointer coordinates stay
// valid) and the rotation is applied to the drawing instead, with pointer input
// remapped through the inverse. The HTML overlays are rotated to match via CSS.

let phraseText = "rundviskom  "; // trailing spaces create gaps between repeats

const PALETTE = ["#FFE429", "#FF1B8A", "#FF4B18", "#0DB254", "#0033C0"];
const BG_COLORS = ["#FFFFFF", "#FFE429", "#FF1B8A", "#FF4B18", "#0DB254", "#B4B4B4"];

const DIST_RATIO = 1.5; // spacing between circles while dragging, in radii

let linzFont = null;

// drawing state
let letterIndex = 0;
let phraseCount = 0;
let currentCol = PALETTE[0];
let textJustChanged = false;
let circles = [];
let lastX = null;
let lastY = null;

let circleR = 120; // recomputed from viewport on setup / resize

let drawMode = "letters"; // "letters" | "images"

let loadedImages = [];
let imgIndex = 0;

// background
let bgColor = "#FFFFFF";

// fixed overlay texture, multiplied over the background (same asset as the tool)
let overlayImage = null;
const OVERLAY_URL = "https://jukka211.github.io/rundviskom-display/background-image.png";

// canvas + UI element handles
let cnv;
let canvasHolder;
let modeButton, clearButton, imgFileInput, imgLoadButton, swatchWrap;

function preload() {
  // If the font can't be found, fall back to the default p5 font rather than
  // halting the sketch.
  linzFont = loadFont(
    "LinzSans-Medium.ttf",
    () => {},
    () => { linzFont = null; }
  );

  overlayImage = loadImage(
    OVERLAY_URL,
    () => {},
    () => { overlayImage = null; }
  );
}

function setup() {
  canvasHolder = document.getElementById("canvas-holder");

  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  computeRadius();

  cnv = createCanvas(windowWidth, windowHeight);
  cnv.parent(canvasHolder);
  cnv.style("display", "block");
  cnv.style("touch-action", "none");
  cnv.style("user-select", "none");
  cnv.style("-webkit-user-select", "none");

  applyCtxDefaults();
  pickPhraseColor();
  wireUI();
}

function applyCtxDefaults() {
  textAlign(CENTER, CENTER);
  if (linzFont) textFont(linzFont);
  imageMode(CENTER);
}

function computeRadius() {
  // ~a tenth of the smaller viewport edge, clamped so it stays usable on both
  // a phone and a projector.
  circleR = Math.max(28, Math.round(Math.min(windowWidth, windowHeight) * 0.1));
}

// ---- wire DOM controls to behaviour ----
function wireUI() {
  modeButton = document.getElementById("mode-button");
  modeButton.addEventListener("click", toggleMode);

  clearButton = document.getElementById("clear-button");
  clearButton.addEventListener("click", clearCanvas);

  // background colour swatches, built from BG_COLORS
  swatchWrap = document.getElementById("bg-swatches");
  BG_COLORS.forEach((c) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.type = "button";
    b.style.background = c;
    b.setAttribute("aria-label", "Background " + c);
    b.dataset.color = c;
    if (c === bgColor) b.classList.add("selected");
    b.addEventListener("click", () => setBgColor(c));
    swatchWrap.appendChild(b);
  });

  // image picker — only relevant in IMAGES mode, hidden until then
  imgFileInput = document.getElementById("img-file-input");
  imgFileInput.addEventListener("change", loadSelectedImages);

  imgLoadButton = document.getElementById("img-load-button");
  imgLoadButton.addEventListener("click", () => imgFileInput.click());

  updateVisibility();
}

function updateVisibility() {
  imgLoadButton.hidden = drawMode !== "images";
}

function setBgColor(c) {
  bgColor = c;
  if (!swatchWrap) return;
  swatchWrap.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("selected", s.dataset.color === c);
  });
}

function toggleMode() {
  drawMode = drawMode === "letters" ? "images" : "letters";
  modeButton.textContent = drawMode === "letters" ? "Mode: LETTERS" : "Mode: IMAGES";
  updateVisibility();
}

// ---- image loading ----
function loadSelectedImages() {
  const files = Array.from(imgFileInput.files || []);
  loadedImages = [];
  imgIndex = 0;

  files.forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    loadImage(
      url,
      (img) => {
        loadedImages.push(img);
        URL.revokeObjectURL(url);
      },
      () => URL.revokeObjectURL(url)
    );
  });
}

// ---- drawing ----
// The visible canvas is axis-aligned to the viewport. We rotate the coordinate
// system 90deg CCW so everything is drawn into a "content space" that is the
// viewport with width/height swapped:
//   contentW = height (canvas height)   contentH = width (canvas width)
// Screen mapping for a content point (cx, cy):
//   screenX = cy,   screenY = height - cx
function draw() {
  background(bgColor);

  push();
  translate(0, height);   // origin to bottom-left
  rotate(-HALF_PI);       // 90deg counter-clockwise
  renderContent(height, width);
  pop();
}

function renderContent(contentW, contentH) {
  // fixed overlay texture, cover-scaled and multiplied over the background
  if (overlayImage && overlayImage.width) {
    const scaleOv = Math.max(contentW / overlayImage.width, contentH / overlayImage.height);
    push();
    blendMode(MULTIPLY);
    image(overlayImage, contentW / 2, contentH / 2, overlayImage.width * scaleOv, overlayImage.height * scaleOv);
    pop();
    blendMode(BLEND);
  }

  const dc = drawingContext;

  for (const c of circles) {
    if (c.img) {
      push();
      dc.save();
      dc.beginPath();
      dc.arc(c.x, c.y, c.r, 0, TWO_PI);
      dc.clip();

      const d = c.r * 2;
      const scaleImg = Math.max(d / c.img.width, d / c.img.height);
      image(c.img, c.x, c.y, c.img.width * scaleImg, c.img.height * scaleImg);

      dc.restore();
      pop();
    } else {
      noStroke();
      fill(c.col);
      circle(c.x, c.y, c.r * 2);

      fill(0);
      textSize(c.r * 1.5);
      text(c.ch, c.x, c.y + 1);
    }
  }
}

function pickPhraseColor() {
  currentCol = PALETTE[phraseCount % PALETTE.length];
}

function addCircle(x, y) {
  if (drawMode === "images") {
    if (loadedImages.length === 0) return;
    const img = loadedImages[imgIndex % loadedImages.length];
    circles.push({ x, y, r: circleR, img });
    imgIndex++;
    return;
  }

  if (textJustChanged) {
    phraseCount++;
    pickPhraseColor();
    textJustChanged = false;
  }

  const ch = phraseText[letterIndex];
  if (ch !== " ") {
    circles.push({ x, y, r: circleR, ch, col: currentCol });
  }

  letterIndex++;
  if (letterIndex >= phraseText.length) {
    letterIndex = 0;
    phraseCount++;
    pickPhraseColor();
  }
}

// ---- pointer input (mouse + touch) ----
function inCanvas() {
  return mouseX >= 0 && mouseY >= 0 && mouseX <= width && mouseY <= height;
}

// inverse of the draw() rotation: viewport pointer -> content space
function toContent(mx, my) {
  return { x: height - my, y: mx };
}

function pointerDown() {
  if (!inCanvas()) return false;
  const p = toContent(mouseX, mouseY);
  addCircle(p.x, p.y);
  lastX = p.x;
  lastY = p.y;
  return true;
}

function pointerMove() {
  if (!inCanvas()) return false;
  const p = toContent(mouseX, mouseY);
  if (lastX === null) {
    lastX = p.x;
    lastY = p.y;
  }
  const d = dist(p.x, p.y, lastX, lastY); // distance is rotation-invariant
  if (d >= circleR * DIST_RATIO) {
    addCircle(p.x, p.y);
    lastX = p.x;
    lastY = p.y;
  }
  return true;
}

function pointerUp() {
  lastX = null;
  lastY = null;
}

function mousePressed() { pointerDown(); }
function mouseDragged() { pointerMove(); }
function mouseReleased() { pointerUp(); }

// returning false from the touch handlers suppresses the browser's default
// (scroll / pull-to-refresh) while drawing on the canvas
function touchStarted() { return pointerDown() ? false : true; }
function touchMoved() { return pointerMove() ? false : true; }
function touchEnded() { pointerUp(); return true; }

function clearCanvas() {
  circles = [];
  letterIndex = 0;
  imgIndex = 0;
  phraseCount = 0;
  textJustChanged = false;
  pickPhraseColor();
}

function keyPressed() {
  const el = document.activeElement;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
  if (key === "c" || key === "C") clearCanvas();
  if (key === "f" || key === "F") toggleFullscreen();
}

function toggleFullscreen() {
  // browser Fullscreen API — handy for kiosk / projection
  fullscreen(!fullscreen());
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeRadius();
  applyCtxDefaults();
}