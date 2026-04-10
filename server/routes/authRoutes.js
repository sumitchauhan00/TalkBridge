const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const {
  signup,
  login,
  searchUser,
  updatePhoto,
} = require("../controllers/authController");

const User = require("../models/User");

// multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    cb(null, `user_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

router.post("/signup", signup);
router.post("/login", login);
router.get("/search/:username", searchUser);

// profile.html -> savePhoto() uses this
router.post("/photo/:userId", upload.single("photo"), updatePhoto);

// GET USER BY ID
router.get("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const user = await User.findById(id).select("_id username photo");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;