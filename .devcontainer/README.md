# Y3DHub Dev Container

This directory contains the configuration for the Y3DHub development container environment.

## Environment Variables

The dev container uses the following environment variables which can be configured in your `.env` file:

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `MYSQL_ROOT_PASSWORD` | MySQL root user password | `devpassword` |
| `MYSQL_USER` | MySQL database user | `dbuser` |
| `MYSQL_PASSWORD` | MySQL database password | `dbpassword` |
| `MYSQL_DATABASE` | MySQL database name | `y3dhub` |

## Docker Compose Version

This configuration uses Docker Compose version 3.8, which requires:

- Docker Engine 19.03.0+
- Docker Compose 1.27.0+

If you encounter compatibility issues, please ensure your Docker and Docker Compose versions meet these requirements.

## Features

- Pre-built Node.js 22 Alpine image for faster container startup
- MySQL 8.0 database with improved healthcheck
- Environment variable configuration for easier customization
- Error handling for npm install and database migration
- Automatic database URL configuration

## Troubleshooting

If you encounter issues with the dev container:

1. Ensure your `.env` file exists (it will be created from `.env.example` if not)
2. Check that Docker and Docker Compose are up to date
3. Verify that ports 3000 and 3306 are available on your host machine
4. If database connection issues occur, check that the database service is healthy
