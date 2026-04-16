const Message = require("../models/Message");

let onlineUsers = {};
// { userId : [socketId, socketId] }

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New socket:", socket.id);

    socket.on("join", (userId) => {
      socket.userId = userId;

      if (!onlineUsers[userId]) onlineUsers[userId] = [];
      if (!onlineUsers[userId].includes(socket.id)) {
        onlineUsers[userId].push(socket.id);
      }

      io.emit("user-online", userId);
      socket.emit("online-users", Object.keys(onlineUsers));
    });

    socket.on("send_message", async ({ senderId, receiverId, message }) => {
      await Message.create({
        sender: senderId,
        receiver: receiverId,
        message,
      });

      if (onlineUsers[receiverId]) {
        onlineUsers[receiverId].forEach((sid) => {
          io.to(sid).emit("receive_message", { senderId, message });
        });
      }
    });

    socket.on("typing", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("typing", { from });
        });
      }
    });



    socket.on("call-user", ({ to, offer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-made", { offer, from });
        });
      }
    });

    socket.on("callee-ready", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("callee-ready", { from });
        });
      }
    });

    // new relay: receiver local camera ready -> notify caller
    socket.on("receiver-local-ready", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("receiver-local-ready", { from });
        });
      }
    });

    socket.on("ice-candidate", ({ to, candidate, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("ice-candidate", { candidate, from });
        });
      }
    });

    socket.on("webrtc-description", ({ to, from, description }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("webrtc-description", { from, description });
        });
      }
    });

    socket.on("call-declined", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-declined", { from });
        });
      }
    });

    socket.on("end-call", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-ended", { from });
        });
      }
    });

    socket.on("video-toggled", ({ to, from, enabled }) => {
  if (onlineUsers[to]) {
    onlineUsers[to].forEach((sid) => {
      io.to(sid).emit("remote-video-toggled", { from, enabled });
    });
  }
});

    socket.on("ml-text", ({ to, text }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("ml-text", { text });
        });
      }
    });

    socket.on("speech-text", ({ to, text, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("speech-text", { text, from });
        });
      }
    });

    socket.on("disconnect", () => {
      const userId = socket.userId;
      if (!userId || !onlineUsers[userId]) return;

      onlineUsers[userId] = onlineUsers[userId].filter((id) => id !== socket.id);

      if (onlineUsers[userId].length === 0) {
        delete onlineUsers[userId];
        io.emit("user-offline", userId);
      }

      console.log("LEFT:", userId);
    });
  });
};