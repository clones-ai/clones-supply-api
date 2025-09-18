# Use a specific version of Node.js for reproducibility.
# Using alpine for a smaller image size.
FROM node:20-alpine AS base

WORKDIR /usr/src/app

# Install dependencies in a separate layer to leverage Docker's caching.
COPY package*.json ./
RUN npm install --production

# --- Release Stage ---
FROM base AS release

WORKDIR /usr/src/app

# Copy dependency layers from the base image
COPY --from=base /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY server.js ./

# Expose the port the app runs on.
# Fly.io automatically handles port mapping, but it's good practice.
EXPOSE 8080

# The command to run the application.
CMD [ "npm", "start" ]
