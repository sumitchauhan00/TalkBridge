(() => {
  let mlInterval = null;
  let isDetecting = false;

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

  const detectBtn = document.getElementById("detectBtn");
  const detectStatus = document.getElementById("detectStatus");
  const aiTextEl = document.getElementById("aiText");

  // ==== DYNAMIC BASE URL ====
  const baseURL = window.location.origin;

  function setDetectUI(active) {
    if (detectBtn) detectBtn.innerText = active ? "⏹ Stop Detecting" : "▶ Start Detecting";
    if (detectStatus) {
      detectStatus.innerText = active ? "Detecting..." : "Detection Idle";
      detectStatus.classList.toggle("active", active);
      detectStatus.classList.toggle("idle", !active);
    }
    if (!active && aiTextEl) {
      aiTextEl.innerText = "Waiting for data...";
      aiTextEl.classList.remove("live", "sentence");
    }
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

  function startMLLoop() {
    const app = window.VideoApp;
    const myVideo = app?.myVideo;
    if (!myVideo) return;

    if (mlInterval) clearInterval(mlInterval);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    mlInterval = setInterval(() => {
      if (!isDetecting) return;
      if (!myVideo.srcObject || myVideo.readyState < 2) return;

      canvas.width = 320;
      canvas.height = 240;
      ctx.drawImage(myVideo, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob || !isDetecting) return;

          const fd = new FormData();
          fd.append("frame", blob, "frame.jpg");

          try {
            // ====== ONLY THIS LINE CHANGED ======
            const res = await fetch(`${baseURL}/api/ml/predict`, {
              method: "POST",
              body: fd,
            });

            const data = await res.json();
            const nowTs = Date.now();
            if (!aiTextEl || !isDetecting) return;

            if (data.sentence) {
              const sentenceText = `Sentence: ${data.sentence}`;
              aiTextEl.innerText = sentenceText;
              aiTextEl.classList.add("sentence");
              aiTextEl.classList.remove("live");

              sentenceHoldUntil = nowTs + SENTENCE_HOLD_MS;
              speakText(sentenceText);

              if (sentenceText !== stableText) {
                stableText = sentenceText;
                if (app.realFriend && nowTs - lastSentAt > SEND_COOLDOWN_MS) {
                  app.socket.emit("ml-text", { to: app.realFriend, text: stableText });
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
              if (app.realFriend && nowTs - lastSentAt > SEND_COOLDOWN_MS) {
                app.socket.emit("ml-text", { to: app.realFriend, text: stableText });
                lastSentAt = nowTs;
              }
            }
          } catch (e) {
            console.log("ML fetch error:", e);
          }
        },
        "image/jpeg",
        0.7
      );
    }, 700);
  }

  function stopDetecting() {
    isDetecting = false;
    setDetectUI(false);
    sentenceHoldUntil = 0;
    predWindow = [];
    stableText = "Waiting for data...";
  }

  function startDetecting() {
    isDetecting = true;
    setDetectUI(true);
  }

  function toggleDetecting() {
    if (isDetecting) stopDetecting();
    else startDetecting();
  }

  function bindDetectButton() {
    if (!detectBtn || detectBtn.dataset.bound) return;
    detectBtn.addEventListener("click", toggleDetecting);
    detectBtn.dataset.bound = "1";
  }

  function cleanup() {
    if (mlInterval) {
      clearInterval(mlInterval);
      mlInterval = null;
    }

    stopDetecting();
    window.speechSynthesis.cancel();

    const v = document.getElementById("voiceIndicator");
    if (v) {
      v.classList.remove("speaking");
      v.innerText = "Voice Idle";
    }

    predWindow = [];
    stableText = "Waiting for data...";
    sentenceHoldUntil = 0;
    lastSpokenText = "";
    lastSpokenAt = 0;
  }

  window.AppSignToSpeech = {
    init() {
      bindDetectButton();
      setDetectUI(false);   // initial idle state
      startMLLoop();        // loop runs, but detect only when isDetecting = true

      const app = window.VideoApp;
      if (app?.socket && !app.__mlTextBound) {
        app.socket.on("ml-text", ({ text }) => {
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
        app.__mlTextBound = true;
      }
    },
    cleanup,
  };
})();