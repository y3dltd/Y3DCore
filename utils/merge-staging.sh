#!/bin/bash

# Make sure we have the latest changes
git fetch --all

# Checkout main branch
git checkout main

# Make sure it's up to date
git pull origin main

# Merge staging into main
git merge staging

# Push the changes to remote
git push origin main

# Optionally switch back to staging
git checkout staging

echo "Successfully merged staging into main"


# git merge-staging
