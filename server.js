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
      const geminiRes = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
        {
          contents: [{ parts: [{ text: userMessage }] }]
        },
        {
          params: { key: API_KEY },
          headers: { 'Content-Type': 'application/json' },
          responseType: 'text'
        }
      );

      // ✅ Collect streamed chunks
      let reply = '';
const lines = geminiRes.data.toString().split('\n');
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const json = JSON.parse(line.slice(6));
    const part = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (part) reply += part;
  }
}
    

      console.log('Reply from Gemini:', reply);

      // ✅ Send to WhatsApp
      await axios.post(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: senderId,
          text: { body: reply || "Sorry, no response from Gemini." }
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
