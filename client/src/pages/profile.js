const user = JSON.parse(localStorage.getItem("user"));

if (!user || !user._id) {
  alert("Login first");
  window.location = "Login.html";
}

const avatarEl = document.getElementById("avatar");
const usernameEl = document.getElementById("username");
const userIdEl = document.getElementById("userid");
const photoInput = document.getElementById("photoInput");

// optional (if you later uncomment span id="fileName")
const fileNameEl = document.getElementById("fileName");

function defaultAvatar(name) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    name || "U"
  )}`;
}

function renderProfile(u) {
  if (usernameEl) usernameEl.innerText = u.username || "";
  if (userIdEl) userIdEl.innerText = u._id || "";
  if (avatarEl) {
    avatarEl.src =
      u.photo && u.photo.length > 8 ? u.photo : defaultAvatar(u.username);
  }
}

renderProfile(user);

// show chosen file name (optional)
if (photoInput) {
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (fileNameEl) fileNameEl.innerText = file ? file.name : "";
  });
}

async function savePhoto() {
  try {
    const file = photoInput?.files?.[0];
    if (!file) return alert("Please choose a photo first");

    const fd = new FormData();
    fd.append("photo", file); // IMPORTANT: key must be "photo"

    const res = await fetch(`http://localhost:5000/api/auth/photo/${user._id}`, {
      method: "POST",
      body: fd, // DO NOT set Content-Type manually
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Photo update failed");
      return;
    }

    // update localStorage user
    const updatedUser = {
      ...user,
      ...data.user,
    };
    localStorage.setItem("user", JSON.stringify(updatedUser));

    // notify other pages (chat page listens this)
    localStorage.setItem("profile_updated_at", String(Date.now()));

    // re-render instantly
    renderProfile(updatedUser);

    alert("Photo updated successfully");
  } catch (err) {
    console.log("savePhoto error:", err);
    alert("Server error while uploading photo");
  }
}

function goChat() {
  window.location = "Chat.html";
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("chatWith");
  localStorage.removeItem("viewProfile");
  localStorage.removeItem("callTo");
  localStorage.removeItem("isCaller");
  window.location = "Login.html";
}

window.savePhoto = savePhoto;
window.goChat = goChat;
window.logout = logout;