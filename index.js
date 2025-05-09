require("dotenv").config();
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());
app.use(express.json());
const VERIFY_TOKEN = "travelbot123";
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const metaToken = process.env.META_TOKEN;
const phoneNumberId = process.env.PHONE_NUMBER_ID;

const hotels = JSON.parse(fs.readFileSync("./hotels.json"));
let pendingBookings = {};

function searchHotels(city) {
  const found = hotels.find(h => h.city.toLowerCase() === city.toLowerCase());
  return found ? found.hotels : null;
}

async function getDeepSeekReply(userMessage) {
  const res = await axios.post("https://api.deepseek.com/v1/chat/completions", {
    model: "deepseek-chat",
    messages: [{ role: "user", content: userMessage }]
  }, {
    headers: {
      Authorization: `Bearer ${deepseekApiKey}`,
      "Content-Type": "application/json"
    }
  });
  return res.data.choices[0].message.content;
}

async function sendMessage(to, text) {
  await axios.post(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    text: { body: text }
  }, {
    headers: { Authorization: `Bearer ${metaToken}` }
  });
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

app.post("/webhook", async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(200);

  const from = message.from;
  const userMessage = message.text.body.toLowerCase();

  if (pendingBookings[from] && userMessage.includes("yes")) {
    const booking = pendingBookings[from];
    delete pendingBookings[from];
    const existing = JSON.parse(fs.readFileSync("./bookings.json"));
    existing.push({ ...booking, user: from, timestamp: new Date().toISOString() });
    fs.writeFileSync("./bookings.json", JSON.stringify(existing, null, 2));
    await sendMessage(from, `✅ Your booking at ${booking.hotel.name} is confirmed!`);
    return res.sendStatus(200);
  }

  const match = userMessage.match(/hotels in ([a-zA-Z\s]+)/);
  if (match) {
    const city = match[1].trim();
    const results = searchHotels(city);
    if (results) {
      let reply = `🏨 Hotels in ${city}:
`;
      results.forEach((h, i) => {
        reply += `${i + 1}. ${h.name} - $${h.price}
`;
      });
      reply += `\nReply with: "Book [hotel name]" to confirm.`;
      await sendMessage(from, reply);
    } else {
      await sendMessage(from, `Sorry, I couldn’t find hotels in ${city}.`);
    }
    return res.sendStatus(200);
  }

  const bookMatch = userMessage.match(/book (.+)/i);
  if (bookMatch) {
    const hotelName = bookMatch[1].trim().toLowerCase();
    for (const city of hotels) {
      const hotel = city.hotels.find(h => h.name.toLowerCase() === hotelName);
      if (hotel) {
        pendingBookings[from] = { hotel };
        await sendMessage(from, `Do you want to book ${hotel.name} for $${hotel.price}? Reply "yes" to confirm.`);
        return res.sendStatus(200);
      }
    }
    await sendMessage(from, `Sorry, I couldn’t find the hotel "${hotelName}".`);
    return res.sendStatus(200);
  }

  const gptReply = await getDeepSeekReply(userMessage);
  await sendMessage(from, gptReply);

  res.sendStatus(200);
});

app.listen(3000, () => console.log("Bot running on port 3000"));
