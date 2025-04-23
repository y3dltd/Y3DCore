FROM node:22-alpine AS base

# Create app directory and set permissions
WORKDIR /workspace

# Ensure workspace is owned by the pre-existing node user
RUN chown -R node:node /workspace

# Switch to non-root user
USER node

# Copy package manifests with correct ownership
COPY --chown=node:node package*.json ./

# Copy Prisma schema with correct ownership
COPY --chown=node:node prisma ./prisma

# Install dependencies
RUN npm install

# Copy the rest of your application code with correct ownership
COPY --chown=node:node . .

# --- Development Stage (used by Dev Container) ---
# (Dev Container mounts your source and will run further commands via postCreateCommand)
# No extra steps here; container will stay up per your compose file.

# --- Production Stage (uncomment & adjust as needed) ---
# FROM base AS production
# WORKDIR /workspace
# COPY --from=base /workspace /workspace
# RUN npm run build       # e.g. compile TypeScript, bundler, etc.
# EXPOSE 3002
# USER node               # drop privileges
# CMD ["npm", "run", "start"]
