#!/usr/bin/env bash
# Deploy the ERA Match bot to a GCE VM.
# Usage: ./scripts/deploy.sh <vm-name> [zone]
#
# This script SSHs into the VM, pulls latest code, and restarts the container.

set -euo pipefail

VM_NAME="${1:?Usage: deploy.sh <vm-name> [zone]}"
ZONE="${2:-us-central1-a}"
REPO_DIR="/opt/era-match-claude"

echo "Deploying to $VM_NAME ($ZONE)..."

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
  set -e
  cd $REPO_DIR
  sudo git pull
  sudo docker compose up -d --build
  echo 'Deploy complete. Container status:'
  sudo docker compose ps
"
