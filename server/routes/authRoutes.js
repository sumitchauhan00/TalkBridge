const express = require("express");
const router = express.Router();
const { signup, login, searchUser } = require("../controllers/authController");

router.post("/signup", signup);
router.post("/login", login);
router.get("/search/:username", searchUser);

module.exports = router;
