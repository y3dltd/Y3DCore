

if [ -f .env ]; then
  DB_USER=${MYSQL_USER:-dbuser}
  DB_PASS=${MYSQL_PASSWORD:-dbpassword}
  DB_NAME=${MYSQL_DATABASE:-y3dhub}
  
  sed -i "s|mysql://.*@localhost:3306/.*|mysql://${DB_USER}:${DB_PASS}@db:3306/${DB_NAME}|g" .env
  echo "Updated DATABASE_URL in .env to point to the container database"
fi
