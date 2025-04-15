#!/bin/bash
# Script to run Node.js scripts with environment variables loaded from .env file

# Set the working directory to the project root
cd "$(dirname "$0")/.."

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
  echo "Environment variables loaded from .env file"
else
  echo "Error: .env file not found"
  exit 1
fi

# Run the specified script with all arguments passed to this script
echo "Running: $@"
"$@"
