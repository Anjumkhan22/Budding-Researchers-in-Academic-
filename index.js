'use strict';

const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const { server } = createApp();

server.listen(PORT, () => {
  console.log(`Budding Researchers platform running on http://localhost:${PORT}`);
});
