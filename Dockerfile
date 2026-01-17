# Multi-stage Dockerfile for eligibility-engine
# Phase 5: Deployment (Moykle)

# ================================================
# Stage 1: Build
# ================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and configuration
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ================================================
# Stage 2: Production
# ================================================
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S railrepay -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy migrations for runtime migration execution
COPY migrations/ ./migrations/
COPY database.json ./

# Set ownership to non-root user
RUN chown -R railrepay:nodejs /app

# Switch to non-root user
USER railrepay

# Expose port (Railway assigns dynamically via PORT env var)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
