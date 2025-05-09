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
const HF_API_KEY = process.env.HF_API_KEY; // Hugging Face API Key

// Cache to store repeated queries (reduce API calls)
const responseCache = new Map();

// Delay between API calls (avoid rate limits)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Hugging Face API Integration
async function getHuggingFaceReply(prompt) {
  try {
    await delay(1500); // Delay to avoid rate limits

    const response = await axios.post(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-v0.1",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
        },
      }
    );
    return response.data[0]?.generated_text || "I didn't get a response. Try again!";
  } catch (error) {
    console.error("Hugging Face Error:", error.response?.data || error.message);
    return null; // Return null to trigger fallback
  }
}

// Fallback: Simple responses if Hugging Face fails
function getFallbackReply() {
  const fallbacks = [
    "I’m busy right now. Can you ask again later?",
    "I didn’t understand that. Could you rephrase?",
    "Let me check... (Sorry, I’m having trouble responding!)",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// Send WhatsApp message
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
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

  if (mode && token === VERIFY_TOKEN && mode === "subscribe") {
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

    // Check cache first
    if (responseCache.has(userText)) {
      await sendMessage(from, responseCache.get(userText));
      return res.sendStatus(200);
    }

    // Get AI reply (Hugging Face -> Fallback)
    let reply = await getHuggingFaceReply(userText);
    if (!reply) reply = getFallbackReply();

    // Cache and send
    responseCache.set(userText, reply);
    await sendMessage(from, reply);

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", error);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
