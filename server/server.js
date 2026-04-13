const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");

const mlRoutes = require("./routes/mlRoutes");
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const messageRoutes = require("./routes/messageRoutes");
const requestRoutes = require("./routes/requestroute");

const app = express();

// DATABASE
connectDB();

// MIDDLEWARE
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// STATIC FOLDERS FOR SIGNS & UPLOADS (existing)
app.use("/signs", express.static(path.join(__dirname, "public", "signs")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// *** NEW: Serve static front-end pages ***
app.use(express.static(path.join(__dirname, "../pages")));

// *** On root, send default front-end page, e.g., Login.html ***
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/Login.html")); // Change if default page is different
});

// API ROUTES (as is)
app.use("/api/ml", mlRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/requests", requestRoutes);

// HTTP + SOCKET
const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// LOAD SOCKET HANDLERS
const chatSocket = require("./sockets/chatSocket");
chatSocket(io);

// Use environment PORT for deployment (important for Render), fallback: 5000 for local dev
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server started on port", PORT);
});