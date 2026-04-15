(function () {
  // ---- Add this one line for dynamic origin ----
  const baseURL = window.location.origin;
  const socket = io(baseURL); // changed here

  const els = {
    typingBox: document.getElementById("typing"),
    chatBox: document.getElementById("chat"),
    contactBox: document.getElementById("contacts"),
    chatTitle: document.getElementById("chatWith"),
    searchResult: document.getElementById("searchResult"),
    searchInput: document.getElementById("searchInput"),
    msgSound: document.getElementById("msgSound"),
    notificationBox: document.getElementById("notifications"),
    msgInput: document.getElementById("msg"),
    welcomeBox: document.getElementById("welcome"),
    sendArea: document.getElementById("sendArea"),
    callModal: document.getElementById("callModal"),
    alertModal: document.getElementById("alertModal"),
    videoCallBtn: document.getElementById("videoCallBtn"),
  };

  // add this near top after element selections
  const headerEl = document.querySelector(".chat-area .header");

  // ensure button exists (create if missing)
  let videoCallBtn = document.getElementById("videoCallBtn");
  if (!videoCallBtn && headerEl) {
    videoCallBtn = document.createElement("button");
    videoCallBtn.id = "videoCallBtn";
    videoCallBtn.className = "video-call-btn";
    videoCallBtn.title = "Start Video Call";
    videoCallBtn.setAttribute("aria-label", "Start Video Call");
    videoCallBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 10.5V6a2 2 0 0 0-2-2H5A2 2 0 0 0 3 6v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4.5l6 4V6.5l-6 4z"></path>
      </svg>
    `;
    // theme toggle se just pehle insert
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) headerEl.insertBefore(videoCallBtn, themeBtn);
    else headerEl.appendChild(videoCallBtn);
  }

  // always hidden initially
  if (videoCallBtn) {
    videoCallBtn.style.display = "none";
    videoCallBtn.onclick = () => window.startCall && window.startCall();
  }

  let user = JSON.parse(localStorage.getItem("user"));
  if (!user || !user._id) {
    alert("Login first");
    window.location = "Login.html";
    return;
  }

  const myId = user._id;

  // shared global state for split files
  window.ChatState = {
    socket,
    myId,
    user,
    friendId: null,
    incomingCaller: null,
    onlineSet: new Set(),
    unread: {},
    typingDiv: null,
    els,
  };

  socket.emit("join", myId);

  if (els.welcomeBox) els.welcomeBox.style.display = "block";
  if (els.sendArea) els.sendArea.style.display = "none";
  if (els.videoCallBtn) els.videoCallBtn.style.display = "none";

  // refresh self profile
  fetch(`${baseURL}/api/auth/user/${myId}`) // changed here
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((fresh) => {
      window.ChatState.user = fresh;
      localStorage.setItem("user", JSON.stringify(fresh));

      const myName = document.getElementById("myName");
      const myPhoto = document.getElementById("myPhoto");
      if (myName) myName.innerText = fresh.username || "User";
      if (myPhoto) myPhoto.src = fresh.photo || "https://via.placeholder.com/40";
    })
    .catch((e) => console.error("profile fetch error:", e));

  function addMessage(type, text) {
    const div = document.createElement("div");
    div.className = type;
    div.innerText = text;
    els.chatBox.appendChild(div);
    els.chatBox.scrollTop = els.chatBox.scrollHeight;
  }
  window.addMessage = addMessage;

  function send() {
    const text = (els.msgInput?.value || "").trim();
    const friendId = window.ChatState.friendId;
    if (!friendId) return alert("Select contact");
    if (!text) return;

    socket.emit("send_message", {
      senderId: myId,
      receiverId: friendId,
      message: text,
    });

    addMessage("me", text);
    els.msgInput.value = "";
  }
  window.send = send;

  // typing emit
  if (els.msgInput) {
    els.msgInput.addEventListener("input", () => {
      const fid = window.ChatState.friendId;
      if (!fid) return;
      socket.emit("typing", { to: fid, from: myId });
    });

    els.msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  // typing receive
  socket.on("typing", ({ from }) => {
    const state = window.ChatState;
    if (from !== state.friendId) return;
    if (state.typingDiv) return;

    const t = document.createElement("div");
    t.className = "typing-msg";
    t.innerHTML = `<span></span><span></span><span></span>`;
    els.chatBox.appendChild(t);
    els.chatBox.scrollTop = els.chatBox.scrollHeight;
    state.typingDiv = t;

    setTimeout(() => {
      if (state.typingDiv) {
        state.typingDiv.remove();
        state.typingDiv = null;
      }
    }, 1500);
  });

  // message receive
  socket.on("receive_message", (data) => {
    const state = window.ChatState;

    if (state.typingDiv) {
      state.typingDiv.remove();
      state.typingDiv = null;
    }

    if (data.senderId === state.friendId) {
      addMessage("other", data.message);
      return;
    }

    state.unread[data.senderId] = (state.unread[data.senderId] || 0) + 1;
    const contact = document.querySelector(`[data-id='${data.senderId}']`);

    if (contact) {
      let badge = contact.querySelector(".badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "badge";
        contact.appendChild(badge);
      }
      badge.innerText = state.unread[data.senderId];
    }

    if (els.msgSound) {
      els.msgSound.pause();
      els.msgSound.currentTime = 0;
      els.msgSound.play().catch(() => {});
    }
  });

  window.goProfile = () => (window.location = "Profile.html");
  window.logout = () => {
    localStorage.removeItem("user");
    window.location = "Login.html";
  };
})();