const socket = io("http://localhost:5000");

//////////////////////////////////////////////////
// LOGIN CHECK
//////////////////////////////////////////////////
const user = JSON.parse(localStorage.getItem("user"));
if (!user) {
  alert("Login first");
  window.location = "Login.html";
}

const myId = user._id;

//////////////////////////////////////////////////
// SHOW MY INFO
//////////////////////////////////////////////////
document.getElementById("myName").innerText = user.username;

const pic = localStorage.getItem("profilePic");
if (pic) document.getElementById("myPhoto").src = pic;
else document.getElementById("myPhoto").src = "https://via.placeholder.com/40";

//////////////////////////////////////////////////
// JOIN SOCKET
//////////////////////////////////////////////////
socket.emit("join", myId);

//////////////////////////////////////////////////
// ELEMENTS
//////////////////////////////////////////////////
const chatBox = document.getElementById("chat");
const contactBox = document.getElementById("contacts");
const chatTitle = document.getElementById("chatWith");
const searchResult = document.getElementById("searchResult");
const searchInput = document.getElementById("searchInput");

let friendId = null;

//////////////////////////////////////////////////
// LOAD CONTACTS
//////////////////////////////////////////////////
function loadContacts() {
  contactBox.innerHTML = "";

  fetch(`http://localhost:5000/api/contacts/${myId}`)
    .then(res => res.json())
    .then(data => {
      data.forEach(c => {
        const div = document.createElement("div");
        div.className = "contact";
        div.innerText = c.contact.username;

        div.onclick = () => {
          friendId = c.contact._id;
          chatTitle.innerText = c.contact.username;
          chatBox.innerHTML = "";

          fetch(`http://localhost:5000/api/messages/${myId}/${friendId}`)
            .then(res => res.json())
            .then(msgs => {
              msgs.forEach(m => {
                addMessage(m.sender === myId ? "me" : "other", m.message);
              });
            });
        };

        contactBox.appendChild(div);
      });
    });
}

loadContacts();

//////////////////////////////////////////////////
// LIVE SEARCH (TYPE TO FIND)
//////////////////////////////////////////////////
searchInput.addEventListener("input", () => {
  const text = searchInput.value.trim();
  searchResult.innerHTML = "";

  if (!text) return;

  fetch(`http://localhost:5000/api/auth/search/${text}`)
    .then(res => res.json())
    .then(users => {
      users.forEach(u => {
        if (u._id === myId) return;

        const div = document.createElement("div");
        div.className = "search-user";
        div.innerText = u.username + " ";

        const btn = document.createElement("button");
        btn.innerText = "Add";

        btn.onclick = () => {
          fetch("http://localhost:5000/api/contacts/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: myId,
              contactId: u._id
            })
          })
          .then(() => {
            alert("Added");
            loadContacts();
            searchInput.value = "";
            searchResult.innerHTML = "";
          });
        };

        div.appendChild(btn);
        searchResult.appendChild(div);
      });
    });
});

//////////////////////////////////////////////////
// REALTIME RECEIVE
//////////////////////////////////////////////////
socket.on("receive_message", (data) => {
  if (data.senderId === friendId) {
    addMessage("other", data.message);
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
// ADD MESSAGE TO UI
//////////////////////////////////////////////////
function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = type;
  div.innerText = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

//////////////////////////////////////////////////
// PROFILE PAGE
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
