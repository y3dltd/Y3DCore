FROM node:22-alpine

# Create app directory and set permissions
WORKDIR /workspace

# Ensure workspace is owned by the pre-existing node user
RUN chown -R node:node /workspace

# Install essential development tools for Y3DHub
USER root
RUN apk update && apk add --no-cache \
    # Base tools
    python3 \
    git \
    openssh \
    curl \
    wget \
    bash \
    # Build tools
    build-base \
    g++ \
    make \
    # MySQL client for database operations
    mysql-client \
    # GitHub CLI 
    && wget https://github.com/cli/cli/releases/download/v2.45.0/gh_2.45.0_linux_amd64.tar.gz -O /tmp/gh.tar.gz \
    && tar -xzf /tmp/gh.tar.gz -C /tmp \
    && mv /tmp/gh_*_linux_amd64/bin/gh /usr/local/bin/ \
    && rm -rf /tmp/gh* \
    # Install Docker CLI
    && apk add --no-cache docker-cli \
    # Install OpenSCAD (required for STL rendering in Y3DHub)
    && apk add --no-cache --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing \
       openscad

# Install global NPM packages used in your environment
RUN npm install -g npm@10.9.2 && \
    npm install -g \
    typescript@latest \
    ts-node@latest \
    prisma@latest \
    next@latest \
    corepack@latest \
    eslint@latest \
    prettier@latest \
    vercel@latest \
    # Testing tools mentioned in project memory
    vitest@latest \
    @playwright/test@latest

# Install AI coding assistants (in a separate step to prevent build failures)
RUN npm install -g @anthropic-ai/claude-code@latest task-master-ai@latest || echo "AI assistants installation failed but continuing build"

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

# --- Production Stage (uncomment & adjust as needed) ---
# FROM base AS production
# WORKDIR /workspace
# COPY --from=base /workspace /workspace
# RUN npm run build       # e.g. compile TypeScript, bundler, etc.
# EXPOSE 3002
# USER node               # drop privileges
# CMD ["npm", "run", "start"]
