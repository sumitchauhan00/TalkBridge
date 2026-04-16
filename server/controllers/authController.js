const User = require("../models/User");
const bcrypt = require("bcrypt");

// SIGNUP
exports.signup = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      username,
      password: hashed,
      photo: "",
    });

    res.json({
      message: "Signup successful",
      user: {
        _id: newUser._id,
        username: newUser.username,
        photo: newUser.photo,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Wrong password" });

    res.json({
      message: "Login successful",
      user: {
        _id: user._id,
        username: user.username,
        photo: user.photo,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// SEARCH
exports.searchUser = async (req, res) => {
  try {
    const { username } = req.params;
    const users = await User.find({
      username: { $regex: username, $options: "i" },
    }).select("_id username photo");

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE PROFILE PHOTO
// UPDATE PROFILE PHOTO

exports.updatePhoto = async (req, res) => {
  try {
    const { userId } = req.params;

    console.log("updatePhoto userId:", userId);
    console.log("updatePhoto req.file:", req.file);

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Photo file required" });
    }

    // multer-storage-cloudinary usually gives secure_url in path
    const photoUrl = req.file.path || req.file.secure_url;

    if (!photoUrl) {
      return res.status(400).json({
        message: "Cloudinary URL missing from uploaded file object",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { photo: photoUrl },
      { new: true }
    ).select("_id username photo");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      message: "Photo updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.log("updatePhoto error:", error);
    return res.status(500).json({
      message: error.message || "Server error",
      name: error.name || "ServerError",
    });
  }
};