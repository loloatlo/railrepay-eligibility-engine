/**
 * Entry point for Eligibility Engine service
 * Phase 3.2 Implementation (Blake)
 *
 * Starts the Express server on configured port (default 3000)
 */

import { createApp } from './app.js';

// Load configuration from environment
const config = {
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'railrepay',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
};

const port = parseInt(process.env.PORT || '3000', 10);

// Create and start the app
const app = createApp(config);

const server = app.listen(port, () => {
  console.log(`Eligibility Engine listening on port ${port}`);
});

// Export for testing
export { app, server };
