import express from "express";
import "./index.js";

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Keep-alive server started.");
});
