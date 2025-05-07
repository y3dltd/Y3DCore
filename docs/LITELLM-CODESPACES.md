# Using LiteLLM in GitHub Codespaces

This document explains how to use the LiteLLM proxy with your Y3DHub project in GitHub Codespaces.

## Automatic Setup

The dev container is configured to:

1. Install LiteLLM and its dependencies in a Python virtual environment (`.venv`)
2. Add required LiteLLM environment variables to your `.env` file (if they don't exist)
3. Create a helper script to easily start the LiteLLM services


## Starting LiteLLM

To start the LiteLLM proxy and its PostgreSQL database in your Codespaces environment:

```bash
./scripts/start-litellm.sh
```


This will:

- Start a PostgreSQL database on port 5432
- Start the LiteLLM proxy on port 4000
- Configure all necessary environment variables


## Accessing the LiteLLM UI

Once started, you can access the LiteLLM UI at:

- URL: [http://localhost:4000/ui/](http://localhost:4000/ui/)
- Default credentials: admin/admin


## Configuration

LiteLLM is configured using:

- `docker-compose.litellm.yml` - Container configuration
- `docs/configs/litellm_config.yaml` - LiteLLM proxy configuration


## Important Environment Variables

The following environment variables are automatically added to your `.env` file:

```env
LITELLM_DATABASE_URL=postgresql://litellm:litellm@localhost:5432/litellm
LITELLM_MASTER_KEY=sk-litellm-master-key-XXXXXXXXXXXX
DEFAULT_LLM_KEY=sk-litellm-default-XXXXXXXXXXXX
UI_USERNAME=admin
UI_PASSWORD=admin
```


## Using LiteLLM in Your Code

To use LiteLLM in your application code, simply point your OpenAI client to the proxy URL:

```typescript
import { OpenAI } from 'openai';

// Create an OpenAI client pointing to LiteLLM
const client = new OpenAI({
  baseURL: 'http://localhost:4000',
  apiKey: process.env.LITELLM_MASTER_KEY || 'dummy-key',
});

// Use it like the regular OpenAI client
const response = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Hello, world!' }],
  model: 'gpt-4o-mini', // Use models defined in litellm_config.yaml
});
```

## Adding API Keys

To add your actual OpenAI API key:

1. Edit your `.env` file to add your real API keys:

   ```env
   OPENAI_API_KEY=sk-your-actual-openai-key
   OPENROUTER_API_KEY=sk-your-actual-openrouter-key
   ```


2. Restart the LiteLLM service:

   ```bash
   ./scripts/start-litellm.sh
   ```


## Troubleshooting

If you encounter issues:

1. Check the LiteLLM logs:

   ```bash
   docker logs litellm-proxy
   ```


2. Check the PostgreSQL logs:

   ```bash
   docker logs litellm-postgres
   ```


3. Make sure the ports aren't already in use:

   ```bash
   netstat -tuln | grep '4000\|5432'
   ```


4. Restart both services:

   ```bash
   docker-compose -f docker-compose.litellm.yml down
   docker-compose -f docker-compose.litellm.yml up -d
   ```

