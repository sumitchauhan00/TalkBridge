const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const {
  signup,
  login,
  searchUser,
  updatePhoto,
} = require("../controllers/authController");

const User = require("../models/User");

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "talkbridge_profiles",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 512, height: 512, crop: "limit" }],
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only image files are allowed"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post("/signup", signup);
router.post("/login", login);
router.get("/search/:username", searchUser);

// upload route with explicit multer error handling
router.post("/photo/:userId", (req, res, next) => {
  upload.single("photo")(req, res, function (err) {
    if (err) {
      console.log("UPLOAD ERROR RAW:", err);

      // multer known errors
      if (err.name === "MulterError") {
        return res.status(400).json({
          message: `MulterError: ${err.message}`,
          code: err.code || null,
        });
      }

      // cloudinary / storage errors
      return res.status(400).json({
        message: err.message || "Upload failed",
        name: err.name || "UploadError",
        http_code: err.http_code || null,
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file received in field 'photo'" });
    }

    next();
  });
}, updatePhoto);

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