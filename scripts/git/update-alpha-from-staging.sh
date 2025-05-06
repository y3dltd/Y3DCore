#!/usr/bin/env bash
# Update alpha branch from staging with a non-fast-forward merge commit
# Usage: npm run git:update-alpha
set -euo pipefail

git fetch origin

# Ensure we have latest branches
git checkout staging
git pull --ff-only origin staging

git checkout alpha
# Update alpha locally
git pull --ff-only origin alpha

echo "🔀 Merging staging -> alpha…"
# Merge with a merge commit, even if fast-forward possible
git merge --no-ff staging -m "Merge staging into alpha"

echo "📤 Pushing alpha to origin…"
git push origin alpha

echo "✅ alpha now contains all changes from staging" 
