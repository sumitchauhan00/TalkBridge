(() => {
  const micBtn = document.getElementById("micBtn");
  const micStatus = document.getElementById("micStatus");
  const speechTextEl = document.getElementById("speechText");
  const signPanel = document.getElementById("signPanel");
    const baseURL = window.location.origin;


  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;
  let lastSpeechEmitAt = 0;
  const SPEECH_SEND_COOLDOWN = 700;

  // Speech buffer
  let speechDebounceTimer = null;

  // end-of-utterance render state
  let utteranceTimer = null;
  let pendingTranscript = "";

  // render guards
  let renderToken = 0;

  // prevent accidental double commit
  let lastCommittedText = "";
  let lastCommittedAt = 0;
  const COMMIT_DEDUP_MS = 350;

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
  const base = `${baseURL}/signs/sentences/${key}`;
    return [
      { type: "video", url: `${base}.mp4` },
      { type: "img", url: `${base}.gif` },
      { type: "img", url: `${base}.png` },
    ];
  }

  function wordImageUrl(word) {
    return `${baseURL}/signs/words/${word}.png`;
  }
  function numberImageUrl(num) {
    return `${baseURL}/signs/numbers/${String(num).trim()}.png`;
  }
  function letterImageUrl(ch) {
    return `${baseURL}/signs/alphabets/${ch}.png`;
  }

  // ordered image load helper to avoid aage-piche render
  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, img });
      img.onerror = () => resolve({ ok: false, img: null });
      img.src = src;
    });
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

  async function renderWordFallback(text, token) {
    if (!signPanel) return;
    signPanel.innerHTML = "";

    const tokens = (text || "").split(/\s+/).filter(Boolean);

    for (const raw of tokens) {
      if (token !== renderToken) return;

      const tokenText = (raw || "").toLowerCase().trim();
      if (!tokenText) continue;

      // numeric token
      if (/^\d+$/.test(tokenText)) {
        for (const d of tokenText.split("")) {
          if (token !== renderToken) return;
          createNumberCard(d);
        }
        continue;
      }

      // spoken number token
      const num = normalizeNumberToken(tokenText);
      if (num !== null) {
        const digits = /^\d+$/.test(num) && num.length > 1 ? num.split("") : [num];
        for (const d of digits) {
          if (token !== renderToken) return;
          createNumberCard(d);
        }
        continue;
      }

      const w = normalizeWord(tokenText);
      if (!w) continue;

      const wordSrc = wordImageUrl(w);
      const wordTry = await loadImg(wordSrc);
      if (token !== renderToken) return;

      if (wordTry.ok) {
        const item = document.createElement("div");
        item.className = "sign-item pre";

        const img = document.createElement("img");
        img.src = wordSrc;
        img.alt = w;

        const lbl = document.createElement("span");
        lbl.innerText = w;

        item.appendChild(img);
        item.appendChild(lbl);
        signPanel.appendChild(item);
      } else {
        // fallback letters in strict order
        for (const ch of w) {
          if (token !== renderToken) return;
          if (!/[a-z]/.test(ch)) continue;

          const li = document.createElement("div");
          li.className = "sign-item pre";

          const limg = document.createElement("img");
          limg.src = letterImageUrl(ch);
          limg.alt = ch.toUpperCase();

          const llbl = document.createElement("span");
          llbl.innerText = ch.toUpperCase();

          limg.onerror = () => {
            li.innerHTML = `<div class="missing-sign">${ch.toUpperCase()}</div><span>${ch.toUpperCase()}</span>`;
          };

          li.appendChild(limg);
          li.appendChild(llbl);
          signPanel.appendChild(li);
        }
      }

      applySingleSizeClass();
    }

    applySingleSizeClass();
  }

  function renderSentenceOrFallback(text, token) {
    return new Promise((resolve) => {
      if (!signPanel || token !== renderToken) return resolve(false);
      signPanel.innerHTML = "";

      const clean = (text || "").trim();
      if (!clean) return resolve(false);

      const tokens = clean.split(/\s+/).filter(Boolean);
      if (tokens.length <= 1) {
        renderWordFallback(clean, token).then(() => resolve(true));
        return;
      }

      const candidates = sentenceMediaCandidates(clean);
      const wrap = document.createElement("div");
      wrap.className = "sign-item sentence-media pre";

      const label = document.createElement("span");
      label.innerText = clean.toLowerCase();

      let i = 0;
      const tryNext = () => {
        if (token !== renderToken) return resolve(false);

        if (i >= candidates.length) {
          renderWordFallback(clean, token).then(() => resolve(true));
          return;
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
            if (token !== renderToken) return resolve(false);
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
            if (token !== renderToken) return resolve(false);
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

      await renderSentenceOrFallback(cleanText, myToken);
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
    const app = window.VideoApp;
    const now = Date.now();
    if (!app?.realFriend || !text) return;
    if (now - lastSpeechEmitAt < SPEECH_SEND_COOLDOWN) return;
    app.socket.emit("speech-text", { to: app.realFriend, from: app.myId, text });
    lastSpeechEmitAt = now;
  }

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

  function cleanup() {
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

    if (micStatus) micStatus.innerText = "Mic Idle";
    if (micBtn) micBtn.innerText = "🎤 Start Listening";
  }

  window.AppSpeechToSign = {
    init() {
      initSpeechRecognition();

      const app = window.VideoApp;
      if (app?.socket && !app.__speechTextBound) {
        app.socket.on("speech-text", ({ text }) => {
          if (!text) return;
          if (speechTextEl) speechTextEl.innerText = text;
          scheduleSignRender(text);
        });
        app.__speechTextBound = true;
      }
    },
    cleanup,
  };
})();