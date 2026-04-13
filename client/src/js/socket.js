const socket = io(window.location.origin); // Dynamically sets current host (local or deployed)

// Listen for messages
socket.on("receive_message", (data) => {
  console.log("Message:", data);
});

// Send message function
function sendMessage(msg) {
  socket.emit("send_message", msg);
}