#!/usr/bin/env bash
# Reset local staging branch to match origin/staging and stash any WIP first.
# Usage: npm run git:reset-staging (via package.json)

set -euo pipefail

# Fetch latest refs
git fetch origin --prune

# Stash local changes (tracked + untracked) for safety
git stash push --include-untracked -m "auto-backup $(date +%F_%T) before reset-to-staging"

echo "🔄 Swapping to staging…"
# Ensure branch exists locally
git checkout -B staging origin/staging
# Hard-reset in case checkout already on staging
git reset --hard origin/staging

echo "✅ Local staging is now identical to origin/staging" 
