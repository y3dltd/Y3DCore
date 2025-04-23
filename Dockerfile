# Dockerfile (in project root: /home/jayson/y3dhub/Dockerfile)
FROM node:22-alpine AS base

WORKDIR /workspace

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# --- Development Stage (used by Dev Container) ---
# No specific build step needed here as Dev Container mounts code
# and runs install/migrate via postCreateCommand.
# The 'sleep infinity' in docker-compose keeps it running.

# --- Production Stage (Example - Adjust as needed) ---
# FROM base AS production
# WORKDIR /workspace
# COPY --from=base /workspace /workspace
# RUN npm run build # Add your build command if you have one
# EXPOSE 3002
# USER node # Optional: run as non-root user
# CMD ["npm", "run", "start"] # Command to start your app in production

# For Dev Container, we just need the base image with dependencies installed.
# The actual running command comes from docker-compose.yml (sleep infinity)
# or commands run manually inside the container.
