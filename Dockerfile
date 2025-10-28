# ------- BACKEND --------
# ----- Stage 1: Build -----
FROM node:18-alpine AS build
WORKDIR /app

# Copy package files and install dependencies
COPY server/package*.json ./
RUN npm install

# Copy the rest of the frontend and build
COPY server/ ./
#RUN npm run build

# ----- Stage 2: Serve -----
FROM node:18-alpine AS production
WORKDIR /app

# Install 'serve' only
RUN npm install -g serve

# Copy only the built static files from the build stage
COPY --from=build /app/build ./build

# Expose port 4001
EXPOSE 4001

# Serve the app
CMD ["serve", "-s", "build", "-l", "4001", "-n"]
