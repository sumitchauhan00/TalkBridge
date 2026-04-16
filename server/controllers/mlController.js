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
      timeout: 20000,
      validateStatus: () => true, // handle non-2xx manually
      responseType: "text",       // read raw safely first
    });

    const raw = mlRes.data;

    // ML status fail
    if (mlRes.status < 200 || mlRes.status >= 300) {
      console.error("ML non-2xx:", mlRes.status, raw);
      return res.status(502).json({
        error: "ML service returned non-2xx",
        status: mlRes.status,
      });
    }

    // Parse JSON safely
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      console.error("ML invalid JSON:", raw);
      return res.status(502).json({
        error: "Invalid JSON from ML service",
      });
    }

    // Always return JSON object
    if (!parsed || typeof parsed !== "object") {
      return res.status(502).json({
        error: "Invalid response format from ML service",
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("ML proxy error:", err.message);
    return res.status(500).json({
      error: "ML service error",
      details: err.message,
    });
  }
};