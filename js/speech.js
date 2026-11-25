const synth = window.speechSynthesis || null;

/* Tulu is written in Kannada script, so a Kannada voice is tried first: other voices read it slowly or not at all. */
const PREFERENCE = {
  tulu: [/^kn/i, /^hi/i, /^ta/i, /^te/i, /^en-IN/i],
  en: [/^en-IN/i, /^en-GB/i, /^en-US/i, /^en/i]
};
const FALLBACK_LANG = { tulu: "kn-IN", en: "en-IN" };

let voices = [];
const chosen = new Map();
let current = null; // keeps the utterance alive so Chrome does not drop it mid-speech

function loadVoices() {
  voices = synth ? synth.getVoices() : [];
  chosen.clear();
}

if (synth) {
  loadVoices();
  // Chrome fills the voice list after page load.
  synth.addEventListener?.("voiceschanged", loadVoices);
}

/** Best voice for a hint, picked once. Installed voices start instantly; online ones wait on the network. */
function voiceFor(hint) {
  if (chosen.has(hint)) return chosen.get(hint);
  let pick = null;
  for (const pattern of PREFERENCE[hint] || PREFERENCE.en) {
    const matches = voices.filter((v) => pattern.test(v.lang.replace("_", "-")));
    if (matches.length) {
      pick = matches.find((v) => v.localService) || matches[0];
      break;
    }
  }
  if (voices.length) chosen.set(hint, pick);
  return pick;
}

function utterance(text, hint) {
  const u = new SpeechSynthesisUtterance(text);
  const voice = voiceFor(hint);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || FALLBACK_LANG[hint] || "en-IN";
  u.rate = 1;
  return u;
}

/** Wakes the speech engine (and an online voice's connection) so the first real word plays without a cold start. */
export function primeSpeech(langHint = "tulu") {
  if (!synth) return;
  if (!voices.length) loadVoices();
  const u = utterance(" ", langHint);
  u.volume = 0;
  synth.speak(u);
}

export function speak(text, langHint = "en") {
  if (!synth || !text) return;
  if (!voices.length) loadVoices();
  if (synth.speaking || synth.pending) synth.cancel();
  // Chrome can leave the engine paused after a quiet spell; resume makes the next utterance start at once.
  synth.resume();
  current = utterance(text, langHint);
  current.onend = current.onerror = () => { current = null; };
  synth.speak(current);
}

export function listenEnglish(onText, onStatus) {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) {
    onStatus("Speech recognition is not available in this browser. Use Chrome.");
    return { stop() {} };
  }
  const rec = new Rec();
  rec.lang = "en-IN";
  rec.interimResults = false;
  rec.onresult = (e) => {
    const said = e.results[0][0].transcript;
    onText(said);
  };
  rec.onerror = () => onStatus("Mic listening failed.");
  rec.onend = () => onStatus("Listening stopped.");
  rec.start();
  onStatus("Listening for English…");
  return rec;
}
