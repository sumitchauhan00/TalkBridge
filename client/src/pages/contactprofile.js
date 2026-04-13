const user = JSON.parse(localStorage.getItem("user"));
const contact = JSON.parse(localStorage.getItem("viewProfile"));

if (!user || !user._id || !contact || !contact._id) {
  window.location = "Chat.html";
}

const avatarEl = document.getElementById("avatar");
const usernameEl = document.getElementById("username");

if (avatarEl) {
  avatarEl.src =
    contact.photo && contact.photo.length > 8
      ? contact.photo
      : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          contact.username || "U"
        )}`;
}

if (usernameEl) {
  usernameEl.innerText = contact.username || "Unknown";
}

// ==== DYNAMIC BASE URL ====
const baseURL = window.location.origin;

//////////////////////////////////////////////////
// DELETE CONTACT
//////////////////////////////////////////////////
async function deleteContact() {
  const confirmDelete = confirm(`Delete ${contact.username || "this contact"}?`);
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${baseURL}/api/contacts/remove`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user._id,
        contactId: contact._id,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Failed to remove contact");
      return;
    }

    alert("Contact removed");

    // cleanup local states
    localStorage.removeItem("viewProfile");
    if (localStorage.getItem("chatWith") === contact._id) {
      localStorage.removeItem("chatWith");
    }

    // trigger live update hint for other tabs/pages
    localStorage.setItem("contacts_updated_at", String(Date.now()));

    window.location = "Chat.html";
  } catch (err) {
    console.log("deleteContact error:", err);
    alert("Server error. Try again.");
  }
}

function goBack() {
  window.location = "Chat.html";
}

// expose to HTML onclick
window.deleteContact = deleteContact;
window.goBack = goBack;