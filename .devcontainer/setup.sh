#!/bin/bash
set -e

echo "Starting Y3DHub setup..."

# Check if running in GitHub Codespaces
if [ -n "$CODESPACES" ]; then
  echo "Running in GitHub Codespaces environment"
  
  # Configure Git with GitHub token if available
  if [ -n "$GITHUB_TOKEN" ]; then
    echo "Setting up GitHub authentication..."
    git config --global credential.helper store
    echo "https://x-access-token:$GITHUB_TOKEN@github.com" >> ~/.git-credentials
    echo "GitHub authentication configured"
  fi
fi

# Wait for MySQL to be fully ready
echo "Waiting for MySQL to be fully available..."
max_retries=30
count=0
while ! mysqladmin ping -h db --silent && [ $count -lt $max_retries ]; do
  echo "Waiting for MySQL server (attempt $count/$max_retries)..."
  sleep 2
  count=$((count+1))
done

if [ $count -eq $max_retries ]; then
  echo "WARNING: MySQL may not be fully available yet. Will try to proceed anyway."
else
  echo "MySQL is available!"
fi

# Install node dependencies
echo "Installing NPM dependencies..."
npm install
echo "NPM dependencies installed!"

# Set up environment variables if needed
if [ ! -f .env ] && [ -f .env.example ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo ".env file created"
fi

# Run database migrations
echo "Setting up database..."
npx prisma generate
echo "Prisma client generated"

# Run the actual migration with retry logic
max_migration_retries=3
migration_count=0
while [ $migration_count -lt $max_migration_retries ]; do
  if npx prisma migrate dev --name init; then
    echo "Database migration successful!"
    break
  else
    echo "Migration attempt $migration_count failed, retrying..."
    migration_count=$((migration_count+1))
    sleep 5
  fi
done

if [ $migration_count -eq $max_migration_retries ]; then
  echo "WARNING: Database migration failed after $max_migration_retries attempts."
  echo "You may need to run 'npx prisma migrate dev' manually."
fi

# Configure git
echo "Configuring Git..."
git config --local pull.ff only

# Add helper function to auto-pull when changing directories
echo "Adding auto-pull helper..."
cat >> ~/.bashrc << 'EOF'
cd() { 
  builtin cd "$@"
  if [ -d .git ]; then 
    if git diff-index --quiet HEAD --; then 
      echo "Auto-pulling from remote (no uncommitted changes)..."
      git fetch && git pull --ff-only
    else 
      echo "Skipping auto-pull: Uncommitted changes detected."
    fi
  fi
}

# Y3DHub-specific aliases
alias y3d-sync='npm run sync-orders'
alias y3d-queue='npm run populate-print-queue'
alias y3d-status='npm run status'
alias y3d-complete='npm run complete-shipped'
EOF

# Add path for global npm packages
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc

echo "Y3DHub setup complete!"
echo "Use 'npm run dev' to start the development server"
echo "Available Y3DHub aliases: y3d-sync, y3d-queue, y3d-status, y3d-complete"
