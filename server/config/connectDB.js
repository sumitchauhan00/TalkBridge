const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Atlas URI from env, fallback to local dev
    const mongoUri =
      process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/chatapp";

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Database connected:", mongoUri.includes("localhost") ? "localhost" : "Atlas/Prod");
  } catch (error) {
    console.log("MongoDB connection error:", error.message);
    process.exit(1); // Exit on DB fail in production
  }
};

module.exports = connectDB;