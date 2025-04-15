#!/bin/bash

# Define directories and files to clean
echo "Cleaning temporary files and build artifacts..."

# Clean build artifacts
if [ -d ".next" ]; then
  echo "Removing .next directory..."
  rm -rf .next
fi

if [ -d "build" ]; then
  echo "Removing build directory..."
  rm -rf build
fi

# Clean cache directories
for dir in .turbo .swc .ruff_cache .mypy_cache .pytest_cache __pycache__ .qodo; do
  find . -type d -name "$dir" -exec rm -rf {} +
done

# Clean log files
if [ -d "logs" ]; then
  echo "Removing logs directory..."
  rm -rf logs
fi
find . -name "*.log" -type f -delete

# Clean temporary files
for pattern in "*.tmp" "*.temp" "*.bak" "*.old"; do
  find . -name "$pattern" -type f -delete
done

for dir in tmp temp; do
  find . -type d -name "$dir" -exec rm -rf {} +
done

# Clean example and test files
read -p "Do you want to remove example files (example.jpg)? (y/n): " example_answer
if [[ $example_answer == "y" || $example_answer == "Y" ]]; then
  if [ -f "example.jpg" ]; then
    echo "Removing example.jpg..."
    rm -f example.jpg
  fi
  echo "Example files removed."
fi

# Clean Playwright and Puppeteer caches
echo "Cleaning browser caches..."

# Clean Playwright cache
if [ -d "$HOME/.cache/ms-playwright" ]; then
  echo "Removing Playwright cache..."
  rm -rf "$HOME/.cache/ms-playwright"
fi

# Clean Puppeteer cache
if [ -d "$HOME/.cache/puppeteer" ]; then
  echo "Removing Puppeteer cache..."
  rm -rf "$HOME/.cache/puppeteer"
fi

# Clean local project browser files
if [ -d ".playwright" ]; then
  echo "Removing local Playwright files..."
  rm -rf .playwright
fi

if [ -d "playwright-report" ]; then
  echo "Removing Playwright reports..."
  rm -rf playwright-report
fi

if [ -d "test-results" ]; then
  echo "Removing test results..."
  rm -rf test-results
fi

echo "Browser caches cleaned."

echo "Cleanup completed!"

# Ask if user wants to remove node_modules
read -p "Do you want to remove node_modules as well? (y/n): " answer
if [[ $answer == "y" || $answer == "Y" ]]; then
  echo "Removing node_modules directory..."
  rm -rf node_modules
  echo "node_modules removed. You'll need to run 'npm install' again."
fi
