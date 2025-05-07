#!/bin/bash
set -e

# Source the virtual environment
source /workspace/.venv/bin/activate

# Check if docker-compose-plugin is available
if command -v docker compose &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Start LiteLLM services
echo "Starting LiteLLM proxy and PostgreSQL..."
cd /workspace
$DOCKER_COMPOSE -f docker-compose.litellm.yml up -d

echo "LiteLLM is now available at http://localhost:4000"
echo "UI credentials: admin/admin"
