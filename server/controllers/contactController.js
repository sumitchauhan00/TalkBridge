const Contact = require("../models/Contact");

exports.addContact = async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    const already = await Contact.findOne({
      user: userId,
      contact: contactId,
    });

    if (already) {
      return res.status(400).json({ message: "Already added" });
    }

    await Contact.create({
      user: userId,
      contact: contactId,
    });

    res.json({ message: "Contact added" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getContacts = async (req, res) => {
  try {
    const { userId } = req.params;

    const contacts = await Contact.find({ user: userId })
      .populate("contact", "username");

    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
