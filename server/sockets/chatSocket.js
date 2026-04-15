const Message = require("../models/Message");

let onlineUsers = {};
// { userId : [socketId, socketId] }

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New socket:", socket.id);

    //////////////////////////////////////////////////
    // JOIN
    //////////////////////////////////////////////////
    socket.on("join", (userId) => {
      socket.userId = userId;

      if (!onlineUsers[userId]) onlineUsers[userId] = [];
      if (!onlineUsers[userId].includes(socket.id)) {
        onlineUsers[userId].push(socket.id);
      }

      io.emit("user-online", userId);
      socket.emit("online-users", Object.keys(onlineUsers));
    });

    //////////////////////////////////////////////////
    // CHAT MESSAGE
    //////////////////////////////////////////////////
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

    //////////////////////////////////////////////////
    // TYPING
    //////////////////////////////////////////////////
    socket.on("typing", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("typing", { from });
        });
      }
    });

    //////////////////////////////////////////////////
    // CALL SIGNALING (BACKWARD + NEW COMPAT)
    //////////////////////////////////////////////////

    // old client -> server
    socket.on("call-user", ({ to, offer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          // old receiver event
          io.to(sid).emit("call-made", { offer, from });
          // new receiver event
          io.to(sid).emit("offer", { offer, from });
        });
      }
    });

    // new client -> server
    socket.on("offer", ({ to, offer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-made", { offer, from }); // old
          io.to(sid).emit("offer", { offer, from });     // new
        });
      }
    });

    // old answer path
    socket.on("make-answer", ({ to, answer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("answer-made", { answer, from }); // old
          io.to(sid).emit("answer", { answer, from });      // new
        });
      }
    });

    // new answer path
    socket.on("answer", ({ to, answer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("answer-made", { answer, from }); // old
          io.to(sid).emit("answer", { answer, from });      // new
        });
      }
    });

    // ice
    socket.on("ice-candidate", ({ to, candidate, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("ice-candidate", { candidate, from });
        });
      }
    });

    //////////////////////////////////////////////////
    // SAFE RENEGOTIATION SIGNALING
    //////////////////////////////////////////////////
    socket.on("renegotiate-offer", ({ to, offer, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("renegotiate-offer", { offer, from });
        });
      }
    });

    socket.on("renegotiate-answer", ({ to, answer }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("renegotiate-answer", { answer });
        });
      }
    });

    //////////////////////////////////////////////////
    // DECLINE / END
    //////////////////////////////////////////////////
    socket.on("call-declined", ({ to }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-declined");
        });
      }
    });

    // old end
    socket.on("end-call", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-ended", { from });
        });
      }
    });

    // new end
    socket.on("call-ended", ({ to, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("call-ended", { from });
        });
      }
    });

    //////////////////////////////////////////////////
    // ML TEXT RELAY
    //////////////////////////////////////////////////
    socket.on("ml-text", ({ to, text }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("ml-text", { text });
        });
      }
    });

    //////////////////////////////////////////////////
    // NEW: SPEECH TEXT RELAY
    //////////////////////////////////////////////////
    socket.on("speech-text", ({ to, text, from }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("speech-text", { text, from });
        });
      }
    });

    //////////////////////////////////////////////////
    // PERFECT NEGOTIATION SDP
    //////////////////////////////////////////////////
    socket.on("webrtc-description", ({ to, from, description }) => {
      if (onlineUsers[to]) {
        onlineUsers[to].forEach((sid) => {
          io.to(sid).emit("webrtc-description", { from, description });
        });
      }
    });

    //////////////////////////////////////////////////
    // DISCONNECT
    //////////////////////////////////////////////////
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