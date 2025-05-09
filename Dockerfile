# Base image: Debian Bullseye slim with Node 22
FROM node:22-bullseye-slim AS base

# Create and chown workspace
WORKDIR /workspace
RUN chown -R node:node /workspace

# Install build- and runtime-deps as root
USER root
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      python3 python3-pip \
      git openssh-client \
      curl wget ca-certificates \
      bash \
      build-essential g++ make \
      default-mysql-client-core \
      docker.io \
      openscad && \
    rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN wget -qO /tmp/gh.tar.gz \
      https://github.com/cli/cli/releases/download/v2.45.0/gh_2.45.0_linux_amd64.tar.gz && \
    tar -xzf /tmp/gh.tar.gz -C /tmp && \
    mv /tmp/gh_*_linux_amd64/bin/gh /usr/local/bin/ && \
    rm -rf /tmp/gh*

# Global npm tools
RUN npm install -g npm@10.9.2 && \
    npm install -g \
      typescript@latest ts-node@latest prisma@latest \
      next@latest corepack@latest eslint@latest prettier@latest \
      vercel@latest vitest@latest @playwright/test@latest

# AI assistants (fail-safe)
RUN npm install -g @anthropic-ai/claude-code@latest task-master-ai@latest \
    || echo "AI assistants install failed, continuing…"

# Back to non-root
USER node

# Copy manifests, install deps, copy code
COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma
RUN npm install
COPY --chown=node:node . .

# Production stage
FROM base AS production
WORKDIR /workspace

COPY --from=base /workspace /workspace
RUN npm run build

ENV PORT=3002
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl --fail http://localhost:3002/ || exit 1

USER node
CMD ["npm", "run", "start"]
