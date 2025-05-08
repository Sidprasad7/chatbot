const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = 'your_verify_token';
const META_TOKEN = process.env.META_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const API_KEY = process.env.GEMINI_API_KEY;

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook message handler
app.post('/webhook', async (req, res) => {
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message && message.text && message.from) {
    const userMessage = message.text.body;
    const senderId = message.from;

    try {
      // ✅ Correct v1beta endpoint for AI Studio
      const geminiRes = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/chat-bison-001:generateContent',
        {
          contents: [{ parts: [{ text: userMessage }] }]
        },
        {
          params: { key: API_KEY }, // your GEMINI_API_KEY from AI Studio
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const reply = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, no response from Gemini.";

      // Send the reply back to the user via WhatsApp
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: senderId,
          text: { body: reply }
        },
        {
          headers: {
            Authorization: `Bearer ${META_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (err) {
      console.error('❌ Error sending message:', err.response?.data || err.message);
    }
  }

  res.sendStatus(200);
});


app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
});
