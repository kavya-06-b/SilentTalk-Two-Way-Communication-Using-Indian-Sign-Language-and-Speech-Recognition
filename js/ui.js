/** Page chrome: navigation, settings, recent signs and the vocabulary list. Recognition lives elsewhere. */

const $ = (id) => document.getElementById(id);
const SETTINGS_KEY = "silenttalk-ui-settings-v1";
const VIEWS = ["home", "translate", "about", "settings"];
const DEFAULTS = { theme: "system", speak: true, mirror: true };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = loadSettings();

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked: settings last for this visit only */
  }
}

function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", settings.theme);
  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    const on = btn.dataset.themeChoice === settings.theme;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function applyMirror() {
  $("stage")?.classList.toggle("mirrored", settings.mirror);
}

/* ---------- Navigation ---------- */

function showView(view) {
  const name = VIEWS.includes(view) ? view : "home";
  for (const v of VIEWS) $("view-" + v)?.classList.toggle("show", v === name);
  document.querySelectorAll(".nav-links [data-view]").forEach((link) => {
    link.classList.toggle("active", link.dataset.view === name);
  });
  closeMenu();
}

function closeMenu() {
  $("navLinks").classList.remove("open");
  $("navToggle").setAttribute("aria-expanded", "false");
}

function routeFromHash() {
  showView(location.hash.replace("#", ""));
}

export function showMode(mode) {
  for (const m of ["sign", "speech"]) {
    $("view-" + m).classList.toggle("show", m === mode);
    const tab = document.querySelector(`[data-mode="${m}"]`);
    tab.classList.toggle("active", m === mode);
    tab.setAttribute("aria-selected", m === mode ? "true" : "false");
  }
}

/* ---------- Recent signs ---------- */

const recent = [];

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  if (!recent.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Confirmed signs will appear here.";
    list.appendChild(empty);
    return;
  }
  for (const item of recent) {
    const row = document.createElement("li");
    const text = document.createElement("div");
    const tulu = document.createElement("b");
    tulu.lang = "tcy";
    tulu.textContent = item.tulu;
    const en = document.createElement("span");
    en.textContent = " · " + item.en;
    text.append(tulu, en);
    const time = document.createElement("time");
    time.textContent = item.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    row.append(text, time);
    list.appendChild(row);
  }
}

export function addHistory(gloss) {
  recent.unshift({ en: gloss.en, tulu: gloss.tulu, at: new Date() });
  recent.length = Math.min(recent.length, 12);
  renderHistory();
  const big = $("liveTulu");
  big.classList.remove("pop");
  void big.offsetWidth;
  big.classList.add("pop");
}

function clearHistory() {
  recent.length = 0;
  renderHistory();
}

/* ---------- Vocabulary + stats ---------- */

export function renderVocabulary(gloss) {
  const grid = $("vocabGrid");
  grid.innerHTML = "";
  for (const item of Object.values(gloss)) {
    const card = document.createElement("div");
    card.className = "vocab-item";
    const tulu = document.createElement("strong");
    tulu.lang = "tcy";
    tulu.textContent = item.tulu;
    const en = document.createElement("span");
    en.textContent = item.en;
    card.append(tulu, en);
    grid.appendChild(card);
  }
}

export function setStats(signs, clips) {
  $("statSigns").textContent = signs;
  $("statClips").textContent = clips;
}

/** Shows the camera placeholder until the camera is on. */
export function setCameraLive(on) {
  $("stage").classList.toggle("live", on);
}

/* ---------- Wiring ---------- */

export function initUi() {
  applyTheme();
  applyMirror();

  document.querySelectorAll("[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      if (location.hash !== "#" + view) pushView(view);
      showView(view);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  window.addEventListener("hashchange", routeFromHash);

  $("navToggle").addEventListener("click", () => {
    const open = !$("navLinks").classList.contains("open");
    $("navLinks").classList.toggle("open", open);
    $("navToggle").setAttribute("aria-expanded", open ? "true" : "false");
  });

  document.querySelectorAll("[data-mode]").forEach((tab) => {
    tab.addEventListener("click", () => showMode(tab.dataset.mode));
  });

  document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.theme = btn.dataset.themeChoice;
      saveSettings();
      applyTheme();
    });
  });

  $("setSpeak").checked = settings.speak;
  $("setSpeak").addEventListener("change", () => {
    settings.speak = $("setSpeak").checked;
    saveSettings();
  });

  $("setMirror").checked = settings.mirror;
  $("setMirror").addEventListener("change", () => {
    settings.mirror = $("setMirror").checked;
    saveSettings();
    applyMirror();
  });

  $("clearHistory").addEventListener("click", clearHistory);
  $("clearHistory2").addEventListener("click", clearHistory);

  showMode("sign");
  routeFromHash();
}

function pushView(view) {
  window.history.pushState(null, "", "#" + view);
}
