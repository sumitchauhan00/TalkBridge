(function () {
  if (!window.ChatState) {
    console.error("ChatState missing. Ensure chat-core.js loads first.");
    return;
  }

  // Add baseURL for dynamic API calls
  const baseURL = window.location.origin;

  const { myId, els } = window.ChatState;
  const { searchInput, searchResult, notificationBox } = els;

  async function handleSearch() {
    const text = searchInput.value.trim();
    searchResult.innerHTML = "";
    if (!text) return;

    try {
      const res = await fetch(`${baseURL}/api/auth/search/${text}`);
      const users = await res.json();

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
        btn.onclick = async () => {
          try {
            const res = await fetch(`${baseURL}/api/requests/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ from: myId, to: u._id }),
            });

            const data = await res.json();
            if (!res.ok) return alert(data.message || "Request failed");

            alert(data.message || "Request sent");
            searchInput.value = "";
            searchResult.innerHTML = "";
            loadFriendRequests();
          } catch (e) {
            console.error("send request error:", e);
            alert("Server error");
          }
        };

        div.appendChild(btn);
        searchResult.appendChild(div);
      });
    } catch {
      searchResult.innerHTML = "<div>Search error</div>";
    }
  }

  async function loadFriendRequests() {
    if (!notificationBox) return;
    notificationBox.innerHTML = "";

    try {
      const res = await fetch(`${baseURL}/api/requests/${myId}`);
      const requests = await res.json();

      if (!requests.length) {
        notificationBox.innerHTML = "<div>No requests</div>";
        return;
      }

      requests.forEach((r) => {
        const div = document.createElement("div");
        div.className = "request-item";
        div.innerHTML = `
          <img class="contact-dp" src="${r.from?.photo || "https://via.placeholder.com/40"}">
          <span>${r.from?.username || "Unknown"}</span>
        `;

        const acceptBtn = document.createElement("button");
        acceptBtn.innerText = "Accept";
        acceptBtn.onclick = async () => {
          await fetch(`${baseURL}/api/requests/accept`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id }),
          });
          await loadFriendRequests();
          await window.loadContacts?.();
        };

        const rejectBtn = document.createElement("button");
        rejectBtn.innerText = "Reject";
        rejectBtn.onclick = async () => {
          await fetch(`${baseURL}/api/requests/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: r._id }),
          });
          await loadFriendRequests();
        };

        div.appendChild(acceptBtn);
        div.appendChild(rejectBtn);
        notificationBox.appendChild(div);
      });
    } catch {
      notificationBox.innerHTML = "<div>Error loading requests</div>";
    }
  }

  if (searchInput) searchInput.addEventListener("input", handleSearch);

  window.loadFriendRequests = loadFriendRequests;
  loadFriendRequests();
})();