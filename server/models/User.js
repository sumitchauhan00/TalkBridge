const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: String,
  password: String,

  // profile picture
  photo: {
    type: String,
    default: "",
  },
});

module.exports = mongoose.model("User", userSchema);