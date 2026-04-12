// =======================================================
// hand-detection-box.js
// FIXED: Uses existing call stream (myVideo.srcObject) so
// toggleVideo() from video-core.js works correctly.
// Stable top-left box + multi-sign probs + countdown animation
// Sentence NOT shown in box.
// =======================================================

(() => {
  const video = document.getElementById("myVideo");
  const canvas = document.getElementById("handCanvas");
  const detectBtn = document.getElementById("detectBtn");
  const detectStatus = document.getElementById("detectStatus");
  const aiText = document.getElementById("aiText");

  if (!video || !canvas || !detectBtn) {
    console.warn("hand-detection-box: Missing #myVideo / #handCanvas / #detectBtn");
    return;
  }

  const ctx = canvas.getContext("2d");

  // ---------------- CONFIG ----------------
  const BACKEND_URL = "http://localhost:5000";
  const PREDICT_INTERVAL_MS = 350;
  const COUNTDOWN_SECONDS = 2.8;
  const MIN_CONFIDENCE_TO_TRACK = 0.45;
  const TOP_K = 5;

  // ---------------- STATE ----------------
  let isDetecting = false;
  let isPredicting = false;
  let lastPredictTs = 0;

  let streamStarted = false;
  let cameraStarted = false;

  let stableSign = "";
  let countdownLeft = COUNTDOWN_SECONDS;
  let lastStableTs = 0;
  let sentenceWords = []; // internally kept only

  // ---------------- OVERLAY BOX ----------------
  let infoBox = document.getElementById("handInfoBox");
  if (!infoBox) {
    infoBox = document.createElement("div");
    infoBox.id = "handInfoBox";
    document.body.appendChild(infoBox);
  }

  Object.assign(infoBox.style, {
    position: "fixed",
    left: "8px",
    top: "8px",
    zIndex: "999999",
    minWidth: "250px",
    maxWidth: "340px",
    padding: "10px",
    borderRadius: "8px",
    background: "rgba(18,18,18,0.82)",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    display: "none",
    pointerEvents: "none",
    backdropFilter: "blur(2px)",
  });

  let lastBoxHtml = "";
  let boxVisible = false;

  function showBox(html) {
    if (html !== lastBoxHtml) {
      infoBox.innerHTML = html;
      lastBoxHtml = html;
    }
    if (!boxVisible) {
      infoBox.style.display = "block";
      boxVisible = true;
    }
  }

  function hideBox() {
    infoBox.style.display = "none";
    boxVisible = false;
    lastBoxHtml = "";
  }

  // ---------------- HELPERS ----------------
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
  const nowMs = () => Date.now();

  function toPercent(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return 0;
    return n <= 1 ? n * 100 : n;
  }

  function normalizeProbMap(data) {
    if (data?.probabilities && typeof data.probabilities === "object") {
      const out = {};
      for (const [k, v] of Object.entries(data.probabilities)) out[k] = toPercent(v);
      return out;
    }
    const sign = String(data?.sign || "").trim();
    const conf = toPercent(data?.confidence || 0);
    if (sign) return { [sign]: conf };
    return {};
  }

  function topEntries(probMap, k = TOP_K) {
    return Object.entries(probMap)
      .filter(([_, v]) => typeof v === "number" && Number.isFinite(v))
      .sort((a, b) => b[1] - a[1])
      .slice(0, k);
  }

  // ---------------- UI ----------------
  function renderBar(label, value) {
    const v = Math.round(clamp(value));
    return `
      <div style="margin-top:6px;">
        <div style="display:flex;justify-content:space-between;gap:8px;line-height:1;">
          <span style="text-transform:lowercase;color:#e5e7eb;">${label}:</span>
          <span style="color:#d1d5db;">${v}%</span>
        </div>
        <div style="margin-top:4px;height:10px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${v}%;background:#66ff33;"></div>
        </div>
      </div>
    `;
  }

  function renderCountdownProgress(countdown) {
    const total = COUNTDOWN_SECONDS;
    const left = Math.max(0, countdown);
    const ratio = clamp(((total - left) / total) * 100, 0, 100);
    const done = left <= 0.05;

    return `
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#fbbf24;">Generating in ${left.toFixed(1)}s</span>
          <span style="color:${done ? "#22c55e" : "#fbbf24"};">${done ? "READY" : ""}</span>
        </div>
        <div style="margin-top:4px;height:8px;background:rgba(255,255,255,0.12);border-radius:3px;overflow:hidden;">
          <div style="
            height:100%;
            width:${ratio}%;
            background:linear-gradient(90deg,#facc15,#22c55e);
            transition:width 120ms linear;
          "></div>
        </div>
      </div>
    `;
  }

  function renderAdvancedBox({ probMap, currentSign, currentConf, countdown, statusText }) {
    const tops = topEntries(probMap, TOP_K);
    const bars = tops.length
      ? tops.map(([label, val]) => renderBar(label, val)).join("")
      : `<div style="margin-top:6px;color:#facc15;">No probability map</div>`;

    showBox(`
      <div style="font-weight:700;color:#86efac;line-height:1;">● ${statusText || "Hand detected"}</div>
      ${bars}
      <div style="margin-top:8px;color:#e5e7eb;">
        <b>Hold</b> ${currentSign || "..."} (${Math.round(clamp(currentConf))}%)
      </div>
      ${renderCountdownProgress(countdown)}
    `);

    if (detectStatus) {
      detectStatus.textContent = isDetecting ? "Detecting..." : "Detection Idle";
      detectStatus.classList.toggle("idle", !isDetecting);
    }
    // if (aiText) aiText.textContent = currentSign ? `Current sign: ${currentSign}` : "Waiting for data...";
  }

  function renderNoHand() {
    showBox(`
      <div style="font-weight:700;color:#facc15;line-height:1;">✋ No hand detected</div>
      <div style="margin-top:8px;color:#9ca3af;">Show your hand clearly in frame</div>
    `);
    // if (aiText) aiText.textContent = "No hand detected";
  }

  function renderError(message) {
    showBox(`<div style="font-weight:700;color:#f87171;">${message}</div>`);
    if (aiText) aiText.textContent = `Error: ${message}`;
  }

  // ---------------- SENTENCE LOGIC ----------------
  function resetCountdownState() {
    stableSign = "";
    countdownLeft = COUNTDOWN_SECONDS;
    lastStableTs = 0;
  }

  function clearSentence() {
    sentenceWords = [];
    resetCountdownState();
  }

  function updateSentenceWithPrediction(data) {
    const probMap = normalizeProbMap(data);
    const tops = topEntries(probMap, 1);
    const bestSign = tops.length ? tops[0][0] : "";
    const bestConf = tops.length ? tops[0][1] : 0;
    const t = nowMs();

    if (!bestSign || bestConf < MIN_CONFIDENCE_TO_TRACK * 100) {
      resetCountdownState();
      renderAdvancedBox({
        probMap,
        currentSign: bestSign,
        currentConf: bestConf,
        countdown: countdownLeft,
        statusText: "Hand detected",
      });
      return;
    }

    if (!stableSign || stableSign !== bestSign) {
      stableSign = bestSign;
      countdownLeft = COUNTDOWN_SECONDS;
      lastStableTs = t;
    } else {
      const dt = (t - lastStableTs) / 1000;
      lastStableTs = t;
      countdownLeft -= dt;
    }

    if (countdownLeft <= 0) {
      if (!sentenceWords.length || sentenceWords[sentenceWords.length - 1] !== stableSign) {
        sentenceWords.push(stableSign);
      }
      stableSign = "";
      countdownLeft = COUNTDOWN_SECONDS;
      lastStableTs = t;
    }

    renderAdvancedBox({
      probMap,
      currentSign: bestSign,
      currentConf: bestConf,
      countdown: countdownLeft,
      statusText: "Hand detected",
    });
  }

  // ---------------- VIDEO/CANVAS ----------------
  function resizeCanvasToVideo() {
    const rect = video.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
  }

  // IMPORTANT FIX:
  // Prefer existing call stream (video-core localStream on myVideo.srcObject)
  async function startCameraOnce() {
    if (streamStarted && video.srcObject) return;

    if (video.srcObject) {
      streamStarted = true;
      return;
    }

    // fallback only if call stream not ready yet
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;

    await new Promise((resolve) => {
      if (video.readyState >= 1) return resolve();
      video.onloadedmetadata = () => resolve();
    });

    await video.play();
    streamStarted = true;
  }

  function stopCameraFallbackOnly() {
    // stop only if this file created standalone stream (no peer/call stream distinction available)
    const s = video.srcObject;
    if (!s) return;
    const tracks = s.getVideoTracks();
    tracks.forEach((t) => t.stop());
    video.srcObject = null;
    streamStarted = false;
  }

  async function captureFrameBlob() {
    const snap = document.createElement("canvas");
    snap.width = video.videoWidth || 640;
    snap.height = video.videoHeight || 480;
    const sctx = snap.getContext("2d");
    sctx.drawImage(video, 0, 0, snap.width, snap.height);

    return await new Promise((resolve, reject) => {
      snap.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Frame capture failed"))),
        "image/jpeg",
        0.85
      );
    });
  }

  // ---------------- API ----------------
  async function getRealPrediction() {
    const blob = await captureFrameBlob();
    const fd = new FormData();
    fd.append("frame", blob, "frame.jpg");

    const url = `${BACKEND_URL}/api/ml/predict`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let res;
    try {
      res = await fetch(url, { method: "POST", body: fd, signal: controller.signal });
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") throw new Error("Request timeout (12s)");
      throw new Error(`Network error: ${err.message}`);
    }
    clearTimeout(timeout);

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON from /api/ml/predict (status ${res.status})`);
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || `API error ${res.status}`);
    }

    return data;
  }

  // ---------------- INIT ----------------
  async function init() {
    try {
      await startCameraOnce();
      resizeCanvasToVideo();
      window.addEventListener("resize", resizeCanvasToVideo);

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      hands.onResults(async (results) => {
        resizeCanvasToVideo();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!isDetecting) return;

        // If video track disabled by toggleVideo(), skip ML
        const stream = video.srcObject;
        const vt = stream?.getVideoTracks?.()[0];
        if (!vt || !vt.enabled || vt.readyState !== "live") {
          resetCountdownState();
          renderError("Camera is off");
          return;
        }

        const hasHand = !!(results.multiHandLandmarks && results.multiHandLandmarks.length);
        if (!hasHand) {
          resetCountdownState();
          renderNoHand();
          return;
        }

        const t = nowMs();
        if (isPredicting || t - lastPredictTs < PREDICT_INTERVAL_MS) return;

        isPredicting = true;
        lastPredictTs = t;

        try {
          const data = await getRealPrediction();
          updateSentenceWithPrediction(data);
        } catch (err) {
          console.error(err);
          renderError(err.message || "Prediction failed");
        } finally {
          isPredicting = false;
        }
      });

      const camera = new Camera(video, {
        onFrame: async () => {
          // If camera is toggled off from video-core, do not process
          const stream = video.srcObject;
          const vt = stream?.getVideoTracks?.()[0];
          if (!vt || !vt.enabled || vt.readyState !== "live") return;

          if (isDetecting) {
            await hands.send({ image: video });
          }
        },
        width: 1280,
        height: 720,
      });

      if (!cameraStarted) {
        await camera.start();
        cameraStarted = true;
      }

      detectBtn.addEventListener("click", () => {
        // Do not allow detect when camera off
        const stream = video.srcObject;
        const vt = stream?.getVideoTracks?.()[0];
        const camOn = !!vt && vt.enabled && vt.readyState === "live";

        if (!camOn) {
          isDetecting = false;
          detectBtn.textContent = "▶ Start Detecting";
          renderError("Turn camera ON first");
          return;
        }

        isDetecting = !isDetecting;
        detectBtn.textContent = isDetecting ? "⏹ Stop Detecting" : "▶ Start Detecting";

        if (detectStatus) {
          detectStatus.textContent = isDetecting ? "Detecting..." : "Detection Idle";
          detectStatus.classList.toggle("idle", !isDetecting);
        }

        if (!isDetecting) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          hideBox();
        } else {
          showBox(`<div style="font-weight:700;color:#93c5fd;">Detecting started...</div>`);
        }
      });

      // Listen to video toggle from video-core (add this dispatch there if needed)
      // window.dispatchEvent(new CustomEvent("app:video-toggled", { detail: { enabled } }));
      window.addEventListener("app:video-toggled", (e) => {
        const enabled = !!e.detail?.enabled;

        if (!enabled) {
          isDetecting = false;
          detectBtn.textContent = "▶ Start Detecting";
          if (detectStatus) {
            detectStatus.textContent = "Detection Idle";
            detectStatus.classList.add("idle");
          }
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          renderError("Camera is off");
        } else {
          showBox(`<div style="font-weight:700;color:#93c5fd;">Camera resumed</div>`);
          setTimeout(() => {
            if (!isDetecting) hideBox();
          }, 900);
        }
      });

      // optional helpers
      window.clearDetectedSentence = clearSentence;
      window.stopMlFallbackCamera = () => stopCameraFallbackOnly();

      showBox(`<div style="font-weight:700;color:#93c5fd;">Ready. Click "Start Detecting"</div>`);
      setTimeout(() => {
        if (!isDetecting) hideBox();
      }, 1200);

      window.addEventListener("beforeunload", () => {
        try { stopCameraFallbackOnly(); } catch (_) {}
      });
    } catch (e) {
      console.error("Init error:", e);
      renderError(e.message || "Camera init failed");
    }
  }

  init();
})();