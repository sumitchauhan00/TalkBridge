(function () {
  if (!window.ChatState) {
    console.error("ChatState missing. Ensure chat-core.js loads first.");
    return;
  }

  const { socket, els } = window.ChatState;
  const { callModal, alertModal } = els;

  function startCall() {
    const friendId = window.ChatState.friendId;
    if (!friendId) return alert("Select a contact first");

    localStorage.setItem("callTo", friendId);
    localStorage.setItem("isCaller", "true");
    window.location = "Video.html";
  }

  socket.on("call-made", ({ from }) => {
    window.ChatState.incomingCaller = from;
    if (callModal) callModal.style.display = "flex";
  });

  socket.on("call-declined", () => {
    alert("User rejected the call");
  });

  function acceptCall() {
    localStorage.setItem("callTo", window.ChatState.incomingCaller);
    localStorage.setItem("isCaller", "false");
    window.location = "Video.html";
  }

  function declineCall() {
    socket.emit("call-declined", { to: window.ChatState.incomingCaller });
    if (callModal) callModal.style.display = "none";
  }

  function closeAlert() {
    if (alertModal) alertModal.style.display = "none";
  }

  window.startCall = startCall;
  window.acceptCall = acceptCall;
  window.declineCall = declineCall;
  window.closeAlert = closeAlert;
})();