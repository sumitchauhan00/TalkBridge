const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const Message = require("./models/Message");
const messageRoutes = require("./routes/messageRoutes");

const app = express();

connectDB();   // 👈 ye missing hota hai usually

app.use(cors());
app.use(express.json());

const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);



app.get("/", (req, res) => {
  res.send("Server running");
});

let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId) => {
    onlineUsers[userId] = socket.id;
  });

  socket.on("send_message", async ({ senderId, receiverId, message }) => {
    const receiverSocket = onlineUsers[receiverId];

    await Message.create({
    sender: senderId,
    receiver: receiverId,
    message,
  });

    if (receiverSocket) {
      io.to(receiverSocket).emit("receive_message", {
        senderId,
        message,
      });
    }
  });

  socket.on("disconnect", () => {
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        delete onlineUsers[userId];
      }
    }
  });
});


const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

