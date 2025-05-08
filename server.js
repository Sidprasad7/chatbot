const express = require('express');
const app = express();

// You can set your port like this:
const PORT = process.env.PORT || 10000;

// Your existing middleware, routes, etc.
// Example:
app.get('/', (req, res) => {
  res.send('Hello from the chatbot server!');
});

// Start server with error handling
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Try using a different port.`);
    process.exit(1); // Optional: Exit the process
  } else {
    throw err;
  }
});
