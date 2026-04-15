const baseURL = window.location.origin;
const socket = io(baseURL);

//////////////////////////////////////////////////
// ELEMENTS
//////////////////////////////////////////////////
const typingBox = document.getElementById("typing");
const chatBox = document.getElementById("chat");
const contactBox = document.getElementById("contacts");
const chatTitle = document.getElementById("chatWith");
const searchResult = document.getElementById("searchResult");
const searchInput = document.getElementById("searchInput");
const msgSound = document.getElementById("msgSound");
const notificationBox = document.getElementById("notifications");

//////////////////////////////////////////////////
// LOGIN CHECK
//////////////////////////////////////////////////
let user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  alert("Login first");
  window.location = "Login.html";
  throw new Error("No user in localStorage");
}

const myId = user._id;

//////////////////////////////////////////////////
// GET LATEST PROFILE
//////////////////////////////////////////////////
fetch(`${baseURL}/api/auth/user/${myId}`)
  .then((res) => res.json())
  .then((fresh) => {
    user = fresh;
    localStorage.setItem("user", JSON.stringify(fresh));

    const myName = document.getElementById("myName");
    const myPhoto = document.getElementById("myPhoto");

    if (myName) myName.innerText = fresh.username || "User";
    if (myPhoto) myPhoto.src = fresh.photo || "https://via.placeholder.com/40";
  })
  .catch(() => {});

//////////////////////////////////////////////////
// JOIN
//////////////////////////////////////////////////
socket.emit("join", myId);

//////////////////////////////////////////////////
// DEFAULT SCREEN
//////////////////////////////////////////////////
const welcomeEl = document.getElementById("welcome");
const sendAreaEl = document.getElementById("sendArea");
if (welcomeEl) welcomeEl.style.display = "block";
if (sendAreaEl) sendAreaEl.style.display = "none";

//////////////////////////////////////////////////
let friendId = null;
let incomingCaller = null;
let onlineSet = new Set();
let unread = {};
let typingDiv = null;

//////////////////////////////////////////////////
// LOAD CONTACTS
//////////////////////////////////////////////////
function loadContacts() {
  contactBox.innerHTML = "";

  fetch(`${baseURL}/api/contacts/${myId}`)
    .then((res) => res.json())
    .then((data) => {
      if (!data.length) {
        contactBox.innerHTML = "<div>No contacts</div>";
        return;
      }

      data.forEach((c) => {
        const div = document.createElement("div");
        div.className = "contact";
        div.setAttribute("data-id", c.contact._id);

        const img = document.createElement("img");
        img.className = "contact-dp";
        img.src = c.contact.photo || "https://via.placeholder.com/40";

        // only DP click -> contact profile
        img.onclick = (e) => {
          e.stopPropagation();
          localStorage.setItem(
            "viewProfile",
            JSON.stringify({
              _id: c.contact._id,
              username: c.contact.username,
              photo: c.contact.photo,
            })
          );
          window.location = "ContactProfile.html";
        };

        const name = document.createElement("span");
        name.className = "contact-name";
        name.innerText = c.contact.username;

        const dot = document.createElement("span");
        dot.className = "dot";

        div.appendChild(img);
        div.appendChild(name);
        div.appendChild(dot);

        div.onclick = () => {
          friendId = c.contact._id;
          chatTitle.innerText = c.contact.username;
          chatBox.innerHTML = "";

          if (welcomeEl) welcomeEl.style.display = "none";
          if (sendAreaEl) sendAreaEl.style.display = "flex";

          document.querySelectorAll(".contact").forEach((x) => x.classList.remove("active"));
          div.classList.add("active");

          // unread reset
          unread[friendId] = 0;
          const badge = div.querySelector(".badge");
          if (badge) badge.remove();

          fetch(`${baseURL}/api/messages/${myId}/${friendId}`)
            .then((res) => res.json())
            .then((msgs) => {
              msgs.forEach((m) => addMessage(m.sender === myId ? "me" : "other", m.message));
            });
        };

        contactBox.appendChild(div);
      });

      refreshOnlineUI();
    })
    .catch(() => {
      contactBox.innerHTML = "<div>Error loading contacts</div>";
    });
}

loadContacts();

//////////////////////////////////////////////////
// ONLINE DOT
//////////////////////////////////////////////////
socket.on("online-users", (users) => {
  onlineSet = new Set(users);
  refreshOnlineUI();
});

socket.on("user-online", (id) => {
  onlineSet.add(id);
  refreshOnlineUI();
});

socket.on("user-offline", (id) => {
  onlineSet.delete(id);
  refreshOnlineUI();
});

function refreshOnlineUI() {
  document.querySelectorAll(".contact").forEach((div) => {
    const id = div.getAttribute("data-id");
    const dot = div.querySelector(".dot");
    if (!dot) return;
    dot.style.background = onlineSet.has(id) ? "limegreen" : "gray";
  });
}

//////////////////////////////////////////////////
// SEND TYPING
//////////////////////////////////////////////////
const msgEl = document.getElementById("msg");

if (msgEl) {
  msgEl.addEventListener("input", () => {
    if (!friendId) return;
    socket.emit("typing", { to: friendId, from: myId });
  });
}

//////////////////////////////////////////////////
// RECEIVE TYPING
//////////////////////////////////////////////////
socket.on("typing", ({ from }) => {
  if (from !== friendId) return;
  if (typingDiv) return;

  typingDiv = document.createElement("div");
  typingDiv.className = "typing-msg";
  typingDiv.innerHTML = `<span></span><span></span><span></span>`;

  chatBox.appendChild(typingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  setTimeout(() => {
    if (typingDiv) {
      typingDiv.remove();
      typingDiv = null;
    }
  }, 1500);
});

//////////////////////////////////////////////////
// RECEIVE MESSAGE
//////////////////////////////////////////////////
socket.on("receive_message", (data) => {
  if (typingDiv) {
    typingDiv.remove();
    typingDiv = null;
  }

  if (data.senderId === friendId) {
    addMessage("other", data.message);
    return;
  }

  unread[data.senderId] = (unread[data.senderId] || 0) + 1;
  const contact = document.querySelector(`[data-id='${data.senderId}']`);

  if (contact) {
    let badge = contact.querySelector(".badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      contact.appendChild(badge);
    }
    badge.innerText = unread[data.senderId];
  }

  if (msgSound) {
    msgSound.pause();
    msgSound.currentTime = 0;
    msgSound.play().catch(() => {});
  }
});

//////////////////////////////////////////////////
// SEND MESSAGE
//////////////////////////////////////////////////
function send() {
  const text = (msgEl?.value || "").trim();
  if (!friendId) return alert("Select contact");
  if (!text) return;

  socket.emit("send_message", {
    senderId: myId,
    receiverId: friendId,
    message: text,
  });

  addMessage("me", text);
  if (msgEl) msgEl.value = "";
}

//////////////////////////////////////////////////
// ENTER SEND
//////////////////////////////////////////////////
if (msgEl) {
  msgEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
}

//////////////////////////////////////////////////
// ADD MESSAGE
//////////////////////////////////////////////////
function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = type;
  div.innerText = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

//////////////////////////////////////////////////
// PROFILE / LOGOUT
//////////////////////////////////////////////////
function goProfile() {
  window.location = "Profile.html";
}

function logout() {
  localStorage.removeItem("user");
  window.location = "Login.html";
}

//////////////////////////////////////////////////
// CALL (FIXED)
//////////////////////////////////////////////////
function startCall() {
  // FIX: currentContact was undefined, use friendId
  if (!friendId) {
    alert("Select a contact first");
    return;
  }

  localStorage.setItem("callTo", friendId);
  localStorage.setItem("isCaller", "true");
  localStorage.setItem("preCallPage", "Chat.html");
  window.location = "video.html"; // keep exact existing filename
}

socket.on("call-made", ({ from }) => {
  incomingCaller = from;
  const callModal = document.getElementById("callModal");
  if (callModal) callModal.style.display = "flex";
});

socket.on("call-declined", () => {
  alert("User rejected the call");
  const callModal = document.getElementById("callModal");
  if (callModal) callModal.style.display = "none";
});

//////////////////////////////////////////////////
// ALERT
//////////////////////////////////////////////////
function closeAlert() {
  const alertModal = document.getElementById("alertModal");
  if (alertModal) alertModal.style.display = "none";
}

//////////////////////////////////////////////////
// ACCEPT / DECLINE
//////////////////////////////////////////////////
function acceptCall() {
  if (!incomingCaller) return;
  localStorage.setItem("callTo", incomingCaller);
  localStorage.setItem("isCaller", "false");
  localStorage.setItem("preCallPage", "Chat.html");
  window.location = "video.html";
}

function declineCall() {
  if (!incomingCaller) return;
  socket.emit("call-declined", { to: incomingCaller });
  const callModal = document.getElementById("callModal");
  if (callModal) callModal.style.display = "none";
  incomingCaller = null;
}

//////////////////////////////////////////////////
// SEARCH FROM DATABASE
//////////////////////////////////////////////////
if (searchInput) {
  searchInput.addEventListener("input", () => {
    const text = searchInput.value.trim();
    searchResult.innerHTML = "";

    if (!text) return;

    fetch(`${baseURL}/api/auth/search/${text}`)
      .then((res) => res.json())
      .then((users) => {
        if (!users.length) {
          searchResult.innerHTML = "<div>No user found</div>";
          return;
        }

        users.forEach((u) => {
          if (u._id === myId) return;

          const div = document.createElement("div");
          div.className = "search-user";

          div.innerHTML = `
            <img class="contact-dp" src="${u.photo || "https://via.placeholder.com/40"}">
            <span>${u.username}</span>
          `;

          const btn = document.createElement("button");
          btn.innerText = "Add";

          btn.onclick = () => {
            fetch(`${baseURL}/api/requests/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                from: myId,
                to: u._id,
              }),
            }).then(() => {
              alert("Request sent");
              searchInput.value = "";
              searchResult.innerHTML = "";
            });
          };

          div.appendChild(btn);
          searchResult.appendChild(div);
        });
      })
      .catch(() => {
        searchResult.innerHTML = "<div>Search error</div>";
      });
  });
}

//////////////////////////////////////////////////
// FRIEND REQUEST SYSTEM
//////////////////////////////////////////////////
function loadFriendRequests() {
  if (!notificationBox) return;

  notificationBox.innerHTML = "";

  fetch(`${baseURL}/api/requests/${myId}`)
    .then((res) => res.json())
    .then((requests) => {
      if (!requests.length) {
        notificationBox.innerHTML = "<div>No requests</div>";
        return;
      }

      requests.forEach((r) => {
        const div = document.createElement("div");
        div.className = "request-item";

        div.innerHTML = `
          <img class="contact-dp" src="${r.from.photo || "https://via.placeholder.com/40"}">
          <span>${r.from.username}</span>
        `;

        const acceptBtn = document.createElement("button");
        acceptBtn.innerText = "Accept";
        acceptBtn.onclick = () => {
          fetch(`${baseURL}/api/requests/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id }),
          })
            .then((res) => res.json())
            .then(() => {
              loadFriendRequests();
              loadContacts();
            });
        };

        const rejectBtn = document.createElement("button");
        rejectBtn.innerText = "Reject";
        rejectBtn.onclick = () => {
          fetch(`${baseURL}/api/requests/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id }),
          }).then(() => {
            loadFriendRequests();
          });
        };

        div.appendChild(acceptBtn);
        div.appendChild(rejectBtn);
        notificationBox.appendChild(div);
      });
    })
    .catch(() => {
      notificationBox.innerHTML = "<div>Error loading requests</div>";
    });
}

loadFriendRequests();

//////////////////////////////////////////////////
// expose functions for HTML onclick
//////////////////////////////////////////////////
window.send = send;
window.goProfile = goProfile;
window.logout = logout;
window.startCall = startCall;
window.acceptCall = acceptCall;
window.declineCall = declineCall;
window.closeAlert = closeAlert;