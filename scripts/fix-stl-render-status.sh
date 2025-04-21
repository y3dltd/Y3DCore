#!/bin/bash
set -e

echo "Running SQL migration to fix empty stl_render_state values..."
mysql -u$(grep -oP "(?<=mysql://)[^:]*" .env) -p$(grep -oP "(?<=:)[^@]*" .env) -h$(grep -oP "(?<=@)[^:]*" .env) -P$(grep -oP "(?<=:)[^/]*(?=/)" .env) $(grep -oP "(?<=/)[^?]*" .env) < prisma/migrations/fix_stl_render_status.sql

echo "Generating Prisma client with updated schema..."
npx prisma generate

echo "Migration completed successfully!"
