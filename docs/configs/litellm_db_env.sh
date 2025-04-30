#!/usr/bin/env bash
# Exports env vars for LiteLLM local Postgres
echo "export LITELLM_DATABASE_URL=postgresql://litellm:litellm@localhost:5432/litellm" > .env.litellm-db
