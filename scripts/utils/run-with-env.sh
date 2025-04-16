#!/bin/bash
# Script to run Node.js scripts with environment variables loaded from .env file

# Set the working directory to the project root
cd "$(dirname "$0")/../.." # Go up two levels from scripts/utils to the project root

# Load environment variables from .env file
if [ -f .env ]; then
  # Source the .env file safely, exporting variables line by line
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Trim leading/trailing whitespace
    line=$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    # Skip comments and empty lines
    if [[ "$line" =~ ^# || -z "$line" ]]; then
      continue
    fi
    # Check if the line contains an equals sign
    if [[ "$line" == *"="* ]]; then
       # Split into key and value at the first '='
       key=$(echo "$line" | cut -d '=' -f 1)
       value=$(echo "$line" | cut -d '=' -f 2-) # Get everything after the first '='

       # Remove surrounding quotes (single or double) from the value
       # Check for double quotes
       if [[ "$value" =~ ^\"(.*)\"$ ]]; then
         value="${BASH_REMATCH[1]}"
       # Check for single quotes
       elif [[ "$value" =~ ^\'(.*)\'$ ]]; then
         value="${BASH_REMATCH[1]}"
       fi

       # Export the parsed key and value
       # Use printf for safer export, especially if value contains special chars
       printf -v "$key" '%s' "$value"
       export "$key"
       # Alternative simpler export (might be okay if values are simple):
       # export "$key=$value"
    fi
  done < .env
  echo "Environment variables loaded from .env file"
else
  echo "Error: .env file not found"
  exit 1
fi

# Run the specified script with all arguments passed to this script
echo "Running: $@"
"$@"
