#!/usr/bin/env bash
# Update staging branch from main with a non-fast-forward merge commit
# Usage: npm run git:update-staging
set -euo pipefail

git fetch origin

# Ensure we have latest branches
git checkout main
git pull --ff-only origin main

git checkout staging
# Update staging locally
git pull --ff-only origin staging

echo "🔀 Merging main -> staging…"
# Merge with a merge commit, even if fast-forward possible
git merge --no-ff main -m "Merge main into staging"

echo "📤 Pushing staging to origin…"
git push origin staging

echo "✅ staging now contains all changes from main" 
