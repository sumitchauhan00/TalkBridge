const express = require("express");
const router = express.Router();
const { getMessages } = require("../controllers/messageController");

router.get("/:senderId/:receiverId", getMessages);

module.exports = router;
