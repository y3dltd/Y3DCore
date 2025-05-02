#!/usr/bin/env bash
# Merge staging into main with a non-fast-forward merge commit (safer than force-push)
# Usage: npm run git:merge-to-main
set -euo pipefail

git fetch origin

# Ensure we have latest branches
git checkout staging
git pull --ff-only origin staging

git checkout main
# Update main locally
git pull --ff-only origin main

echo "🔀 Merging staging -> main…"
# Merge with a merge commit, even if fast-forward possible
git merge --no-ff staging -m "Merge staging into main"

echo "📤 Pushing main to origin…"
git push origin main

echo "✅ main now contains all changes from staging" 
