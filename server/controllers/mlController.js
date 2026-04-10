const FormData = require("form-data");
const axios = require("axios");

exports.predictFromFrame = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No frame uploaded" });
    }

    const form = new FormData();
    form.append("frame", req.file.buffer, {
      filename: "frame.jpg",
      contentType: req.file.mimetype || "image/jpeg",
    });

    const mlRes = await axios.post("http://127.0.0.1:8000/predict", form, {
      headers: form.getHeaders(),
      timeout: 10000,
    });

    return res.json(mlRes.data);
  } catch (err) {
    console.error("ML proxy error:", err.message);
    return res.status(500).json({ error: "ML service error" });
  }
};