/**
 * Entry point for Eligibility Engine service
 * Phase 3.2 Implementation (Blake)
 *
 * Creates the Express application. Server startup is handled
 * by createApp() which starts listening on port 3000.
 */

import { createApp, getServer } from './app.js';

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

// Create the app (server auto-starts on PORT env var or 3000)
const app = createApp(config);
const server = getServer();

// Export for testing
export { app, server };
