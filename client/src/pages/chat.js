const socket = io("http://localhost:5000");

// =========================
// AUTH + USER
// =========================
let user = JSON.parse(localStorage.getItem("user"));
if (!user || !user._id) {
  alert("Login first");
  window.location = "Login.html";
}
const myId = user._id;

const myNameEl = document.getElementById("myName");
const myPhotoEl = document.getElementById("myPhoto");
if (myNameEl) myNameEl.innerText = user.username || "";
if (myPhotoEl) {
  myPhotoEl.src =
    user.photo && user.photo.length > 10
      ? user.photo
      : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          user.username || "U"
        )}`;
}

// listen profile updates from other pages (no refresh)
window.addEventListener("storage", (e) => {
  if (e.key === "user" && e.newValue) {
    try {
      user = JSON.parse(e.newValue);
      if (myNameEl) myNameEl.innerText = user.username || "";
      if (myPhotoEl) {
        myPhotoEl.src =
          user.photo && user.photo.length > 10
            ? user.photo
            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                user.username || "U"
              )}`;
      }
    } catch {}
  }
});

// =========================
// DOM
// =========================
const searchInput = document.getElementById("searchInput");
const searchResultEl = document.getElementById("searchResult");
const contactsEl = document.getElementById("contacts");
const notificationsEl = document.getElementById("notifications");

const chatWithEl = document.getElementById("chatWith");
const chatEl = document.getElementById("chat");
const msgInput = document.getElementById("msg");
const typingEl = document.getElementById("typing");
const welcomeEl = document.getElementById("welcome");
const sendAreaEl = document.getElementById("sendArea");
const videoCallBtn = document.getElementById("videoCallBtn");
const msgSound = document.getElementById("msgSound");

const API = "http://localhost:5000/api";

let activeChatUser = null;
let allContacts = [];
let pendingRequests = [];
let lastSearchUsers = [];
let searchDebounce = null;
let typingTimer = null;
let onlineSet = new Set();

// initial state
if (sendAreaEl) sendAreaEl.style.display = "none";
if (videoCallBtn) videoCallBtn.classList.add("hidden");
if (welcomeEl) welcomeEl.style.display = "flex";

// =========================
// SOCKET JOIN
// =========================
socket.emit("join", myId);

// =========================
// HELPERS
// =========================
function avatar(u) {
  if (u?.photo && u.photo.length > 8) return u.photo;
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    u?.username || "U"
  )}`;
}

function esc(str = "") {
  return str.replace(/[<>&"]/g, (m) => {
    const map = { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" };
    return map[m];
  });
}

function showAlert(message) {
  const modal = document.getElementById("alertModal");
  const msg = document.getElementById("alertMessage");
  if (!modal || !msg) return alert(message);
  msg.innerText = message;
  modal.style.display = "flex";
}
function closeAlert() {
  const modal = document.getElementById("alertModal");
  if (modal) modal.style.display = "none";
}
window.closeAlert = closeAlert;

function goProfile() {
  window.location = "profile.html";
}
window.goProfile = goProfile;

// =========================
// CONTACTS (STATE + RENDER)
// =========================
async function loadContacts() {
  try {
    const res = await fetch(`${API}/contacts/${myId}`);
    const data = await res.json();
    allContacts = Array.isArray(data) ? data : [];
    renderContacts(allContacts);
  } catch (e) {
    console.log("loadContacts error:", e);
    allContacts = [];
    renderContacts([]);
  }
}

function renderContacts(list) {
  if (!contactsEl) return;
  contactsEl.innerHTML = "";

  if (!list.length) {
    contactsEl.innerHTML = `<div class="contact">No contacts yet</div>`;
    return;
  }

  list.forEach((u) => {
    const div = document.createElement("div");
    div.className = "contact";
    div.dataset.id = String(u._id);
    div.innerHTML = `
      <img class="contact-dp" src="${avatar(u)}" alt="${esc(u.username || "user")}" />
      <div class="contact-name">${esc(u.username || "Unknown")}</div>
      <span id="online-${u._id}" class="dot ${onlineSet.has(String(u._id)) ? "online" : ""}"></span>
    `;

    div.addEventListener("click", () => selectContact(u));

    // profile open
    div.addEventListener("dblclick", () => {
      localStorage.setItem("viewProfile", JSON.stringify(u));
      window.location = "contactprofile.html";
    });
    div.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      localStorage.setItem("viewProfile", JSON.stringify(u));
      window.location = "contactprofile.html";
    });

    contactsEl.appendChild(div);
  });

  if (activeChatUser?._id) setActiveContactUI(String(activeChatUser._id));
}

function setActiveContactUI(selectedId) {
  const items = contactsEl.querySelectorAll(".contact");
  items.forEach((el) => {
    if (el.dataset.id === selectedId) el.classList.add("active");
    else el.classList.remove("active");
  });
}

function selectContact(u) {
  activeChatUser = u;
  localStorage.setItem("chatWith", u._id);

  setActiveContactUI(String(u._id));

  if (chatWithEl) chatWithEl.innerText = u.username || "Unknown";
  if (welcomeEl) welcomeEl.style.display = "none";
  if (sendAreaEl) sendAreaEl.style.display = "flex";
  if (videoCallBtn) videoCallBtn.classList.remove("hidden");

  loadMessages();
}

// =========================
// SEARCH + ADD (STATE-DRIVEN)
// =========================
async function searchUsers(q) {
  const keyword = (q || "").trim();
  if (!keyword) {
    lastSearchUsers = [];
    renderSearchResults([]);
    return;
  }

  try {
    const res = await fetch(
      `${API}/contacts/search/${myId}?q=${encodeURIComponent(keyword)}`
    );
    const users = await res.json();
    lastSearchUsers = Array.isArray(users) ? users : [];
    renderSearchResults(lastSearchUsers);
  } catch (e) {
    console.log("searchUsers error:", e);
    lastSearchUsers = [];
    renderSearchResults([]);
  }
}

function renderSearchResults(users) {
  if (!searchResultEl) return;
  searchResultEl.innerHTML = "";

  if (!users.length) {
    searchResultEl.innerHTML = `<div class="search-user">No user found</div>`;
    return;
  }

  users.forEach((u) => {
    const row = document.createElement("div");
    row.className = "search-user";

    const alreadyPending = pendingRequests.some((r) => String(r.from?._id || r.from) === String(u._id));
    const btnText = alreadyPending ? "Sent" : "Add";
    const disabled = alreadyPending ? "disabled" : "";

    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${avatar(u)}" alt="${esc(u.username || "user")}">
        <span>${esc(u.username || "Unknown")}</span>
      </div>
      <button data-id="${u._id}" ${disabled}>${btnText}</button>
    `;

    const btn = row.querySelector("button");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await sendFriendRequest(u._id, btn);
    });

    row.addEventListener("click", () => {
      localStorage.setItem("viewProfile", JSON.stringify(u));
      window.location = "contactprofile.html";
    });

    searchResultEl.appendChild(row);
  });
}

async function sendFriendRequest(toId, btn) {
  try {
    btn.disabled = true;
    btn.innerText = "Sending...";

    const res = await fetch(`${API}/requests/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: myId, to: toId }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.message || "Failed");

    btn.innerText = "Sent";
    btn.disabled = true;
  } catch (e) {
    console.log("sendFriendRequest error:", e);
    btn.disabled = false;
    btn.innerText = "Add";
    showAlert(e.message || "Request send failed");
  }
}

if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    const val = e.target.value || "";
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchUsers(val), 250);
  });
}

// =========================
// REQUESTS (NO REFRESH UI)
// =========================
async function loadRequests() {
  if (!notificationsEl) return;

  try {
    const res = await fetch(`${API}/requests/${myId}`);
    const list = await res.json();
    pendingRequests = Array.isArray(list) ? list : [];
    renderRequests(pendingRequests);
  } catch (e) {
    console.log("loadRequests error:", e);
    pendingRequests = [];
    renderRequests([]);
  }
}

function renderRequests(list) {
  notificationsEl.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    notificationsEl.innerHTML = `<div class="request-item"><span>No requests</span></div>`;
    return;
  }

  list.forEach((r) => {
    const from = r.from;
    if (!from) return;

    const item = document.createElement("div");
    item.className = "request-item";
    item.dataset.id = r._id;
    item.innerHTML = `
      <img src="${avatar(from)}" alt="${esc(from.username || "user")}">
      <span>${esc(from.username || "Unknown")}</span>
      <button data-act="accept">Accept</button>
      <button data-act="reject">Reject</button>
    `;

    const [acceptBtn, rejectBtn] = item.querySelectorAll("button");

    acceptBtn.addEventListener("click", () => handleRequest(r._id, "accept"));
    rejectBtn.addEventListener("click", () => handleRequest(r._id, "reject"));

    notificationsEl.appendChild(item);
  });
}

async function handleRequest(requestId, action) {
  try {
    const endpoint = action === "accept" ? "accept" : "reject";
    const res = await fetch(`${API}/requests/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Action failed");

    // local request remove instantly
    pendingRequests = pendingRequests.filter((r) => String(r._id) !== String(requestId));
    renderRequests(pendingRequests);

    // if accepted, refresh contacts instantly
    if (action === "accept") {
      await loadContacts();
    }
  } catch (e) {
    console.log("handleRequest error:", e);
    showAlert(e.message || "Request action failed");
  }
}

// =========================
// MESSAGES (your realtime already okay)
// =========================
async function loadMessages() {
  if (!activeChatUser || !chatEl) return;

  try {
    const res = await fetch(`${API}/messages/${myId}/${activeChatUser._id}`);
    const list = await res.json();

    chatEl.innerHTML = "";

    if (!Array.isArray(list) || !list.length) return;

    list.forEach((m) => {
      const mine = String(m.sender) === String(myId);
      const msg = document.createElement("div");
      msg.className = mine ? "me" : "other";
      msg.innerText = m.message || "";
      chatEl.appendChild(msg);
    });

    chatEl.scrollTop = chatEl.scrollHeight;
  } catch (e) {
    console.log("loadMessages error:", e);
  }
}

function appendMessageLive({ sender, message }) {
  if (!chatEl) return;
  const mine = String(sender) === String(myId);
  const msg = document.createElement("div");
  msg.className = mine ? "me" : "other";
  msg.innerText = message || "";
  chatEl.appendChild(msg);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function send() {
  const text = (msgInput?.value || "").trim();
  if (!text) return;
  if (!activeChatUser) return showAlert("Select a contact first");

  socket.emit("send_message", {
    senderId: myId,
    receiverId: activeChatUser._id,
    message: text,
  });

  appendMessageLive({ sender: myId, message: text });
  if (msgInput) msgInput.value = "";
}
window.send = send;

if (msgInput) {
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
    if (activeChatUser) socket.emit("typing", { from: myId, to: activeChatUser._id });
  });
}

socket.on("receive_message", ({ senderId, message }) => {
  if (msgSound) {
    msgSound.currentTime = 0;
    msgSound.play().catch(() => {});
  }

  if (activeChatUser && String(activeChatUser._id) === String(senderId)) {
    appendMessageLive({ sender: senderId, message });
  }
});

socket.on("typing", ({ from }) => {
  if (!activeChatUser) return;
  if (String(from) !== String(activeChatUser._id)) return;

  if (typingEl) typingEl.innerText = "typing...";
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (typingEl) typingEl.innerText = "";
  }, 1200);
});

// =========================
// ONLINE / OFFLINE
// =========================
socket.on("online-users", (ids) => {
  onlineSet = new Set((ids || []).map(String));
  renderContacts(allContacts);
});

socket.on("user-online", (uid) => {
  onlineSet.add(String(uid));
  const d = document.getElementById(`online-${uid}`);
  if (d) d.classList.add("online");
});

socket.on("user-offline", (uid) => {
  onlineSet.delete(String(uid));
  const d = document.getElementById(`online-${uid}`);
  if (d) d.classList.remove("online");
});

// =========================
// CALL FLOW (already realtime)
// =========================
function startCall() {
  if (!activeChatUser) return showAlert("Select a contact first");

  localStorage.setItem("callTo", activeChatUser._id);
  localStorage.setItem("isCaller", "true");
  localStorage.setItem("preCallPage", "Chat.html");

  socket.emit("call-user", { to: activeChatUser._id, from: myId });

  setTimeout(() => {
    window.location = "video.html";
  }, 120);
}
window.startCall = startCall;

let incomingFrom = null;

socket.on("call-made", ({ from }) => {
  incomingFrom = from;
  const modal = document.getElementById("callModal");
  if (modal) modal.style.display = "flex";
});

function acceptCall() {
  if (!incomingFrom) return;

  localStorage.setItem("callTo", incomingFrom);
  localStorage.setItem("isCaller", "false");
  localStorage.setItem("preCallPage", "Chat.html");

  const modal = document.getElementById("callModal");
  if (modal) modal.style.display = "none";

  window.location = "video.html";
}
window.acceptCall = acceptCall;

function declineCall() {
  if (incomingFrom) socket.emit("call-declined", { to: incomingFrom });
  incomingFrom = null;
  const modal = document.getElementById("callModal");
  if (modal) modal.style.display = "none";
}
window.declineCall = declineCall;

// =========================
// INIT
// =========================
loadContacts();
loadRequests();
setInterval(loadRequests, 6000); // keeps request list updated live-ish without page refresh

// =========================
// LIVE REFRESH HOOKS (NO MANUAL REFRESH)
// =========================

// 1) jab koi page (contactprofile/profile) localStorage key update kare
window.addEventListener("storage", (e) => {
  if (e.key === "contacts_updated_at") {
    loadContacts();
    loadRequests();
    // agar selected contact delete ho gaya ho to UI reset
    if (activeChatUser) {
      const exists = allContacts.some(c => String(c._id) === String(activeChatUser._id));
      if (!exists) {
        activeChatUser = null;
        if (chatWithEl) chatWithEl.innerText = "";
        if (chatEl) chatEl.innerHTML = "";
        if (welcomeEl) welcomeEl.style.display = "flex";
        if (sendAreaEl) sendAreaEl.style.display = "none";
        if (videoCallBtn) videoCallBtn.classList.add("hidden");
      }
    }
  }

  if (e.key === "profile_updated_at" || e.key === "user") {
    try {
      const u = JSON.parse(localStorage.getItem("user"));
      if (u) {
        if (myNameEl) myNameEl.innerText = u.username || "";
        if (myPhotoEl) {
          myPhotoEl.src =
            u.photo && u.photo.length > 10
              ? u.photo
              : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  u.username || "U"
                )}`;
        }
      }
    } catch {}
  }
});

// 2) jab tab dubara active ho (back from contactprofile)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadContacts();
    loadRequests();
  }
});

// 3) fallback short poll (lightweight)
setInterval(() => {
  loadContacts();
}, 5000);

//////////////////////////////////////////////////
// VIDEO / WEBRTC / ML (YOUR EXISTING CODE)
//////////////////////////////////////////////////
const myVideo = document.getElementById("myVideo");
const userVideo = document.getElementById("userVideo");

if (myVideo) {
  myVideo.autoplay = true;
  myVideo.playsInline = true;
  myVideo.muted = true;
}
if (userVideo) {
  userVideo.autoplay = true;
  userVideo.playsInline = true;
}

let localStream;
let peer;
let remoteStream;
let mlInterval = null;

let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;

// Caller = impolite, Receiver = polite
const isCaller = localStorage.getItem("isCaller") === "true";
const polite = !isCaller;

// ML smoothing
let predWindow = [];
const WINDOW_SIZE = 5;
let stableText = "Waiting for data...";
let lastSentAt = 0;
const SEND_COOLDOWN_MS = 700;

let sentenceHoldUntil = 0;
const SENTENCE_HOLD_MS = 3000;

// TTS
let ttsEnabled = true;
let lastSpokenText = "";
let lastSpokenAt = 0;
const SPEAK_COOLDOWN_MS = 1200;

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
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;

  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find((v) => (v.lang || "").toLowerCase().includes("en"));
  if (enVoice) utter.voice = enVoice;

  const v = document.getElementById("voiceIndicator");
  if (v) {
    v.classList.add("speaking");
    v.innerText = "Speaking...";
  }

  utter.onend = utter.onerror = () => {
    const v2 = document.getElementById("voiceIndicator");
    if (v2) {
      v2.classList.remove("speaking");
      v2.innerText = "Voice Idle";
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
    const label = document.getElementById("friendLabel");
    if (label) label.innerText = data.username || "Unknown";
  } catch {
    const label = document.getElementById("friendLabel");
    if (label) label.innerText = "Unknown";
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
    if (stream && userVideo) {
      remoteStream = stream;
      userVideo.srcObject = stream;
      userVideo.play?.().catch(() => {});
    }
  };

  peer.onicecandidate = ({ candidate }) => {
    if (candidate && realFriend) socket.emit("ice-candidate", { to: realFriend, candidate });
  };

  peer.onconnectionstatechange = () => {
    if (
      (peer.connectionState === "connected" || peer.connectionState === "completed") &&
      remoteStream &&
      userVideo
    ) {
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

// Speech to sign
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const speechTextEl = document.getElementById("speechText");
const signPanel = document.getElementById("signPanel");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let lastSpeechEmitAt = 0;
const SPEECH_SEND_COOLDOWN = 700;
const SIGN_SHOW_DELAY_MS = 2000;
const SIGN_VISIBLE_MS = 2000;

let signShowTimer = null;
let signHideTimer = null;
let lastRenderedSpeech = "";

function normalizeWord(w) {
  return (w || "").toLowerCase().replace(/[^a-z]/g, "").trim();
}
function wordImageUrl(word) {
  return `http://localhost:5000/signs/${word}.png`;
}
function letterImageUrl(ch) {
  return `http://localhost:5000/signs/letters/${ch}.png`;
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

function renderSignsFromText(text) {
  if (!signPanel) return;
  signPanel.innerHTML = "";
  const words = (text || "").split(/\s+/).filter(Boolean);

  words.forEach((raw) => {
    const w = normalizeWord(raw);
    if (!w) return;

    const item = document.createElement("div");
    item.className = "sign-item";

    const img = document.createElement("img");
    img.src = wordImageUrl(w);
    img.alt = w;
    img.onerror = () => {
      const first = w[0];
      if (first) img.src = letterImageUrl(first);
    };

    const lbl = document.createElement("span");
    lbl.innerText = w;

    item.appendChild(img);
    item.appendChild(lbl);
    signPanel.appendChild(item);
  });
}

function renderSentenceMedia(text, onFail) {
  if (!signPanel) return;
  signPanel.innerHTML = "";

  const candidates = sentenceMediaCandidates(text);
  if (!candidates.length) {
    onFail?.();
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "sign-item sentence-media";

  const label = document.createElement("span");
  label.innerText = text.toLowerCase();

  let idx = 0;

  const tryNext = () => {
    if (idx >= candidates.length) {
      onFail?.();
      return;
    }

    const c = candidates[idx++];
    wrap.innerHTML = "";

    if (c.type === "video") {
      const v = document.createElement("video");
      v.src = c.url;
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.controls = false;

      v.onloadeddata = () => {
        wrap.appendChild(v);
        wrap.appendChild(label);
        signPanel.appendChild(wrap);
      };
      v.onerror = tryNext;
    } else {
      const img = document.createElement("img");
      img.src = c.url;
      img.alt = text;

      img.onload = () => {
        wrap.appendChild(img);
        wrap.appendChild(label);
        signPanel.appendChild(wrap);
      };
      img.onerror = tryNext;
    }
  };

  tryNext();
}

function scheduleSignRender(text) {
  if (!signPanel) return;
  const cleanText = (text || "").trim();
  if (!cleanText) return;

  if (cleanText === lastRenderedSpeech && signShowTimer) return;
  lastRenderedSpeech = cleanText;

  if (signShowTimer) clearTimeout(signShowTimer);
  if (signHideTimer) clearTimeout(signHideTimer);

  signPanel.innerHTML = "";

  signShowTimer = setTimeout(() => {
    renderSentenceMedia(cleanText, () => renderSignsFromText(cleanText));
    signHideTimer = setTimeout(() => {
      if (signPanel) signPanel.innerHTML = "";
      signHideTimer = null;
    }, SIGN_VISIBLE_MS);
    signShowTimer = null;
  }, SIGN_SHOW_DELAY_MS);
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
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isListening = true;
    micStatus.innerText = "Listening...";
    micBtn.innerText = "🛑 Stop Listening";
  };

  recognition.onend = () => {
    isListening = false;
    micStatus.innerText = "Mic Idle";
    micBtn.innerText = "🎤 Start Listening";
  };

  recognition.onerror = (e) => {
    micStatus.innerText = `Mic error: ${e.error}`;
  };

  recognition.onresult = (event) => {
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
    }

    finalText = finalText.trim();
    if (!finalText) return;

    if (speechTextEl) speechTextEl.innerText = finalText;
    scheduleSignRender(finalText);
    emitSpeechText(finalText);
  };

  micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (!isListening) recognition.start();
    else recognition.stop();
  });
}

async function start() {
  try {
    if (!realFriend) realFriend = localStorage.getItem("callTo");

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (myVideo) {
        myVideo.srcObject = localStream;
        myVideo.play?.().catch(() => {});
      }
    } catch (e) {
      console.warn("Local media unavailable:", e);
      showAlert("Camera/Mic not available on this tab");
    }

    createPeer();
    ensureLocalTracksAdded();
    startMLLoop();
    initSpeechRecognition();

    if (isCaller && realFriend) {
      socket.emit("call-user", { to: realFriend, from: myId });
    }
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
      if (myVideo) {
        myVideo.srcObject = localStream;
        myVideo.play?.().catch(() => {});
      }
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

function startMLLoop() {
  if (!myVideo) return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (mlInterval) clearInterval(mlInterval);

  mlInterval = setInterval(() => {
    if (!myVideo.srcObject || myVideo.readyState < 2) return;

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(myVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
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
      },
      "image/jpeg",
      0.7
    );
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
  if (remoteStream && userVideo && userVideo.srcObject !== remoteStream) {
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

  if (signShowTimer) clearTimeout(signShowTimer);
  if (signHideTimer) clearTimeout(signHideTimer);
  if (signPanel) signPanel.innerHTML = "";
  lastRenderedSpeech = "";

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