const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  alert("Login first");
  window.location = "Login.html";
}

document.getElementById("username").innerText = user.username;
document.getElementById("userid").innerText = user._id;

const avatar = document.getElementById("avatar");

// load saved photo
const saved = localStorage.getItem("profilePic");
if (saved) avatar.src = saved;

function savePhoto() {
  const file = document.getElementById("photoInput").files[0];
  if (!file) return alert("Select image");

  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem("profilePic", reader.result);
    avatar.src = reader.result;
    alert("Saved");
  };
  reader.readAsDataURL(file);
}

function goChat() {
  window.location = "Chat.html";
}
