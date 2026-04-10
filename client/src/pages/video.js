const socket = io("http://localhost:5000");

const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  alert("Login first");
  window.location = "Login.html";
}

const myId = user._id;
let realFriend = localStorage.getItem("callTo");

document.getElementById("myLabel").innerText = user.username;
socket.emit("join", myId);

const myVideo = document.getElementById("myVideo");
const userVideo = document.getElementById("userVideo");

myVideo.autoplay = true;
myVideo.playsInline = true;
myVideo.muted = true;
userVideo.autoplay = true;
userVideo.playsInline = true;

let localStream;
let peer;
let remoteStream;
let mlInterval = null;

// Perfect Negotiation
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;
const isCaller = localStorage.getItem("isCaller") === "true";
const polite = !isCaller;

// ML + TTS state
let predWindow = [];
const WINDOW_SIZE = 5;
let stableText = "Waiting for data...";
let lastSentAt = 0;
const SEND_COOLDOWN_MS = 700;

let sentenceHoldUntil = 0;
const SENTENCE_HOLD_MS = 3000;

let ttsEnabled = true;
let lastSpokenText = "";
let lastSpokenAt = 0;
const SPEAK_COOLDOWN_MS = 1200;

// Speech buffer
let speechDebounceTimer = null;

// end-of-utterance render state
let utteranceTimer = null;
let pendingTranscript = "";

// render guards
let renderToken = 0;

// prevent accidental double commit of same final text
let lastCommittedText = "";
let lastCommittedAt = 0;
const COMMIT_DEDUP_MS = 350;

function commitPendingTranscript() {
  const text = (pendingTranscript || "").trim();
  if (!text) return;

  const now = Date.now();
  const same = text === lastCommittedText;
  if (same && now - lastCommittedAt < COMMIT_DEDUP_MS) return;

  lastCommittedText = text;
  lastCommittedAt = now;

  if (speechTextEl) speechTextEl.innerText = text;
  scheduleSignRender(text);
  emitSpeechText(text);
}

function speakText(text) {
  if (!ttsEnabled || !text) return;
  const spoken = text.replace(/^Sentence:\s*/i, "").trim();
  if (!spoken) return;

  const now = Date.now();
  if (spoken === lastSpokenText && now - lastSpokenAt < SPEAK_COOLDOWN_MS) return;

  lastSpokenText = spoken;
  lastSpokenAt = now;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(spoken);
  utter.lang = "en-US";

  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find((v) => (v.lang || "").toLowerCase().includes("en"));
  if (enVoice) utter.voice = enVoice;

  const v = document.getElementById("voiceIndicator");
  if (v) {
    v.classList.add("speaking");
    v.innerText = "Speaking...";
  }

  utter.onend = utter.onerror = () => {
    const vv = document.getElementById("voiceIndicator");
    if (vv) {
      vv.classList.remove("speaking");
      vv.innerText = "Voice Idle";
    }
  };

  window.speechSynthesis.speak(utter);
}

window.speechSynthesis.onvoiceschanged = () => {
  window.speechSynthesis.getVoices();
};

function getStablePrediction(newLabel) {
  predWindow.push(newLabel);
  if (predWindow.length > WINDOW_SIZE) predWindow.shift();

  const counts = {};
  for (const p of predWindow) counts[p] = (counts[p] || 0) + 1;

  let best = null;
  let bestCount = 0;
  for (const key in counts) {
    if (counts[key] > bestCount) {
      best = key;
      bestCount = counts[key];
    }
  }

  return bestCount >= 2 ? best : null;
}

function showAlert(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

function goBackAfterCall() {
  const pre = localStorage.getItem("preCallPage");
  if (pre) {
    localStorage.removeItem("preCallPage");
    window.location = pre;
  } else {
    window.location = "Chat.html";
  }
}

async function loadFriendName() {
  if (!realFriend) return;
  try {
    const res = await fetch(`http://localhost:5000/api/auth/user/${realFriend}`);
    const data = await res.json();
    document.getElementById("friendLabel").innerText = data.username || "Unknown";
  } catch {
    document.getElementById("friendLabel").innerText = "Unknown";
  }
}
loadFriendName();

function ensureLocalTracksAdded() {
  if (!peer || !localStream) return;
  const senders = peer.getSenders();

  localStream.getTracks().forEach((track) => {
    const existing = senders.find((s) => s.track && s.track.kind === track.kind);
    if (!existing) peer.addTrack(track, localStream);
    else if (existing.track !== track) existing.replaceTrack(track);
  });
}

function createPeer() {
  if (peer) return;

  peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peer.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) {
      remoteStream = stream;
      userVideo.srcObject = stream;
      userVideo.play?.().catch(() => {});
    }
  };

  peer.onicecandidate = ({ candidate }) => {
    if (candidate && realFriend) socket.emit("ice-candidate", { to: realFriend, candidate });
  };

  peer.onconnectionstatechange = () => {
    if ((peer.connectionState === "connected" || peer.connectionState === "completed") && remoteStream) {
      if (userVideo.srcObject !== remoteStream) userVideo.srcObject = remoteStream;
      userVideo.play?.().catch(() => {});
    }
  };

  peer.onnegotiationneeded = async () => {
    try {
      if (!realFriend) return;
      makingOffer = true;
      await peer.setLocalDescription(await peer.createOffer());
      socket.emit("webrtc-description", {
        to: realFriend,
        from: myId,
        description: peer.localDescription,
      });
    } catch (e) {
      console.log("onnegotiationneeded error:", e);
    } finally {
      makingOffer = false;
    }
  };

  ensureLocalTracksAdded();
}

// Speech -> Sign
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const speechTextEl = document.getElementById("speechText");
const signPanel = document.getElementById("signPanel");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let lastSpeechEmitAt = 0;
const SPEECH_SEND_COOLDOWN = 700;

let signShowTimer = null;
let lastRenderedSpeech = "";
let signSequenceTimers = [];

function clearSignSequenceTimers() {
  signSequenceTimers.forEach((t) => clearTimeout(t));
  signSequenceTimers = [];
}

function applySingleSizeClass() {
  if (!signPanel) return;
  const count = signPanel.querySelectorAll(".sign-item").length;
  signPanel.classList.toggle("single-item", count === 1);
  signPanel.classList.toggle("two-items", count === 2);
}

function showSignPanel() {
  if (!signPanel) return;
  signPanel.classList.remove("hide");
  void signPanel.offsetWidth;
  signPanel.classList.add("show");
}

function hideSignPanelSmooth() {
  if (!signPanel) return;
  signPanel.classList.remove("show");
  signPanel.classList.add("hide");
}

function animateSignsOneByOne(token) {
  if (!signPanel) return;
  const items = Array.from(signPanel.querySelectorAll(".sign-item"));
  if (!items.length) return;

  items.forEach((el) => {
    el.classList.remove("show", "hide");
    el.classList.add("pre");
  });

  void signPanel.offsetHeight;

  const SHOW_GAP = 260;
  const HIDE_GAP = 200;
  const HOLD_AFTER_SHOW = 900;

  items.forEach((el, idx) => {
    const t = setTimeout(() => {
      if (token !== renderToken) return;
      el.classList.remove("pre");
      el.classList.add("show");
    }, idx * SHOW_GAP);
    signSequenceTimers.push(t);
  });

  const hideStart = items.length * SHOW_GAP + HOLD_AFTER_SHOW;
  items.forEach((el, idx) => {
    const t = setTimeout(() => {
      if (token !== renderToken) return;
      el.classList.remove("show");
      el.classList.add("hide");
    }, hideStart + idx * HIDE_GAP);
    signSequenceTimers.push(t);
  });

  const endT = setTimeout(() => {
    if (token !== renderToken) return;
    hideSignPanelSmooth();
    signPanel.innerHTML = "";
    signPanel.classList.remove("show", "hide", "single-item", "two-items");
  }, hideStart + items.length * HIDE_GAP + 350);
  signSequenceTimers.push(endT);
}

function normalizeWord(w) {
  return (w || "").toLowerCase().replace(/[^a-z]/g, "").trim();
}

function normalizeNumberToken(token) {
  const t = String(token).toLowerCase().replace(/[^\w]/g, "").trim();
  if (/^\d+$/.test(t)) return t;

  const wordToDigit = {
    zero: "0",
    oh: "0",
    o: "0",
    one: "1",
    two: "2",
    to: "2",
    too: "2",
    three: "3",
    four: "4",
    for: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    ate: "8",
    nine: "9",
    ten: "10",
  };
  return wordToDigit[t] ?? null;
}

function normalizeSingleSpokenNumber(text) {
  const t = String(text || "").toLowerCase().trim().replace(/[.,!?]/g, "");
  const map = {
    zero: "0",
    oh: "0",
    o: "0",
    one: "1",
    two: "2",
    to: "2",
    too: "2",
    three: "3",
    four: "4",
    for: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    ate: "8",
    nine: "9",
  };

  if (/^\d$/.test(t)) return t;
  if (map[t] !== undefined) return map[t];
  return text;
}

function sentenceKey(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function sentenceMediaCandidates(text) {
  const key = sentenceKey(text);
  if (!key) return [];
  const base = `http://localhost:5000/signs/sentences/${key}`;
  return [
    { type: "video", url: `${base}.mp4` },
    { type: "img", url: `${base}.gif` },
    { type: "img", url: `${base}.png` },
  ];
}

function wordImageUrl(word) {
  return `http://localhost:5000/signs/words/${word}.png`;
}
function numberImageUrl(num) {
  return `http://localhost:5000/signs/numbers/${String(num).trim()}.png`;
}
function letterImageUrl(ch) {
  return `http://localhost:5000/signs/alphabets/${ch}.png`;
}

function createNumberCard(digit) {
  const item = document.createElement("div");
  item.className = "sign-item pre";

  const img = document.createElement("img");
  const lbl = document.createElement("span");

  img.src = numberImageUrl(digit);
  img.alt = digit;
  lbl.innerText = digit;

  img.onerror = () => {
    item.innerHTML = `<div class="missing-sign">${digit}</div><span>${digit}</span>`;
  };

  item.appendChild(img);
  item.appendChild(lbl);
  signPanel.appendChild(item);
}

function renderWordFallback(text) {
  if (!signPanel) return;
  signPanel.innerHTML = "";

  const tokens = (text || "").split(/\s+/).filter(Boolean);

  tokens.forEach((raw) => {
    const token = (raw || "").toLowerCase().trim();
    if (!token) return;

    if (/^\d+$/.test(token)) {
      token.split("").forEach((digit) => createNumberCard(digit));
      return;
    }

    const num = normalizeNumberToken(token);
    if (num !== null) {
      if (/^\d+$/.test(num) && num.length > 1) num.split("").forEach((d) => createNumberCard(d));
      else createNumberCard(num);
      return;
    }

    const w = normalizeWord(token);
    if (!w) return;

    const item = document.createElement("div");
    item.className = "sign-item pre";

    const img = document.createElement("img");
    const lbl = document.createElement("span");
    lbl.innerText = w;

    img.src = wordImageUrl(w);
    img.alt = w;

    img.onerror = () => {
      const first = w[0];
      if (first) img.src = letterImageUrl(first);
      else item.innerHTML = `<div class="missing-sign">${w}</div><span>${w}</span>`;
    };

    item.appendChild(img);
    item.appendChild(lbl);
    signPanel.appendChild(item);
  });

  applySingleSizeClass();
}

function renderSentenceOrFallback(text) {
  return new Promise((resolve) => {
    if (!signPanel) return resolve(false);
    signPanel.innerHTML = "";

    const clean = (text || "").trim();
    if (!clean) return resolve(false);

    const tokens = clean.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) {
      renderWordFallback(clean);
      return resolve(true);
    }

    const candidates = sentenceMediaCandidates(clean);
    const wrap = document.createElement("div");
    wrap.className = "sign-item sentence-media pre";

    const label = document.createElement("span");
    label.innerText = clean.toLowerCase();

    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) {
        renderWordFallback(clean);
        return resolve(true);
      }

      const c = candidates[i++];
      wrap.innerHTML = "";

      if (c.type === "video") {
        const v = document.createElement("video");
        v.src = c.url;
        v.autoplay = true;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.controls = false;
        v.preload = "auto";

        v.onloadeddata = () => {
          wrap.appendChild(v);
          wrap.appendChild(label);
          signPanel.innerHTML = "";
          signPanel.appendChild(wrap);
          applySingleSizeClass();
          resolve(true);
        };
        v.onerror = () => tryNext();
      } else {
        const img = document.createElement("img");
        img.src = c.url;
        img.alt = clean;

        img.onload = () => {
          wrap.appendChild(img);
          wrap.appendChild(label);
          signPanel.innerHTML = "";
          signPanel.appendChild(wrap);
          applySingleSizeClass();
          resolve(true);
        };
        img.onerror = () => tryNext();
      }
    };

    tryNext();
  });
}

function scheduleSignRender(text) {
  if (!signPanel) return;

  const cleanText = (text || "").trim();
  if (!cleanText) return;

  const myToken = ++renderToken;

  if (signShowTimer) {
    clearTimeout(signShowTimer);
    signShowTimer = null;
  }
  clearSignSequenceTimers();

  lastRenderedSpeech = cleanText;

  signPanel.classList.remove("show", "hide", "single-item", "two-items");
  signPanel.innerHTML = "";

  const isSingleToken = !cleanText.includes(" ");
  const delay = isSingleToken ? 0 : 120;

  signShowTimer = setTimeout(async () => {
    if (myToken !== renderToken) return;

    await renderSentenceOrFallback(cleanText);
    if (myToken !== renderToken) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (myToken !== renderToken) return;
        const items = signPanel.querySelectorAll(".sign-item");
        if (!items.length) return;
        applySingleSizeClass();
        showSignPanel();
        animateSignsOneByOne(myToken);
      });
    });

    signShowTimer = null;
  }, delay);
}

function emitSpeechText(text) {
  const now = Date.now();
  if (!realFriend || !text) return;
  if (now - lastSpeechEmitAt < SPEECH_SEND_COOLDOWN) return;
  socket.emit("speech-text", { to: realFriend, from: myId, text });
  lastSpeechEmitAt = now;
}

function initSpeechRecognition() {
  if (!micBtn || !micStatus) return;

  if (!SpeechRecognition) {
    micStatus.innerText = "Speech API not supported";
    micBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    clearTimeout(speechDebounceTimer);
    clearTimeout(utteranceTimer);
    pendingTranscript = "";
    lastCommittedText = "";
    lastCommittedAt = 0;
    micStatus.innerText = "Listening...";
    micBtn.innerText = "🛑 Stop Listening";
  };

  recognition.onend = () => {
    clearTimeout(speechDebounceTimer);
    clearTimeout(utteranceTimer);

    if ((pendingTranscript || "").trim()) commitPendingTranscript();
    pendingTranscript = "";

    if (isListening) {
      setTimeout(() => {
        try { recognition.start(); } catch {}
      }, 120);
      return;
    }

    micStatus.innerText = "Mic Idle";
    micBtn.innerText = "🎤 Start Listening";
  };

  recognition.onerror = (e) => {
    micStatus.innerText = `Mic error: ${e.error}`;
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      const t = (r[0]?.transcript || "").toLowerCase().trim();
      if (!t) continue;

      if (r.isFinal) finalText += " " + t;
      else interimText += " " + t;
    }

    finalText = finalText.replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();
    interimText = interimText.replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();

    if (speechTextEl && interimText) speechTextEl.innerText = interimText;

    if (!finalText) return;

    if (!finalText.includes(" ")) finalText = normalizeSingleSpokenNumber(finalText);

    pendingTranscript = finalText;

    clearTimeout(utteranceTimer);
    utteranceTimer = setTimeout(() => {
      commitPendingTranscript();
      pendingTranscript = "";
    }, 250);
  };

  if (!micBtn.dataset.bound) {
    micBtn.addEventListener("click", () => {
      if (!recognition) return;

      if (!isListening) {
        isListening = true;
        try { recognition.start(); } catch {}
        micStatus.innerText = "Listening...";
        micBtn.innerText = "🛑 Stop Listening";
      } else {
        isListening = false;
        recognition.stop();
        micStatus.innerText = "Mic Idle";
        micBtn.innerText = "🎤 Start Listening";
      }
    });
    micBtn.dataset.bound = "1";
  }
}

async function start() {
  try {
    if (!realFriend) realFriend = localStorage.getItem("callTo");

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      myVideo.srcObject = localStream;
      myVideo.play?.().catch(() => {});
    } catch (e) {
      console.warn("Local media unavailable:", e);
      showAlert("Camera/Mic not available on this tab");
    }

    createPeer();
    ensureLocalTracksAdded();
    startMLLoop();
    initSpeechRecognition();

    if (isCaller) socket.emit("call-user", { to: realFriend, from: myId });
  } catch (err) {
    console.error("Start error:", err);
    showAlert("Could not start call");
  }
}

socket.on("call-made", async ({ from }) => {
  realFriend = from;
  loadFriendName();

  if (!peer) createPeer();

  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      myVideo.srcObject = localStream;
      myVideo.play?.().catch(() => {});
      ensureLocalTracksAdded();
    } catch {
      console.warn("Receiver local media unavailable; recv-only");
    }
  }
});

socket.on("webrtc-description", async ({ from, description }) => {
  try {
    realFriend = from;
    if (!peer) createPeer();

    const readyForOffer =
      !makingOffer && (peer.signalingState === "stable" || isSettingRemoteAnswerPending);

    const offerCollision = description.type === "offer" && !readyForOffer;
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;

    isSettingRemoteAnswerPending = description.type === "answer";
    await peer.setRemoteDescription(description);
    isSettingRemoteAnswerPending = false;

    if (description.type === "offer") {
      ensureLocalTracksAdded();
      await peer.setLocalDescription(await peer.createAnswer());
      socket.emit("webrtc-description", {
        to: realFriend,
        from: myId,
        description: peer.localDescription,
      });
    }
  } catch (e) {
    console.error("webrtc-description error:", e);
  }
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    if (!peer || !candidate) return;
    await peer.addIceCandidate(candidate);
  } catch (e) {
    if (!ignoreOffer) console.error("ICE add error:", e);
  }
});

socket.on("call-declined", () => {
  showAlert("Call Declined");
  setTimeout(cleanupAndExit, 700);
});

socket.on("call-ended", () => {
  showAlert("Call Ended");
  setTimeout(cleanupAndExit, 700);
});

socket.on("speech-text", ({ text }) => {
  if (!text) return;
  if (speechTextEl) speechTextEl.innerText = text;
  scheduleSignRender(text);
});

// ML LOOP
function startMLLoop() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (mlInterval) clearInterval(mlInterval);

  mlInterval = setInterval(() => {
    if (!myVideo.srcObject || myVideo.readyState < 2) return;

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(myVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");

      try {
        const res = await fetch("http://localhost:5000/api/ml/predict", {
          method: "POST",
          body: fd,
        });

        const data = await res.json();
        const aiTextEl = document.getElementById("aiText");
        const nowTs = Date.now();
        if (!aiTextEl) return;

        if (data.sentence) {
          const sentenceText = `Sentence: ${data.sentence}`;
          aiTextEl.innerText = sentenceText;
          aiTextEl.classList.add("sentence");
          aiTextEl.classList.remove("live");

          sentenceHoldUntil = nowTs + SENTENCE_HOLD_MS;
          speakText(sentenceText);

          if (sentenceText !== stableText) {
            stableText = sentenceText;
            if (realFriend && nowTs - lastSentAt > SEND_COOLDOWN_MS) {
              socket.emit("ml-text", { to: realFriend, text: stableText });
              lastSentAt = nowTs;
            }
          }
          return;
        }

        if (nowTs < sentenceHoldUntil) return;

        let currentLabel = null;
        if (data.sign) {
          currentLabel = `Sign: ${data.sign} (${Math.round((data.confidence || 0) * 100)}%)`;
        }

        if (!currentLabel) {
          aiTextEl.innerText = "Waiting for signs...";
          aiTextEl.classList.remove("live", "sentence");
          return;
        }

        const stable = getStablePrediction(currentLabel);
        const finalText = stable || currentLabel;

        aiTextEl.innerText = finalText;
        aiTextEl.classList.add("live");
        aiTextEl.classList.remove("sentence");

        if (finalText !== stableText) {
          stableText = finalText;
          if (realFriend && nowTs - lastSentAt > SEND_COOLDOWN_MS) {
            socket.emit("ml-text", { to: realFriend, text: stableText });
            lastSentAt = nowTs;
          }
        }
      } catch (e) {
        console.log("ML fetch error:", e);
      }
    }, "image/jpeg", 0.7);
  }, 700);
}

socket.on("ml-text", ({ text }) => {
  const aiTextEl = document.getElementById("aiText");
  if (!aiTextEl) return;

  aiTextEl.innerText = text || "Waiting for data...";

  if (text && text.startsWith("Sentence:")) {
    aiTextEl.classList.add("sentence");
    aiTextEl.classList.remove("live");
    speakText(text);
    sentenceHoldUntil = Date.now() + SENTENCE_HOLD_MS;
  } else {
    aiTextEl.classList.add("live");
    aiTextEl.classList.remove("sentence");
  }
});

setInterval(() => {
  if (remoteStream && userVideo.srcObject !== remoteStream) {
    userVideo.srcObject = remoteStream;
    userVideo.play?.().catch(() => {});
  }
}, 500);

function cleanupAndExit() {
  if (localStream) localStream.getTracks().forEach((track) => track.stop());

  if (peer) {
    peer.onnegotiationneeded = null;
    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.close();
    peer = null;
  }

  if (mlInterval) {
    clearInterval(mlInterval);
    mlInterval = null;
  }

  if (recognition && isListening) recognition.stop();

  if (signShowTimer) {
    clearTimeout(signShowTimer);
    signShowTimer = null;
  }

  clearSignSequenceTimers();
  clearTimeout(speechDebounceTimer);
  clearTimeout(utteranceTimer);

  isListening = false;
  if (recognition) {
    try { recognition.onend = null; recognition.stop(); } catch {}
  }

  pendingTranscript = "";

  if (signPanel) {
    signPanel.classList.remove("show", "hide", "single-item", "two-items");
    signPanel.innerHTML = "";
  }

  lastRenderedSpeech = "";
  renderToken = 0;
  lastCommittedText = "";
  lastCommittedAt = 0;

  window.speechSynthesis.cancel();

  const v = document.getElementById("voiceIndicator");
  if (v) {
    v.classList.remove("speaking");
    v.innerText = "Voice Idle";
  }

  if (micStatus) micStatus.innerText = "Mic Idle";
  if (micBtn) micBtn.innerText = "🎤 Start Listening";

  predWindow = [];
  stableText = "Waiting for data...";
  sentenceHoldUntil = 0;
  lastSpokenText = "";
  lastSpokenAt = 0;

  makingOffer = false;
  ignoreOffer = false;
  isSettingRemoteAnswerPending = false;

  localStorage.removeItem("isCaller");
  localStorage.removeItem("callTo");

  goBackAfterCall();
}

function hangUp() {
  if (realFriend) socket.emit("end-call", { to: realFriend });
  cleanupAndExit();
}

function declineCall() {
  if (realFriend) socket.emit("call-declined", { to: realFriend });
  cleanupAndExit();
}

function toggleMute() {
  if (!localStream) return;
  const tracks = localStream.getAudioTracks();
  if (!tracks.length) return;
  const enabled = tracks[0].enabled;
  tracks[0].enabled = !enabled;
  showAlert(enabled ? "Mic Off" : "Mic On");
}

function toggleVideo() {
  if (!localStream) return;
  const tracks = localStream.getVideoTracks();
  if (!tracks.length) return;
  const enabled = tracks[0].enabled;
  tracks[0].enabled = !enabled;
  showAlert(enabled ? "Camera Off" : "Camera On");
}

start();