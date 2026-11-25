import { IslCamera } from "./camera.js";
import { glossOf, GLOSS } from "./gloss.js";
import { framePair } from "./features.js";
import { signsFrom, matchBest } from "./knn.js";
import { speak, primeSpeech } from "./speech.js";
import { SPEECH_LANGUAGES, createSpeechSession } from "./whisper.js";
import { initUi, settings, addHistory, setCameraLive } from "./ui.js";

const $ = (id) => document.getElementById(id);

initUi();

let signs = null;
// A sign ends when no hand is seen for this many frames in a row.
const END_GAP = 6;
// Fewer hand frames than this is a twitch, not a sign.
const MIN_FRAMES = 8;
// While the hands stay up, the sign is checked this often, using at most the last MAX_SIGN_MS.
const CHECK_MS = 400;
const LIVE_AFTER_MS = 1000;
const MAX_SIGN_MS = 3000;
let cam = null;
// At least 3 of the 5 closest recordings must be the same sign.
const minConfidence = 0.6;
// A real sign is far closer to its own recordings than to any other sign. Random movement sits about
// as far from every sign (ratio near 1), so anything above MAX_RATIO is not a sign.
const MAX_RATIO = 0.8;
// Even a clear winner must be reasonably close to its recordings.
const MAX_DISTANCE = 2.2;

/* The current sign: every frame with a hand since the hands entered the box. */
let frames = [];
let times = [];
let gap = 0;
let handsSeen = 0;
let lastCheck = 0;
let lastLive = null;
let spokenThisSign = null;
let showingResult = false;

function clearSign() {
  frames = [];
  times = [];
  gap = 0;
  handsSeen = 0;
  lastCheck = 0;
  lastLive = null;
  spokenThisSign = null;
}

/** Matches the frames so far, shows the verdict, and returns the sign if it can be trusted. */
function isNear(guess) {
  return guess.distance <= MAX_DISTANCE && guess.ratio <= MAX_RATIO;
}

function accepts(guess) {
  return isNear(guess) && guess.confidence >= minConfidence && guess.confidence > guess.secondConfidence;
}

function judge() {
  const guess = matchBest(frames, signs, accepts);
  const pct = Math.round(guess.confidence * 100);
  const gloss = glossOf(guess.label);
  const other = glossOf(guess.second);
  const count = handsSeen === 2 ? "two hands" : "one hand";
  const near = isNear(guess);
  console.debug(`[sign] ${guess.label} votes ${pct}% distance ${guess.distance.toFixed(2)} ratio ${guess.ratio.toFixed(2)}`);
  const confident = near && guess.confidence >= minConfidence;
  const clear = guess.confidence > guess.secondConfidence;
  if (!near) {
    setStatus("invalid", "Not a sign",
      "This movement does not match any sign in your dataset.");
  } else if (!confident) {
    setStatus("invalid", "Not a sign",
      "This movement is not clearly any one sign in your dataset.", pct);
  } else if (!clear) {
    setStatus("invalid", "Invalid Sign – Please Try Again",
      `Unclear: it looks like both ${gloss.en} and ${other.en}. Sign it the way it was recorded.`, pct);
  } else {
    setStatus("valid", gloss.en, `Confirmed · ${count}`, pct);
  }
  return confident && clear ? guess.label : null;
}

function commit(label) {
  spokenThisSign = label;
  showSign(label);
  $("liveTulu").dataset.confirmed = "1";
}

/** The hands left the box: judge the whole sign once. */
function finishSign() {
  if (frames.length >= MIN_FRAMES) {
    const label = judge();
    if (label && label !== spokenThisSign) commit(label);
    showingResult = true;
  }
  clearSign();
}

function onHands(hands, sides) {
  if (!signs) return;
  if (!hands.length) {
    if (frames.length) {
      gap += 1;
      if (gap >= END_GAP) finishSign();
    } else if (!showingResult) {
      setStatus("nohand", "No hand detected", "Show your sign inside the box.");
    }
    return;
  }
  gap = 0;
  showingResult = false;
  const now = performance.now();
  const pair = framePair(hands, sides);
  frames.push(pair.first.concat(pair.second));
  times.push(now);
  handsSeen = Math.max(handsSeen, hands.length);
  // Hands held up for a long time: keep only the latest stretch, which holds the sign being made now.
  while (now - times[0] > MAX_SIGN_MS) {
    frames.shift();
    times.shift();
  }
  if (frames.length < MIN_FRAMES || now - times[0] < LIVE_AFTER_MS) {
    setStatus("processing", "Reading the sign…", "Make the sign, then lower your hands.");
    return;
  }
  if (now - lastCheck < CHECK_MS) return;
  lastCheck = now;
  // With the hands still up, speak only when two checks in a row agree.
  const label = judge();
  if (label && label === lastLive && label !== spokenThisSign) commit(label);
  lastLive = label;
}

function showSign(id) {
  const gloss = glossOf(id);
  // Start the audio first so the voice is not held up by page updates.
  if (settings.speak) speak(gloss.tulu, "tulu");
  $("gloss").textContent = gloss.en;
  $("liveTulu").textContent = gloss.tulu;
  $("liveNote").textContent = settings.speak
    ? "Confirmed from your dataset. Audio played once."
    : "Confirmed from your dataset.";
  addHistory(gloss);
}

/* ---------- Prediction status: idle · nohand · processing · valid · invalid ---------- */

let shownStatus = "";

function setStatus(state, title, detail = "", pct = null) {
  const key = `${state}|${title}|${detail}|${pct}`;
  if (key === shownStatus) return;
  shownStatus = key;
  $("verdict").dataset.state = state;
  $("stage").dataset.state = state;
  $("verdictTitle").textContent = title;
  $("verdictDetail").textContent = detail;
  $("verdictPct").textContent = pct === null ? "" : `${pct}%`;
  $("hudGuess").textContent = pct === null ? title : `${title} · ${pct}%`;
  $("confBar").style.width = `${pct || 0}%`;
  $("confBar").parentElement.dataset.state = state;
  // The translation only stands while the current sign is valid.
  $("liveTulu").classList.toggle("stale", state !== "valid" && $("liveTulu").dataset.confirmed === "1");
}

function resetSign() {
  clearSign();
  showingResult = false;
  $("gloss").textContent = "English gloss";
  $("liveTulu").textContent = "Show a sign";
  $("liveTulu").dataset.confirmed = "0";
  $("liveNote").textContent = "Tulu is spoken once when the whole sign matches above the threshold.";
  setStatus(cam?.running ? "nohand" : "idle",
    cam?.running ? "No hand detected" : "Camera is off",
    cam?.running ? "Show your sign inside the box." : "Open the camera and sign inside the box.");
}

$("retrySign").addEventListener("click", resetSign);

$("startCam").addEventListener("click", async () => {
  // Runs inside the click so the browser allows audio, and the voice is ready before the first sign.
  if (settings.speak) primeSpeech("tulu");
  try {
    if (!cam) {
      cam = new IslCamera({
        video: $("cam"),
        overlay: $("overlay"),
        onStatus: (message) => {
          $("camStatus").textContent = message;
          $("camDot").classList.toggle("on", /on|box/i.test(message));
        },
        onSign: () => {},
        onHands
      });
    }
    clearSign();
    showingResult = false;
    await cam.start();
    setCameraLive(true);
    setStatus("nohand", "No hand detected", "Show your sign inside the box.");
    $("startCam").disabled = true;
    $("stopCam").disabled = false;
  } catch (err) {
    $("camStatus").textContent = "Allow the camera in Chrome or Edge at http://localhost.";
    console.error(err);
  }
});

$("stopCam").addEventListener("click", () => {
  cam?.stop();
  setCameraLive(false);
  setStatus("idle", "Camera is off", "Open the camera and sign inside the box.");
  $("startCam").disabled = false;
  $("stopCam").disabled = true;
});

let speechSession = null;
let speechLanguage = "english";

function renderLanguages(query = "") {
  const list = $("langList");
  const needle = query.trim().toLowerCase();
  const matches = SPEECH_LANGUAGES.filter((item) => item.label.toLowerCase().includes(needle));
  list.innerHTML = "";
  for (const item of matches) {
    const row = document.createElement("li");
    row.textContent = item.label;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", item.id === speechLanguage ? "true" : "false");
    row.addEventListener("click", () => {
      speechLanguage = item.id;
      $("langToggle").textContent = item.label;
      $("langNote").textContent = item.note || "";
      $("langNote").hidden = !item.note;
      closeLanguageMenu();
    });
    list.appendChild(row);
  }
  if (!matches.length) {
    const empty = document.createElement("li");
    empty.textContent = "No language matches";
    empty.style.cursor = "default";
    list.appendChild(empty);
  }
}

function closeLanguageMenu() {
  $("langMenu").hidden = true;
  $("langToggle").setAttribute("aria-expanded", "false");
}

$("langToggle").addEventListener("click", () => {
  const menu = $("langMenu");
  const open = menu.hidden;
  menu.hidden = !open;
  $("langToggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    $("langSearch").value = "";
    renderLanguages();
    $("langSearch").focus();
  }
});

$("langSearch").addEventListener("input", () => renderLanguages($("langSearch").value));

document.addEventListener("click", (event) => {
  if (!event.target.closest(".lang-pick")) closeLanguageMenu();
});

renderLanguages();

function setListening(on) {
  $("listenBtn").disabled = on;
  $("listenStop").disabled = !on;
  $("langToggle").disabled = on;
  if (on) closeLanguageMenu();
}

$("listenBtn").addEventListener("click", async () => {
  try {
    const language = SPEECH_LANGUAGES.find((item) => item.id === speechLanguage);
    $("transcript").textContent = "The spoken text will appear here.";
    $("transcript").lang = language?.code || "en-IN";
    setListening(true);
    speechSession = createSpeechSession({
      getLanguage: () => speechLanguage,
      onStatus: (message) => {
        $("listenStatus").textContent = message;
      },
      onTranscript: (text) => {
        if (text) $("transcript").textContent = text;
      },
      onEnd: () => {
        speechSession = null;
        setListening(false);
      }
    });
    await speechSession.start();
  } catch (err) {
    speechSession = null;
    setListening(false);
    $("listenStatus").textContent = err.name === "NotAllowedError" || err.name === "NotSupportedError"
      ? "Allow the microphone in Chrome or Edge."
      : "Speech recognition could not start. Use Chrome or Edge and try Listen again.";
    console.error(err);
  }
});

$("listenStop").addEventListener("click", async () => {
  $("listenStop").disabled = true;
  const session = speechSession;
  speechSession = null;
  await session?.stop();
  setListening(false);
  $("listenStatus").textContent = "Done.";
});

fetch("model/signs.json")
  .then((res) => {
    if (!res.ok) throw new Error("missing signs");
    return res.json();
  })
  .then((pack) => {
    signs = signsFrom(pack);
    $("modelStatus").remove();
  })
  .catch((err) => {
    $("modelStatus").textContent = "Your clip library was not found.";
    console.error(err);
  });
