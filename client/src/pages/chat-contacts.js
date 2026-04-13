(function () {
  function ensureState() {
    if (!window.ChatState) {
      console.error("ChatState missing. Ensure chat-core.js loads first.");
      return false;
    }
    return true;
  }
  if (!ensureState()) return;

  // Dynamic API base URL
  const baseURL = window.location.origin;

  const { myId, socket, els } = window.ChatState;
  const { contactBox, chatTitle, chatBox, welcomeBox, sendArea } = els;

  // robust button reference: from state OR direct DOM fallback
  const videoCallBtn = els.videoCallBtn || document.getElementById("videoCallBtn");
  console.log("videoCallBtn in contacts:", videoCallBtn);

  function refreshOnlineUI() {
    const { onlineSet } = window.ChatState;
    document.querySelectorAll(".contact").forEach((div) => {
      const id = div.getAttribute("data-id");
      const dot = div.querySelector(".dot");
      if (!dot) return;
      dot.style.background = onlineSet.has(id) ? "limegreen" : "gray";
    });
  }
  window.refreshOnlineUI = refreshOnlineUI;

  socket.on("online-users", (users) => {
    const set = window.ChatState.onlineSet;
    set.clear();
    users.forEach((u) => set.add(u));
    refreshOnlineUI();
  });

  socket.on("user-online", (id) => {
    window.ChatState.onlineSet.add(id);
    refreshOnlineUI();
  });

  socket.on("user-offline", (id) => {
    window.ChatState.onlineSet.delete(id);
    refreshOnlineUI();
  });

  async function loadContacts() {
    contactBox.innerHTML = "Loading...";
    try {
      const res = await fetch(`${baseURL}/api/contacts/${myId}`);
      const txt = await res.text();

      let data = [];
      try {
        data = txt ? JSON.parse(txt) : [];
      } catch {}

      if (!res.ok) throw new Error(`HTTP ${res.status} ${txt}`);

      const contacts = Array.isArray(data) ? data : data.contacts || [];
      contactBox.innerHTML = "";

      if (!contacts.length) {
        contactBox.innerHTML = "<div>No contacts</div>";
        if (videoCallBtn) {
          videoCallBtn.style.display = "none";
          videoCallBtn.classList.add("hidden");
        }
        return;
      }

      contacts.forEach((c) => {
        const person = c.contact || c;
        if (!person?._id) return;

        const div = document.createElement("div");
        div.className = "contact";
        div.setAttribute("data-id", person._id);

        const img = document.createElement("img");
        img.className = "contact-dp";
        img.src = person.photo || "https://via.placeholder.com/40";
        img.onclick = (e) => {
          e.stopPropagation();
          localStorage.setItem(
            "viewProfile",
            JSON.stringify({
              _id: person._id,
              username: person.username,
              photo: person.photo,
            })
          );
          window.location = "ContactProfile.html";
        };

        const name = document.createElement("span");
        name.className = "contact-name";
        name.innerText = person.username || "Unknown";

        const dot = document.createElement("span");
        dot.className = "dot";

        div.appendChild(img);
        div.appendChild(name);
        div.appendChild(dot);

        div.onclick = () => openChat(person, div);

        contactBox.appendChild(div);
      });

      refreshOnlineUI();
    } catch (e) {
      console.error("loadContacts error:", e);
      contactBox.innerHTML = "<div>Error loading contacts</div>";
    }
  }

  async function openChat(person, div) {
    const state = window.ChatState;
    state.friendId = person._id;

    // show video call button only after selecting contact
    if (videoCallBtn) {
      videoCallBtn.classList.remove("hidden");
      videoCallBtn.style.display = "inline-flex";
      videoCallBtn.style.visibility = "visible";
      videoCallBtn.style.opacity = "1";
    }

    chatTitle.innerText = person.username || "Unknown";
    chatBox.innerHTML = "";

    if (welcomeBox) welcomeBox.style.display = "none";
    if (sendArea) sendArea.style.display = "flex";

    document.querySelectorAll(".contact").forEach((x) => x.classList.remove("active"));
    div.classList.add("active");

    state.unread[person._id] = 0;
    const badge = div.querySelector(".badge");
    if (badge) badge.remove();

    try {
      const res = await fetch(`${baseURL}/api/messages/${state.myId}/${person._id}`);
      const msgs = await res.json();
      msgs.forEach((m) => {
        window.addMessage(m.sender === state.myId ? "me" : "other", m.message);
      });
    } catch (e) {
      console.error("load messages error:", e);
    }
  }

  window.loadContacts = loadContacts;
  loadContacts();
})();