
const socket = io("http://localhost:5000");

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
}

const myId = user._id;

//////////////////////////////////////////////////
// GET LATEST PROFILE
//////////////////////////////////////////////////
fetch(`http://localhost:5000/api/auth/user/${myId}`)
  .then(res => res.json())
  .then(fresh => {
    user = fresh;
    localStorage.setItem("user", JSON.stringify(fresh));

    document.getElementById("myName").innerText = fresh.username;
    document.getElementById("myPhoto").src =
      fresh.photo || "https://via.placeholder.com/40";
  });

//////////////////////////////////////////////////
// JOIN
//////////////////////////////////////////////////
socket.emit("join", myId);

//////////////////////////////////////////////////
// DEFAULT SCREEN
//////////////////////////////////////////////////
document.getElementById("welcome").style.display = "block";
document.getElementById("sendArea").style.display = "none";

//////////////////////////////////////////////////
let friendId = null;
let incomingCaller = null;
let onlineSet = new Set();
let unread = {};
let typingDiv = null;

//////////////////////////////////////////////////
// LOAD CONTACTS (FULL UPDATED)
//////////////////////////////////////////////////
function loadContacts() {
  contactBox.innerHTML = "";

  fetch(`http://localhost:5000/api/contacts/${myId}`)
    .then(res => res.json())
    .then(data => {

      if (!data.length) {
        contactBox.innerHTML = "<div>No contacts</div>";
        return;
      }

      data.forEach(c => {

        //////////////////////////////////////////////////
        // MAIN CONTACT DIV
        //////////////////////////////////////////////////
        const div = document.createElement("div");
        div.className = "contact";
        div.setAttribute("data-id", c.contact._id);

        //////////////////////////////////////////////////
        // PROFILE PHOTO
        //////////////////////////////////////////////////
        const img = document.createElement("img");
        img.className = "contact-dp";
        img.src = c.contact.photo || "https://via.placeholder.com/40";

        // ⭐ ONLY DP CLICK → OPEN PROFILE PAGE
        img.onclick = (e) => {
          e.stopPropagation();

          localStorage.setItem("viewProfile", JSON.stringify({
            _id: c.contact._id,
            username: c.contact.username,
            photo: c.contact.photo
          }));

          window.location = "ContactProfile.html";
        };

        //////////////////////////////////////////////////
        // USERNAME
        //////////////////////////////////////////////////
        const name = document.createElement("span");
        name.className = "contact-name";
        name.innerText = c.contact.username;

        //////////////////////////////////////////////////
        // ONLINE DOT
        //////////////////////////////////////////////////
        const dot = document.createElement("span");
        dot.className = "dot";

        //////////////////////////////////////////////////
        // APPEND ELEMENTS
        //////////////////////////////////////////////////
        div.appendChild(img);
        div.appendChild(name);
        div.appendChild(dot);

        //////////////////////////////////////////////////
        // CLICK CONTACT → OPEN CHAT
        //////////////////////////////////////////////////
        div.onclick = () => {

          friendId = c.contact._id;
          chatTitle.innerText = c.contact.username;
          chatBox.innerHTML = "";

          document.getElementById("welcome").style.display = "none";
          document.getElementById("sendArea").style.display = "flex";

          // active highlight
          document.querySelectorAll(".contact")
            .forEach(c => c.classList.remove("active"));

          div.classList.add("active");

          // unread reset
          unread[friendId] = 0;
          const badge = div.querySelector(".badge");
          if (badge) badge.remove();

          //////////////////////////////////////////////////
          // LOAD OLD MESSAGES
          //////////////////////////////////////////////////
          fetch(`http://localhost:5000/api/messages/${myId}/${friendId}`)
            .then(res => res.json())
            .then(msgs => {
              msgs.forEach(m => {
                addMessage(
                  m.sender === myId ? "me" : "other",
                  m.message
                );
              });
            });
        };

        contactBox.appendChild(div);

      });

      //////////////////////////////////////////////////
      // REFRESH ONLINE STATUS AFTER LOAD
      //////////////////////////////////////////////////
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
socket.on("online-users", users => {
  onlineSet = new Set(users);
  refreshOnlineUI();
});

socket.on("user-online", id => {
  onlineSet.add(id);
  refreshOnlineUI();
});

socket.on("user-offline", id => {
  onlineSet.delete(id);
  refreshOnlineUI();
});

function refreshOnlineUI() {
  document.querySelectorAll(".contact").forEach(div => {
    const id = div.getAttribute("data-id");
    const dot = div.querySelector(".dot");
    if (!dot) return;
    dot.style.background = onlineSet.has(id) ? "limegreen" : "gray";
  });
}

//////////////////////////////////////////////////
// SEND TYPING
//////////////////////////////////////////////////
document.getElementById("msg").addEventListener("input", () => {
  if (!friendId) return;
  socket.emit("typing", { to: friendId, from: myId });
});

//////////////////////////////////////////////////
// RECEIVE TYPING (DOTS)
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
// RECEIVE MESSAGE (INSTANT SOUND VERSION)
//////////////////////////////////////////////////
socket.on("receive_message", (data) => {

  // ⭐ Typing bubble remove (agar use kar rahe ho)
  if (typingDiv) {
    typingDiv.remove();
    typingDiv = null;
  }

  //////////////////////////////////////////////////
  // ⭐ SAME CHAT OPEN → NO SOUND
  //////////////////////////////////////////////////
  if (data.senderId === friendId) {
    addMessage("other", data.message);
    return;
  }

  //////////////////////////////////////////////////
  // ⭐ DIFFERENT CHAT → SOUND PLAY
  //////////////////////////////////////////////////
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

  //////////////////////////////////////////////////
  // ⭐ INSTANT SOUND (NO DELAY)
  //////////////////////////////////////////////////
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
  const text = document.getElementById("msg").value;
  if (!friendId) return alert("Select contact");
  if (!text) return;

  socket.emit("send_message", {
    senderId: myId,
    receiverId: friendId,
    message: text,
  });

  addMessage("me", text);
  document.getElementById("msg").value = "";
}

//////////////////////////////////////////////////
// ENTER SEND
//////////////////////////////////////////////////
document.getElementById("msg").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

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
// PROFILE
//////////////////////////////////////////////////
function goProfile() {
  window.location = "Profile.html";
}

//////////////////////////////////////////////////
// LOGOUT
//////////////////////////////////////////////////
function logout() {
  localStorage.removeItem("user");
  window.location = "Login.html";
}

//////////////////////////////////////////////////
// CALL
//////////////////////////////////////////////////
function startCall() {
    if (!currentContact) {
        showAlert("Select a contact first");
        return;
    }
    localStorage.setItem("callTo", currentContact._id);
    localStorage.setItem("isCaller", "true");
    window.location = "role_select.html"; // ← changed from video.html
}

socket.on("call-made", ({ from }) => {
  incomingCaller = from;
  document.getElementById("callModal").style.display = "flex";
});

socket.on("call-declined", () => {
  alert("User rejected the call");
});

//////////////////////////////////////////////////
// ALERT
//////////////////////////////////////////////////
function closeAlert() {
  document.getElementById("alertModal").style.display = "none";
}

//////////////////////////////////////////////////
// ACCEPT / DECLINE
//////////////////////////////////////////////////
function acceptCall() {
  localStorage.setItem("callTo", incomingCaller);
  localStorage.setItem("isCaller", "false");
  window.location = "Video.html";
}

function declineCall() {
  socket.emit("call-declined", { to: incomingCaller });
  document.getElementById("callModal").style.display = "none";
}

//////////////////////////////////////////////////
//////////////////////////////////////////////////
// ⭐⭐⭐⭐⭐ SEARCH FROM DATABASE ⭐⭐⭐⭐⭐
//////////////////////////////////////////////////
//////////////////////////////////////////////////
searchInput.addEventListener("input", () => {
  const text = searchInput.value.trim();
  searchResult.innerHTML = "";

  if (!text) return;

  fetch(`http://localhost:5000/api/auth/search/${text}`)
    .then(res => res.json())
    .then(users => {

      if (!users.length) {
        searchResult.innerHTML = "<div>No user found</div>";
        return;
      }

      users.forEach(u => {
        if (u._id === myId) return;

        const div = document.createElement("div");
        div.className = "search-user";

        div.innerHTML = `
          <img class="contact-dp"
            src="${u.photo || 'https://via.placeholder.com/40'}">
          <span>${u.username}</span>
        `;

        const btn = document.createElement("button");
        btn.innerText = "Add";

        btn.onclick = () => {
  fetch("http://localhost:5000/api/requests/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: myId,
      to: u._id
    })
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

//////////////////////////////////////////////////
//////////////////////////////////////////////////
// ⭐⭐⭐⭐⭐ FRIEND REQUEST SYSTEM ⭐⭐⭐⭐⭐
//////////////////////////////////////////////////
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// LOAD FRIEND REQUESTS
//////////////////////////////////////////////////
function loadFriendRequests() {

  if (!notificationBox) return;

  notificationBox.innerHTML = "";

  fetch(`http://localhost:5000/api/requests/${myId}`)
    .then(res => res.json())
    .then(requests => {

      if (!requests.length) {
        notificationBox.innerHTML = "<div>No requests</div>";
        return;
      }

      requests.forEach(r => {

        const div = document.createElement("div");
        div.className = "request-item";

        div.innerHTML = `
          <img class="contact-dp"
            src="${r.from.photo || 'https://via.placeholder.com/40'}">
          <span>${r.from.username}</span>
        `;

        //////////////////////////////////////////////////
        // ACCEPT BUTTON
        //////////////////////////////////////////////////
        const acceptBtn = document.createElement("button");
        acceptBtn.innerText = "Accept";

        acceptBtn.onclick = () => {
          fetch("http://localhost:5000/api/requests/accept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id })
          })
          .then(res => res.json())
          .then(() => {
            loadFriendRequests();
            loadContacts();
          });
        };

        //////////////////////////////////////////////////
        // REJECT BUTTON
        //////////////////////////////////////////////////
        const rejectBtn = document.createElement("button");
        rejectBtn.innerText = "Reject";

        rejectBtn.onclick = () => {
          fetch("http://localhost:5000/api/requests/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id })
          })
          .then(() => {
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

//////////////////////////////////////////////////
// CALL ON LOAD
//////////////////////////////////////////////////
loadFriendRequests();