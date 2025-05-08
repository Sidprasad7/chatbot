// Add these at the top
const VERIFY_TOKEN = 'your_custom_verify_token'; // Pick a string
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const META_TOKEN = process.env.META_TOKEN;

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

// Handle incoming WhatsApp messages
app.post('/webhook', async (req, res) => {
  const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (message && message.text && message.from) {
    const userMessage = message.text.body;
    const senderId = message.from;

    // Gemini response
    try {
      const geminiRes = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        { contents: [{ parts: [{ text: userMessage }] }] },
        {
          params: { key: API_KEY },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const reply = geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, no response.";

      // Send message back to WhatsApp
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
      console.error("Error handling WhatsApp message:", err.response?.data || err.message);
    }
  }

  res.sendStatus(200); // Always respond with 200
});
