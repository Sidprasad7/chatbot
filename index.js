require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = "travelbot123";
const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini API integration
async function getGeminiReply(userMessage) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: userMessage
          }]
        }]
      }
    );
    return response.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Gemini API Error:", error.response?.data || error.message);
    return "Sorry, I encountered an error. Please try again later.";
  }
}

// Send WhatsApp message
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (error) {
    console.error("WhatsApp API Error:", error.response?.data || error.message);
  }
}

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook message handler (POST)
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const userText = message.text?.body;

    if (!userText) return res.sendStatus(200);

    // Get Gemini reply
    const geminiReply = await getGeminiReply(userText);
    await sendMessage(from, geminiReply);

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", error);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
