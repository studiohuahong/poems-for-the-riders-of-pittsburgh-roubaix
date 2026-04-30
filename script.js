const imageSources = [
  "./images/outro.png",
  "./images/e.png",
  "./images/d.png",
  "./images/c.png",
  "./images/b.png",
  "./images/intro.png",
];


const gallery = document.getElementById("gallery");
const intro = document.getElementById("intro");
const loader = document.getElementById("loader");
const loaderProgress = document.getElementById("loader-progress");
const backToFrontButton = document.getElementById("back-to-front");
const scrollbarOverlay = document.getElementById("scrollbar-overlay");
const scrollbarThumb = document.getElementById("scrollbar-thumb");

let isPinnedToFront = true;
let loadedCount = 0;
let currentScroll = 0;
let targetScroll = 0;
let animationFrameId = 0;
let isAnimatingWheelScroll = false;
let isDraggingScrollbar = false;
let dragOffsetX = 0;

loaderProgress.textContent = `0 / ${imageSources.length}`;

const imageLoaders = imageSources.map((src) => {
  const figure = document.createElement("figure");
  figure.className = "gallery-item";

  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "eager";
  img.draggable = false;

  figure.appendChild(img);
  gallery.appendChild(figure);
  return new Promise((resolve) => {
    const finalize = () => {
      loadedCount += 1;
      loaderProgress.textContent = `${loadedCount} / ${imageSources.length}`;
      resolve();
    };

    if (img.complete) {
      finalize();
      return;
    }

    img.addEventListener("load", finalize, { once: true });
    img.addEventListener("error", finalize, { once: true });
  });
});

function syncIntroState() {
  const hasScrolled = gallery.scrollLeft < gallery.scrollWidth - gallery.clientWidth - 24;
  isPinnedToFront = !hasScrolled;
  intro.classList.toggle("is-hidden", hasScrolled);
}

function maxScrollLeft() {
  return Math.max(0, gallery.scrollWidth - gallery.clientWidth);
}

function clampScroll(value) {
  return Math.min(maxScrollLeft(), Math.max(0, value));
}

function syncScrollbarThumb() {
  const maxScroll = maxScrollLeft();
  const overlayWidth = scrollbarOverlay.clientWidth;

  if (maxScroll <= 0 || overlayWidth <= 0) {
    scrollbarOverlay.style.opacity = "0";
    scrollbarThumb.style.width = "0";
    scrollbarThumb.style.transform = "translateX(0)";
    return;
  }

  scrollbarOverlay.style.opacity = "0.72";

  const thumbWidth = Math.max(48, (gallery.clientWidth / gallery.scrollWidth) * overlayWidth);
  const maxThumbOffset = overlayWidth - thumbWidth;
  const progress = gallery.scrollLeft / maxScroll;
  const thumbOffset = maxThumbOffset * progress;

  scrollbarThumb.style.width = `${thumbWidth}px`;
  scrollbarThumb.style.transform = `translateX(${thumbOffset}px)`;
}

function animateScroll() {
  if (animationFrameId) {
    return;
  }

  isAnimatingWheelScroll = true;

  const tick = () => {
    currentScroll += (targetScroll - currentScroll) * 0.16;

    if (Math.abs(targetScroll - currentScroll) < 0.5) {
      currentScroll = targetScroll;
    }

    gallery.scrollLeft = currentScroll;
    syncIntroState();

    if (currentScroll !== targetScroll) {
      animationFrameId = window.requestAnimationFrame(tick);
      return;
    }

    animationFrameId = 0;
    isAnimatingWheelScroll = false;
  };

  animationFrameId = window.requestAnimationFrame(tick);
}

function jumpToRightEdge() {
  currentScroll = maxScrollLeft();
  targetScroll = currentScroll;
  gallery.scrollLeft = currentScroll;
  syncIntroState();
  syncScrollbarThumb();
}

function backToFront() {
  targetScroll = maxScrollLeft();
  animateScroll();
}

window.addEventListener("load", async () => {
  await Promise.all(imageLoaders);
  jumpToRightEdge();
  loader.classList.add("is-hidden");
});

window.addEventListener("resize", () => {
  if (isPinnedToFront) {
    jumpToRightEdge();
    return;
  }

  currentScroll = clampScroll(gallery.scrollLeft);
  targetScroll = currentScroll;
  syncIntroState();
  syncScrollbarThumb();
});

gallery.addEventListener(
  "wheel",
  (event) => {
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    targetScroll = clampScroll(targetScroll + delta);
    animateScroll();
    event.preventDefault();
  },
  { passive: false }
);

gallery.addEventListener("scroll", () => {
  if (!isAnimatingWheelScroll) {
    currentScroll = gallery.scrollLeft;
    targetScroll = currentScroll;
  }

  syncIntroState();
  syncScrollbarThumb();
});
backToFrontButton.addEventListener("click", backToFront);

scrollbarThumb.addEventListener("pointerdown", (event) => {
  const thumbBounds = scrollbarThumb.getBoundingClientRect();
  isDraggingScrollbar = true;
  dragOffsetX = event.clientX - thumbBounds.left;
  scrollbarThumb.setPointerCapture(event.pointerId);
});

scrollbarThumb.addEventListener("pointermove", (event) => {
  if (!isDraggingScrollbar) {
    return;
  }

  const overlayBounds = scrollbarOverlay.getBoundingClientRect();
  const thumbWidth = scrollbarThumb.offsetWidth;
  const rawLeft = event.clientX - overlayBounds.left - dragOffsetX;
  const maxThumbOffset = overlayBounds.width - thumbWidth;
  const nextOffset = Math.min(Math.max(0, rawLeft), maxThumbOffset);
  const nextProgress = maxThumbOffset > 0 ? nextOffset / maxThumbOffset : 0;

  currentScroll = nextProgress * maxScrollLeft();
  targetScroll = currentScroll;
  gallery.scrollLeft = currentScroll;
  syncIntroState();
  syncScrollbarThumb();
});

scrollbarThumb.addEventListener("pointerup", (event) => {
  isDraggingScrollbar = false;
  scrollbarThumb.releasePointerCapture(event.pointerId);
});

scrollbarThumb.addEventListener("pointercancel", (event) => {
  isDraggingScrollbar = false;
  scrollbarThumb.releasePointerCapture(event.pointerId);
});

syncIntroState();
syncScrollbarThumb();
