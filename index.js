require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Configuration
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "travelbot123";
const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "mistralai/Mistral-7B-v0.1"; // Configurable model

// Cache with TTL (1 hour)
const responseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Enhanced delay with jitter to avoid rate limits
const delay = (baseMs) => {
  const jitter = Math.random() * 500; // Add random 0-500ms jitter
  return new Promise(resolve => setTimeout(resolve, baseMs + jitter));
};

// Improved Hugging Face API Integration
async function getHuggingFaceReply(prompt) {
  try {
    await delay(2000); // Slightly longer delay with jitter

    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      { 
        inputs: prompt,
        parameters: {
          max_new_tokens: 150, // Limit response length
          temperature: 0.7, // Control randomness
        }
      },
      {
        headers: {
          Authorization: `Bearer ${HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000 // 10-second timeout
      }
    );

    return response.data[0]?.generated_text?.trim() || "I didn't get a response. Try again!";
  } catch (error) {
    console.error("Hugging Face Error:", error.response?.data || error.message);
    return null;
  }
}

// Enhanced fallback system
function getFallbackReply(userText) {
  const fallbacks = {
    greeting: ["Hello! How can I help you today?", "Hi there! What can I do for you?"],
    question: ["I'm not sure about that. Could you ask differently?", "Let me think about that..."],
    default: ["I'm having trouble responding. Please try again later."]
  };

  if (/hello|hi|hey/i.test(userText)) return fallbacks.greeting;
  if (/\?$/.test(userText)) return fallbacks.question;
  return fallbacks.default;
}

// Robust WhatsApp message sender
async function sendMessage(to, text) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: text.substring(0, 1000) }, // Truncate to 1000 chars
      },
      {
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 5000
      }
    );
    return response.data;
  } catch (error) {
    console.error("WhatsApp API Error:", error.response?.data || error.message);
    throw error; // Re-throw for upstream handling
  }
}

// Cache management
function getCachedReply(key) {
  const entry = responseCache.get(key);
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL)) {
    return entry.response;
  }
  responseCache.delete(key);
  return null;
}

function setCachedReply(key, response) {
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN && mode === "subscribe") {
    console.log("Webhook verified!");
    return res.status(200).send(challenge);
  }
  console.warn("Webhook verification failed");
  return res.sendStatus(403);
});

// Webhook message handler
app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const userText = message.text?.body?.trim();
    if (!userText) return res.sendStatus(200);

    // Check cache first
    const cachedReply = getCachedReply(userText);
    if (cachedReply) {
      await sendMessage(from, cachedReply);
      return res.sendStatus(200);
    }

    // Get AI reply with fallback
    let reply = await getHuggingFaceReply(userText);
    if (!reply) {
      const fallback = getFallbackReply(userText);
      reply = Array.isArray(fallback) 
        ? fallback[Math.floor(Math.random() * fallback.length)]
        : fallback;
    }

    // Cache and send
    setCachedReply(userText, reply);
    await sendMessage(from, reply);

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Processing Error:", error);
    return res.sendStatus(500);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).send("Internal Server Error");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Hugging Face model: ${HF_MODEL}`);
});

