const express = require("express");
const multer = require("multer");
const { predictFromFrame } = require("../controllers/mlController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/predict", upload.single("frame"), predictFromFrame);

module.exports = router;