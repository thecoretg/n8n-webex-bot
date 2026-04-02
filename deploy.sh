#!/bin/bash
set -e

echo "Building..."
npm run build

echo "Syncing to server..."
rsync -av --exclude='node_modules' --exclude='.git' ~/n8n-webex-bot/ ubuntu@52.27.86.224:/opt/n8n-custom-nodes/n8n-webex-bot/

echo "Installing into n8n container..."
ssh ubuntu@52.27.86.224 'CONTAINER=$(sudo docker ps -q --filter name=n8n | head -1) && echo "Container: $CONTAINER" && sudo docker cp /opt/n8n-custom-nodes/n8n-webex-bot $CONTAINER:/home/node/.n8n/ && sudo docker exec $CONTAINER npm install --prefix /home/node/.n8n /home/node/.n8n/n8n-webex-bot'

echo "Done — restart n8n in Easypanel to apply changes."
