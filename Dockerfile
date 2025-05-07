FROM node:22-alpine AS base

# Create app directory and set permissions
WORKDIR /workspace

# Ensure workspace is owned by the pre-existing node user
RUN chown -R node:node /workspace

# Install python3, git-filter-repo, bash, and curl inside Alpine
USER root
RUN apk update && apk add --no-cache git python3 git-filter-repo mariadb-client bash curl jq nano

# Switch back to non-root user
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

# --- Production Stage ---
FROM base AS production
WORKDIR /workspace
COPY --from=base /workspace /workspace
RUN npm run build       # e.g. compile TypeScript, bundler, etc.
ENV PORT 3002
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl --fail http://localhost:3002/ || exit 1
# Add a step to ensure /home/node exists and is owned by node, just in case.
# And verify node user exists in /etc/passwd
USER root
RUN mkdir -p /home/node && chown node:node /home/node && grep node /etc/passwd && ls -ld /home/node
USER node               # drop privileges
CMD ["npm", "run", "start"]
