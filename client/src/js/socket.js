const socket = io("http://localhost:5000");

socket.on("receive_message", (data) => {
  console.log("Message:", data);
});

function sendMessage(msg) {
  socket.emit("send_message", msg);
}
