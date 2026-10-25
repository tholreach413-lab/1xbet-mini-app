FROM node:20-alpine

WORKDIR /app

# Copy package files and install deterministic production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose port (Render sets $PORT dynamically)
EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Start server
CMD ["node", "server.js"]
