# Deploying ERA Match Bot to Google Cloud

## Prerequisites

- `gcloud` CLI installed and authenticated
- A GCP project with billing enabled
- The `era_network_lite.db` database file

## 1. One-Time GCP Setup

### Set your project

```bash
export PROJECT_ID=your-gcp-project-id
gcloud config set project $PROJECT_ID
```

### Create the VM

```bash
gcloud compute instances create era-match-bot \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=cos-stable \
  --image-project=cos-cloud \
  --scopes=cloud-platform \
  --tags=era-bot
```

This uses Container-Optimized OS which has Docker pre-installed. The `cloud-platform` scope lets the VM access Secret Manager.

### Store secrets in Secret Manager

```bash
# Enable the API
gcloud services enable secretmanager.googleapis.com

# Create each secret
echo -n "sk-ant-..." | gcloud secrets create anthropic-api-key --data-file=-
echo -n "xoxb-..."   | gcloud secrets create slack-bot-token --data-file=-
echo -n "xapp-..."   | gcloud secrets create slack-app-token --data-file=-

# Grant the VM's service account access
SA=$(gcloud compute instances describe era-match-bot \
  --zone=us-central1-a \
  --format='value(serviceAccounts[0].email)')

for secret in anthropic-api-key slack-bot-token slack-app-token; do
  gcloud secrets add-iam-policy-binding $secret \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

### Create backup bucket

```bash
gcloud storage buckets create gs://${PROJECT_ID}-era-backups --location=us-central1
```

## 2. Initial Server Setup

SSH into the VM:

```bash
gcloud compute ssh era-match-bot --zone=us-central1-a
```

Then run:

```bash
# Clone the repo
sudo git clone https://github.com/YOUR_USER/era-match-claude.git /opt/era-match-claude
cd /opt/era-match-claude

# Create data directory and copy in the database
sudo mkdir -p data
# (copy era_network_lite.db into data/ — see below)

# Set the GCP project ID for Secret Manager
echo "GCP_PROJECT_ID=your-gcp-project-id" | sudo tee .env

# Start the bot
sudo docker compose up -d --build

# Check logs
sudo docker compose logs -f
```

### Uploading the database

From your local machine:

```bash
# Upload the DB to the VM
gcloud compute scp era_network_lite.db era-match-bot:/tmp/ --zone=us-central1-a

# Then on the VM:
sudo mv /tmp/era_network_lite.db /opt/era-match-claude/data/
```

## 3. Deploying Updates

From your local machine, after pushing changes to GitHub:

```bash
./scripts/deploy.sh era-match-bot us-central1-a
```

This SSHs into the VM, pulls latest code, rebuilds the container, and restarts.

## 4. Daily Backups

On the VM, set up a cron job:

```bash
# Set the backup bucket
echo "export GCS_BACKUP_BUCKET=gs://${PROJECT_ID}-era-backups" | sudo tee -a /etc/environment

# Install the cron job
(sudo crontab -l 2>/dev/null; echo "0 3 * * * GCS_BACKUP_BUCKET=gs://${PROJECT_ID}-era-backups /opt/era-match-claude/scripts/backup.sh >> /var/log/era-backup.log 2>&1") | sudo crontab -
```

This runs at 3 AM daily. The backup uses `sqlite3 .backup` for a consistent snapshot, then uploads to GCS with a date stamp.

## 5. Monitoring

```bash
# View bot logs
gcloud compute ssh era-match-bot --zone=us-central1-a --command="cd /opt/era-match-claude && sudo docker compose logs --tail=50"

# Check if running
gcloud compute ssh era-match-bot --zone=us-central1-a --command="cd /opt/era-match-claude && sudo docker compose ps"
```

## 6. Rotating Secrets

```bash
# Update a secret (creates a new version)
echo -n "new-key-value" | gcloud secrets versions add anthropic-api-key --data-file=-

# Restart the bot to pick up the new value
./scripts/deploy.sh era-match-bot
```

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| e2-small VM (24/7) | ~$13 |
| 10 GB persistent disk | ~$0.40 |
| Secret Manager (3 secrets) | ~$0.00 |
| GCS backups (<1 MB/day) | ~$0.00 |
| **Total** | **~$14/month** |

## Local Development

Nothing changes for local dev. The bot still reads `.env` and SQLite files from the project root. Secret Manager is only used when `GCP_PROJECT_ID` is set.
