const FormData = require("form-data");
const axios = require("axios");

const ML_BASE_URL = process.env.ML_BASE_URL || "https://ml-service-ldmg.onrender.com";

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

    const mlRes = await axios.post(`${ML_BASE_URL}/predict`, form, {
      headers: form.getHeaders(),
      timeout: 20000,
      validateStatus: () => true,
      responseType: "json", // json direct
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (mlRes.status < 200 || mlRes.status >= 300) {
      console.error("ML non-2xx:", mlRes.status, mlRes.data);
      return res.status(502).json({
        error: "ML service returned non-2xx",
        status: mlRes.status,
        details: mlRes.data || null,
      });
    }

    const parsed = mlRes.data;
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