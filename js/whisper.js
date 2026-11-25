const RATE = 16000;
/* Whisper hears whole phrases: audio is cut at pauses, never in the middle of a word. */
const PAUSE_SECONDS = 0.7;
const MIN_SPEECH_SECONDS = 0.3;
const MAX_SEGMENT_SECONDS = 20;
const PRE_ROLL_SECONDS = 0.4;

/* whisper-tiny gets most words wrong; base.en is accurate for English and small is the lightest model usable for Indian languages. */
const ENGLISH_MODEL = "Xenova/whisper-base.en";
const MULTILINGUAL_MODEL = "Xenova/whisper-small";

/* Errors where the browser has recognition but cannot use it (blocked Google service in Brave/Opera, unsupported language). */
const FALLBACK_ERRORS = new Set(["network", "service-not-allowed", "language-not-supported"]);

const asrPromises = new Map();

function loadWhisper(model, onProgress = () => {}) {
  if (!asrPromises.has(model)) {
    asrPromises.set(model, import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2").then(({ pipeline, env }) => {
      env.allowLocalModels = false;
      return pipeline("automatic-speech-recognition", model, {
        progress_callback: (info) => {
          if (info.status === "progress" && Number.isFinite(info.progress)) onProgress(info.progress);
        }
      });
    }));
  }
  return asrPromises.get(model);
}

export const SPEECH_LANGUAGES = [
  { id: "english", label: "English", code: "en-IN" },
  { id: "kannada", label: "Kannada", code: "kn-IN" },
  // No speech engine supports Tulu, so it is heard as Kannada and written in Kannada script.
  {
    id: "tulu",
    label: "Tulu (via Kannada script)",
    code: "kn-IN",
    whisper: "kannada",
    note: "Tulu is recognised using Kannada speech. Words shared with Kannada come out right; Tulu-only words may be written as the nearest Kannada word."
  },
  { id: "hindi", label: "Hindi", code: "hi-IN" },
  { id: "malayalam", label: "Malayalam", code: "ml-IN" },
  { id: "tamil", label: "Tamil", code: "ta-IN" },
  { id: "telugu", label: "Telugu", code: "te-IN" },
  { id: "marathi", label: "Marathi", code: "mr-IN" },
  { id: "bengali", label: "Bengali", code: "bn-IN" },
  { id: "gujarati", label: "Gujarati", code: "gu-IN" },
  { id: "punjabi", label: "Punjabi", code: "pa-IN" },
  { id: "urdu", label: "Urdu", code: "ur-IN" }
];

function languageOf(id) {
  return SPEECH_LANGUAGES.find((item) => item.id === id) || SPEECH_LANGUAGES[0];
}

function joinText(...parts) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function squash(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

/** Adds a recognised piece. Chrome on Android repeats the whole sentence in every result, so a piece that restates the text replaces it. */
function extend(text, piece) {
  const before = squash(text);
  if (before && squash(piece).startsWith(before)) return piece.trim();
  return joinText(text, piece);
}

const NOISE_ONLY = /^(sad music|music|applause|laughing|laughter|silence|blank audio|noise|cheering|clapping|singing|thanks for watching|please subscribe)[.!]?$/i;

/** Drops the noise labels and loops Whisper invents for silence or background sound. */
function spokenText(raw, voicedSeconds) {
  if (!raw) return "";
  const text = String(raw)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[♪♫]+/g, " ")
    // A phrase repeated four or more times is a decoding loop, not speech.
    .replace(/(^|\s)(\S.{0,40}?)(?:[\s,.!?।]+\2){3,}(?=[\s,.!?।]|$)/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  if (NOISE_ONLY.test(text)) return "";
  // Whisper writes "Thank you." over breaths and clicks; keep it only when real speech was heard.
  if (/^thank you[.!]?$/i.test(text) && voicedSeconds < 0.6) return "";
  return text;
}

function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function concat(pieces, length) {
  const out = new Float32Array(length);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/** Resamples to 16 kHz through the browser's band-limited resampler, which avoids the aliasing a plain interpolation adds. */
async function to16k(samples, fromRate) {
  if (fromRate === RATE) return samples;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offline = new Offline(1, Math.max(1, Math.ceil(samples.length * RATE / fromRate)), RATE);
  const buffer = offline.createBuffer(1, samples.length, fromRate);
  buffer.copyToChannel(samples, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Errors that will not fix themselves by restarting recognition. */
function fatalMessage(error, label) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Allow the microphone in Chrome or Edge.";
    case "language-not-supported":
      return `${label} speech is not supported in this browser. Use Google Chrome.`;
    case "network":
      return "Speech recognition needs an internet connection. Check the network and press Listen again.";
    case "audio-capture":
      return "No microphone was found.";
    default:
      return "";
  }
}

/**
 * Writes down what is spoken, in the chosen language.
 * The browser's own speech recognition does the work, so Kannada comes back in Kannada script,
 * English in English, and so on. Whisper runs in the page when the browser has no usable recognition.
 */
export function createSpeechSession({ onStatus, onTranscript, getLanguage, onEnd = () => {} }) {
  const language = languageOf(getLanguage());
  let open = false;
  let committed = "";
  let active = null;

  function paint(livePart = "") {
    const text = joinText(committed, livePart);
    if (text) onTranscript(text);
  }

  function finish(message) {
    if (!open) return;
    open = false;
    onStatus(message);
    onEnd();
  }

  /* Browser speech recognition (Chrome, Edge, Safari). */
  function liveSession(Rec) {
    let rec = null;
    let sessionFinal = "";
    let interim = "";
    let heard = false;
    let switched = false;

    function fallBack(error) {
      switched = true;
      try { rec?.abort(); } catch { /* ended */ }
      onStatus("This browser blocks its speech service. Switching to in-page recognition…");
      active = whisperSession();
      active.start().catch((err) => {
        console.error(err);
        finish(fatalMessage(error, language.label) || "Speech recognition could not start.");
      });
    }

    function begin() {
      rec = new Rec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = language.code;
      rec.onresult = (event) => {
        heard = true;
        sessionFinal = "";
        interim = "";
        for (let i = 0; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript || "";
          if (event.results[i].isFinal) sessionFinal = extend(sessionFinal, piece);
          else interim = extend(interim, piece);
        }
        paint(extend(sessionFinal, interim));
        onStatus(`Listening in ${language.label}… words appear as you talk.`);
      };
      rec.onerror = (event) => {
        if (switched) return;
        if (FALLBACK_ERRORS.has(event.error) && !heard) {
          fallBack(event.error);
          return;
        }
        const message = fatalMessage(event.error, language.label);
        if (message) finish(message);
      };
      rec.onend = () => {
        committed = joinText(committed, extend(sessionFinal, interim));
        sessionFinal = "";
        interim = "";
        paint();
        if (!open || switched) return;
        try { begin(); } catch { /* already running */ }
      };
      rec.start();
    }

    return {
      async start() {
        // Ask for the microphone first so a blocked mic shows a clear message.
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((track) => track.stop());
        open = true;
        begin();
        onStatus(`Listening in ${language.label}… speak now.`);
      },
      async stop() {
        open = false;
        try { rec?.stop(); } catch { /* ended */ }
        paint(extend(sessionFinal, interim));
      }
    };
  }

  /* In-page Whisper for browsers without usable speech recognition. Each pause in speech sends one phrase to the model. */
  function whisperSession() {
    const english = language.id === "english";
    const model = english ? ENGLISH_MODEL : MULTILINGUAL_MODEL;
    let ctx = null;
    let stream = null;
    let processor = null;
    let gain = null;
    let pieces = [];
    let length = 0;
    let voiced = 0;
    let silent = 0;
    let noise = 0.01;
    const queue = [];
    let working = null;

    const listening = () => `Listening in ${language.label}… text appears after each pause.`;

    function cut() {
      if (voiced >= MIN_SPEECH_SECONDS) {
        queue.push({ samples: concat(pieces, length), rate: ctx.sampleRate, voiced });
        pump();
      }
      pieces = [];
      length = 0;
      voiced = 0;
      silent = 0;
    }

    function onAudio(event) {
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      const seconds = samples.length / ctx.sampleRate;
      const level = rms(samples);
      // The threshold follows the room's background noise, so a fan or traffic does not count as speech.
      const speaking = level > Math.max(0.006, noise * 3);
      if (!speaking) noise = noise * 0.9 + level * 0.1;

      pieces.push(samples);
      length += samples.length;
      if (speaking) {
        voiced += seconds;
        silent = 0;
      } else {
        silent += seconds;
      }

      if (!voiced) {
        // Keep only a short lead-in of silence so the first syllable is not clipped.
        const keep = PRE_ROLL_SECONDS * ctx.sampleRate;
        while (pieces.length > 1 && length - pieces[0].length >= keep) length -= pieces.shift().length;
        return;
      }
      if (silent >= PAUSE_SECONDS || length / ctx.sampleRate >= MAX_SEGMENT_SECONDS) cut();
    }

    async function transcribe({ samples, rate, voiced: voicedSeconds }) {
      const asr = await loadWhisper(model);
      const audio = await to16k(samples, rate);
      // English-only models reject a language or task option.
      const options = english ? {} : { language: language.whisper || language.id, task: "transcribe" };
      const out = await asr(audio, options);
      const text = spokenText(out.text || "", voicedSeconds);
      if (text) {
        committed = joinText(committed, text);
        paint();
      }
      if (open) onStatus(listening());
    }

    function pump() {
      if (!working) {
        working = (async () => {
          while (queue.length) {
            try {
              await transcribe(queue.shift());
            } catch (err) {
              console.error(err);
            }
          }
          working = null;
        })();
      }
      return working;
    }

    return {
      async start() {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        ctx = new AudioContext();
        await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        gain = ctx.createGain();
        gain.gain.value = 0;
        processor.onaudioprocess = onAudio;
        source.connect(processor);
        processor.connect(gain);
        gain.connect(ctx.destination);
        open = true;
        onStatus(listening());
        void loadWhisper(model, (pct) => {
          if (open && !queue.length) onStatus(`Downloading the speech model (first time only)… ${Math.round(pct)}%`);
        }).then(() => { if (open) onStatus(listening()); }, (err) => console.error(err));
      },
      async stop() {
        open = false;
        if (processor) processor.onaudioprocess = null;
        processor?.disconnect();
        gain?.disconnect();
        if (ctx) cut();
        stream?.getTracks().forEach((track) => track.stop());
        if (ctx) await ctx.close();
        if (queue.length || working) onStatus("Finishing the last words…");
        await pump();
        paint();
      }
    };
  }

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  active = Rec ? liveSession(Rec) : whisperSession();
  return {
    start: () => active.start(),
    stop: () => active.stop()
  };
}
