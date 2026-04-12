const express = require("express");
const router = express.Router();

const FriendRequest = require("../models/FriendRequest");
const Contact = require("../models/Contact");

// SEND REQUEST
router.post("/send", async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "Missing data" });
    }
    if (String(from) === String(to)) {
      return res.status(400).json({ message: "Cannot send to yourself" });
    }

    const alreadyFriend = await Contact.findOne({ user: from, contact: to });
    if (alreadyFriend) return res.json({ message: "Already friends" });

    // remove reverse pending if exists
    await FriendRequest.deleteMany({ from: to, to: from, status: "pending" });

    const existing = await FriendRequest.findOne({ from, to, status: "pending" });
    if (existing) return res.json({ message: "Request already pending" });

    const created = await FriendRequest.create({ from, to, status: "pending" });
    return res.status(201).json({ message: "Request sent", request: created });
  } catch (err) {
    console.log("send request error:", err);
    if (err.code === 11000) return res.status(409).json({ message: "Request already exists" });
    return res.status(500).json({ message: "Server error" });
  }
});

// GET PENDING REQUESTS
router.get("/:userId", async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to: req.params.userId,
      status: "pending",
    }).populate("from", "username photo");

    res.json(requests);
  } catch (err) {
    console.log("get pending requests error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ACCEPT REQUEST
router.post("/accept", async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Not found" });

    await Contact.updateOne(
      { user: request.from, contact: request.to },
      { $setOnInsert: { user: request.from, contact: request.to } },
      { upsert: true }
    );

    await Contact.updateOne(
      { user: request.to, contact: request.from },
      { $setOnInsert: { user: request.to, contact: request.from } },
      { upsert: true }
    );

    await FriendRequest.findByIdAndDelete(requestId);

    res.json({ message: "Accepted" });
  } catch (err) {
    console.log("accept request error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// REJECT REQUEST
router.post("/reject", async (req, res) => {
  try {
    const { requestId } = req.body;

    await FriendRequest.findByIdAndDelete(requestId);
    res.json({ message: "Rejected" });
  } catch (err) {
    console.log("reject request error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;