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
const end = document.getElementById("end");
const loader = document.getElementById("loader");
const loaderLabel = document.getElementById("loader-label");
const loaderProgress = document.getElementById("loader-progress");
const introTitle = document.getElementById("intro-title");
const introInstruction = document.getElementById("intro-instruction");
const endTitle = document.getElementById("end-title");
const poemOverlays = document.getElementById("poem-overlays");
const footerText = document.getElementById("footer-text");
const languageToggleButton = document.getElementById("language-toggle");
const backToFrontButton = document.getElementById("back-to-front");
const scrollbarOverlay = document.getElementById("scrollbar-overlay");
const scrollbarThumb = document.getElementById("scrollbar-thumb");

const poemStayRangePercent = 1;
const logScrollPercent = true;
const languageSwitchFadeMs = 240;
const languages = ["zh", "en"];

let isPinnedToFront = true;
let loadedCount = 0;
let currentScroll = 0;
let targetScroll = 0;
let animationFrameId = 0;
let isAnimatingWheelScroll = false;
let isDraggingScrollbar = false;
let dragOffsetX = 0;
let lastLoggedPercent = null;
let siteContent = null;
let isSwitchingLanguage = false;
let currentLanguage = "zh";
let poems = [];

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

function loadJson(path) {
  return fetch(path)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load ${path}: ${response.status}`);
      }

      return response.json();
    });
}

function loadText(path) {
  return fetch(path)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load ${path}: ${response.status}`);
      }

      return response.text();
    });
}

const contentLoader = Promise.all([
  loadJson("./theme.json"),
  loadText("./poems.md"),
])
  .then(([themeData, poemsMarkdown]) => {
    siteContent = {
      ...themeData,
      poems: parsePoemsMarkdown(poemsMarkdown),
    };
    renderContent();
  })
  .catch((error) => {
    console.warn(error);
  });

function parsePoemsMarkdown(markdown) {
  const parsedPoems = [];
  let currentPoem = null;
  let currentLanguageKey = null;

  const finishLanguageSection = () => {
    if (!currentPoem || !currentLanguageKey) {
      return;
    }

    currentPoem.text[currentLanguageKey] = trimBlankEdges(currentPoem.text[currentLanguageKey]).join("\n");
  };

  const finishPoem = () => {
    finishLanguageSection();

    if (currentPoem) {
      parsedPoems.push(currentPoem);
    }
  };

  markdown.split(/\r?\n/).forEach((line) => {
    const poemHeading = line.match(/^#\s+(.+)$/);
    const languageHeading = line.match(/^##\s+([a-z-]+)\s*$/i);

    if (poemHeading) {
      finishPoem();
      currentPoem = {
        id: poemHeading[1].trim(),
        scrollPercent: 0,
        xPercent: 50,
        yPercent: 50,
        text: {},
      };
      currentLanguageKey = null;
      return;
    }

    if (!currentPoem) {
      return;
    }

    if (languageHeading) {
      finishLanguageSection();
      currentLanguageKey = languageHeading[1].trim();
      currentPoem.text[currentLanguageKey] = [];
      return;
    }

    if (currentLanguageKey) {
      currentPoem.text[currentLanguageKey].push(line);
      return;
    }

    const metadata = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);

    if (metadata) {
      const [, key, value] = metadata;
      currentPoem[key] = numericMetadataValue(value);
    }
  });

  finishPoem();
  return parsedPoems;
}

function trimBlankEdges(lines) {
  const trimmed = [...lines];

  while (trimmed.length && trimmed[0] === "") {
    trimmed.shift();
  }

  while (trimmed.length && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }

  return trimmed;
}

function numericMetadataValue(value) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value.trim() : numberValue;
}

function localized(value, fallback = "") {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  return value[currentLanguage] ?? value.zh ?? value.en ?? fallback;
}

function renderLines(element, value) {
  const lines = Array.isArray(value) ? value : String(value ?? "").split(/\r?\n/);

  element.replaceChildren(
    ...lines.flatMap((line, index) => {
      const nodes = [document.createTextNode(line ?? "")];

      if (index < lines.length - 1) {
        nodes.push(document.createElement("br"));
      }

      return nodes;
    })
  );
}

function renderPoems(poemData) {
  poemOverlays.replaceChildren();

  poems = poemData.map((poem) => {
    const overlay = document.createElement("p");
    overlay.className = "instruction poem-overlay";
    overlay.id = `poem-${poem.id}`;
    overlay.style.setProperty("--poem-x", `${clampPercent(poem.xPercent ?? 50)}%`);
    overlay.style.setProperty("--poem-y", `${clampPercent(poem.yPercent ?? 50)}%`);

    renderLines(overlay, localized(poem.text));
    poemOverlays.appendChild(overlay);

    return {
      scrollPercent: clampPercent(poem.scrollPercent),
      overlay,
    };
  });

  syncPoemOverlays();
}

function renderContent() {
  if (!siteContent) {
    return;
  }

  const ui = siteContent.ui || {};
  const fonts = siteContent.theme?.fonts || {};

  document.documentElement.lang = currentLanguage === "zh" ? "zh-Hans" : "en";
  document.documentElement.style.setProperty("--body-font", localized(fonts.body, "\"Helvetica Neue\", \"Avenir Next\", \"Segoe UI\", sans-serif"));
  document.documentElement.style.setProperty("--h1-font", localized(fonts.h1, "\"Noto Serif SC\", serif"));

  loaderLabel.textContent = localized(ui.loaderLabel, "Loading images");
  introTitle.textContent = localized(ui.introTitle, introTitle.textContent);
  renderLines(introInstruction, localized(ui.introInstruction, introInstruction.textContent));
  endTitle.textContent = localized(ui.endTitle, endTitle.textContent);
  footerText.innerHTML = localized(ui.footerHtml, footerText.innerHTML);
  backToFrontButton.textContent = localized(ui.backToFront, backToFrontButton.textContent);
  languageToggleButton.setAttribute("aria-label", currentLanguage === "zh" ? "Switch to English" : "切換到中文");

  renderPoems(siteContent.poems || []);
}

function setLanguage(language) {
  if (!languages.includes(language)) {
    return;
  }

  currentLanguage = language;
  localStorage.setItem("preferredLanguage", currentLanguage);
  renderContent();
}

function switchLanguage() {
  if (isSwitchingLanguage) {
    return;
  }

  isSwitchingLanguage = true;
  document.body.classList.add("is-switching-language");

  window.setTimeout(() => {
    setLanguage(currentLanguage === "zh" ? "en" : "zh");

    window.requestAnimationFrame(() => {
      document.body.classList.remove("is-switching-language");
      isSwitchingLanguage = false;
    });
  }, languageSwitchFadeMs);
}

function syncIntroState() {
  const hasScrolled = gallery.scrollLeft < gallery.scrollWidth - gallery.clientWidth - 24;
  isPinnedToFront = !hasScrolled;
  intro.classList.toggle("is-hidden", hasScrolled);
}

function syncEndState() {
  const isAtEnd = gallery.scrollLeft <= 24;

  end.classList.toggle("is-hidden", !isAtEnd);
  end.setAttribute("aria-hidden", String(!isAtEnd));
}

function clampPercent(value) {
  return Math.min(Math.max(Number(value) || 0, 0), 100);
}

function centerLinePercent() {
  const rollWidth = gallery.scrollWidth;

  if (rollWidth <= 0) {
    return 0;
  }

  return ((gallery.scrollLeft + gallery.clientWidth / 2) / rollWidth) * 100;
}

function syncPoemOverlays() {
  const currentPercent = centerLinePercent();
  const visibleDistance = poemStayRangePercent / 2;

  poems.forEach(({ scrollPercent: poemPercent, overlay }) => {
    const distance = Math.abs(currentPercent - poemPercent);
    const isVisible = distance <= visibleDistance;

    overlay.classList.toggle("is-visible", isVisible);
  });
}

function logCurrentScrollPercent() {
  if (!logScrollPercent) {
    return;
  }

  const currentPercent = centerLinePercent();
  const roundedPercent = Number(currentPercent.toFixed(2));

  if (roundedPercent === lastLoggedPercent) {
    return;
  }

  lastLoggedPercent = roundedPercent;
  console.log(`center line percent: ${roundedPercent}`);
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
    syncEndState();
    syncPoemOverlays();
    logCurrentScrollPercent();

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
  syncEndState();
  syncPoemOverlays();
  logCurrentScrollPercent();
  syncScrollbarThumb();
}

function backToFront() {
  targetScroll = maxScrollLeft();
  animateScroll();
}

window.addEventListener("load", async () => {
  await Promise.all([...imageLoaders, contentLoader]);
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
  syncEndState();
  syncPoemOverlays();
  logCurrentScrollPercent();
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
  syncEndState();
  syncPoemOverlays();
  logCurrentScrollPercent();
  syncScrollbarThumb();
});
backToFrontButton.addEventListener("click", backToFront);
languageToggleButton.addEventListener("click", switchLanguage);

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
  syncEndState();
  syncPoemOverlays();
  logCurrentScrollPercent();
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
syncEndState();
syncPoemOverlays();
logCurrentScrollPercent();
syncScrollbarThumb();
