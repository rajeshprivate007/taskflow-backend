# -------- BACKEND (Node.js + MongoDB) --------

# Use Node.js base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy only package files first (for caching)
COPY server/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the backend code
COPY server/ .

# Expose backend port
EXPOSE 4001

# Command to run the app
CMD ["node", "index.js"]