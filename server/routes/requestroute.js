const express = require("express");
const router = express.Router();

const FriendRequest = require("../models/FriendRequest");
const Contact = require("../models/Contact");

//////////////////////////////////////////////////
// SEND REQUEST
//////////////////////////////////////////////////
router.post("/send", async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "Missing data" });
    }

    if (from === to) {
      return res.status(400).json({ message: "Cannot send to yourself" });
    }

    // Check if already friends
    const alreadyFriend = await Contact.findOne({
      user: from,
      contact: to
    });

    if (alreadyFriend) {
      return res.json({ message: "Already friends" });
    }

    // Delete old requests between both users
    await FriendRequest.deleteMany({
      $or: [
        { from, to },
        { from: to, to: from }
      ]
    });

    // Create new pending request
    await FriendRequest.create({
      from,
      to,
      status: "pending"
    });

    res.json({ message: "Request sent" });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

//////////////////////////////////////////////////
// GET PENDING REQUESTS
//////////////////////////////////////////////////
router.get("/:userId", async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      to: req.params.userId,
      status: "pending"
    }).populate("from", "username photo");

    res.json(requests);

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

//////////////////////////////////////////////////
// ACCEPT REQUEST
//////////////////////////////////////////////////
router.post("/accept", async (req, res) => {
  try {
    const { requestId } = req.body;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Not found" });

    // Add contacts both sides
    await Contact.create({
      user: request.from,
      contact: request.to
    });

    await Contact.create({
      user: request.to,
      contact: request.from
    });

    // Delete request after accepting
    await FriendRequest.findByIdAndDelete(requestId);

    res.json({ message: "Accepted" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

//////////////////////////////////////////////////
// REJECT REQUEST
//////////////////////////////////////////////////
router.post("/reject", async (req, res) => {
  try {
    const { requestId } = req.body;

    await FriendRequest.findByIdAndDelete(requestId);

    res.json({ message: "Rejected" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;