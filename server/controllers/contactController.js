const Contact = require("../models/Contact");
const FriendRequest = require("../models/FriendRequest");
const User = require("../models/User");

//////////////////////////////////////////////////
// ADD CONTACT (agar direct use karte ho)
//////////////////////////////////////////////////
exports.addContact = async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    // duplicate avoid
    const exists1 = await Contact.findOne({ user: userId, contact: contactId });
    const exists2 = await Contact.findOne({ user: contactId, contact: userId });

    if (!exists1) await Contact.create({ user: userId, contact: contactId });
    if (!exists2) await Contact.create({ user: contactId, contact: userId });

    res.json({ message: "Contact added" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////////////////////////
// GET CONTACTS
//////////////////////////////////////////////////
exports.getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({
      user: req.params.userId,
    }).populate("contact", "username photo");

    // frontend friendly shape
    const mapped = contacts
      .filter((c) => c.contact)
      .map((c) => ({
        _id: c.contact._id,
        username: c.contact.username || "Unknown",
        photo: c.contact.photo || "",
      }));

    res.json(mapped);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////////////////////////
// SEARCH USERS FOR CHAT BAR
// - self ko exclude karega
// - already added contacts ko exclude karega
//////////////////////////////////////////////////
exports.searchContactsUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    const q = (req.query.q || "").trim();

    if (!q) return res.json([]);

    // current user's existing contacts
    const myContacts = await Contact.find({ user: userId }).select("contact");
    const contactIds = myContacts.map((c) => String(c.contact));

    // include self also in exclude
    const excludeIds = [String(userId), ...contactIds];

    const users = await User.find({
      _id: { $nin: excludeIds },
      username: { $regex: q, $options: "i" },
    }).select("_id username photo");

    res.json(users);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};

//////////////////////////////////////////////////
// DELETE CONTACT
//////////////////////////////////////////////////
exports.deleteContact = async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    const result = await Contact.deleteMany({
      $or: [
        { user: userId, contact: contactId },
        { user: contactId, contact: userId },
      ],
    });

    await FriendRequest.deleteMany({
      $or: [
        { from: userId, to: contactId },
        { from: contactId, to: userId },
      ],
    });

    res.json({
      message: "Contact deleted successfully",
      deletedContacts: result.deletedCount,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
};