#!/bin/bash
# --- SCARLETSPOTS MASTER DEPLOY ---

# 1. Hardening & Tools
sudo apt update && sudo apt install -y ufw docker.io docker-compose-v2

# 2. Firewall Lockdown (80/443 for Users, 22 for You)
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 3. Restore Postgres Tuning Config
mkdir -p ./postgres_config
if [ ! -f ./postgres_config/postgresql.conf ]; then
cat <<EOF > ./postgres_config/postgresql.conf
max_connections = 500
shared_buffers = 6GB
effective_cache_size = 18GB
maintenance_work_mem = 1GB
work_mem = 32MB
listen_addresses = '*'
EOF
fi

# 4. Ignition
sudo docker compose up -d --build

# 5. Data Injection (First time only)
echo "Waiting for DB to wake up..."
sleep 10

if [ -f ./backups/latest_prod_data.sql ]; then
	cat ./backups/latest_prod_data.sql | sudo docker exec -i scarletspots-db psql -U scarlet_admin -d scarletspots
	echo "Imported latest_prod_data.sql"
else
	echo "No latest_prod_data.sql found; skipping data import"
fi

echo "Production Ferrari is now Containerized and Hardened."
