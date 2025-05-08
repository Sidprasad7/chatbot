const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post('/webhook', async (req, res) => {
  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const sender = message?.from;
  const userText = message?.text?.body;

  if (userText && sender) {
    try {
      // Ask ChatGPT
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: userText }],
      });

      const reply = completion.choices[0].message.content;

      // Send response back to WhatsApp
      await axios.post(
        'https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/messages',
        {
          messaging_product: 'whatsapp',
          to: sender,
          text: { body: reply },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (err) {
      console.error('Error processing message:', err.message);
    }
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running');
});
