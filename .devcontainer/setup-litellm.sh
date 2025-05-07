#!/bin/bash
set -e

echo "Starting LiteLLM setup for Y3DHub..."

# Create Python virtual environment for LiteLLM
cd /workspace
python -m venv .venv
source .venv/bin/activate

# Install LiteLLM with proxy support
echo "Installing LiteLLM and dependencies..."
pip install "litellm[proxy]"

# Create directory for LiteLLM logs if it doesn't exist
mkdir -p /workspace/logs/litellm

# Set up environment variables for LiteLLM if not already in .env
if [ -f "/workspace/.env" ]; then
  # Check if LiteLLM variables are already defined
  if ! grep -q "LITELLM_DATABASE_URL" "/workspace/.env"; then
    echo "Adding LiteLLM environment variables to .env file..."
    cat >> /workspace/.env << EOF

# LiteLLM proxy settings
LITELLM_DATABASE_URL=postgresql://litellm:litellm@localhost:5432/litellm
LITELLM_MASTER_KEY=sk-litellm-master-key-$(openssl rand -hex 12)
DEFAULT_LLM_KEY=sk-litellm-default-$(openssl rand -hex 12)
UI_USERNAME=admin
UI_PASSWORD=admin
EOF
  fi
fi

echo "Setting up LiteLLM helper scripts..."

# Create a script to easily start LiteLLM from anywhere
cat > /workspace/scripts/start-litellm.sh << 'EOF'
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
EOF

# Make the script executable
chmod +x /workspace/scripts/start-litellm.sh

echo "LiteLLM setup complete!"
echo "To start LiteLLM, run: ./scripts/start-litellm.sh"
