
if [ -f .env ]; then
  sed -i 's/mysql:\/\/.*@localhost:3306/mysql:\/\/user:password@db:3306/g' .env
  echo "Updated DATABASE_URL in .env to point to the container database"
fi
