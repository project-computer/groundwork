#!/bin/sh
set -e

if [ -z "$DISCORD_WEBHOOK_URL" ]; then
  echo "DISCORD_WEBHOOK_URL not set, skipping notification"
  exit 0
fi

apk add --no-cache git curl jq

REPO_DIR="/repo"
cd "$REPO_DIR"

LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -n "$LAST_TAG" ]; then
  COMMITS=$(git log "$LAST_TAG"..HEAD --pretty=format:"- %s (%h)" 2>/dev/null || echo "- No commits found")
else
  COMMITS=$(git log -20 --pretty=format:"- %s (%h)" 2>/dev/null || echo "- No commits found")
fi

CURRENT_TAG=$(git describe --tags --abbrev=0 2>/dev/null || git rev-parse --short HEAD 2>/dev/null || echo "unknown")

PAYLOAD=$(jq -n \
  --arg title "VET Prelive Deployment Successful" \
  --arg desc "Tag: $CURRENT_TAG" \
  --arg commits "$COMMITS" \
  '{
    embeds: [{
      title: $title,
      description: ($desc + "\n\n**Commits:**\n" + $commits),
      color: 5763719,
      footer: { text: "VET Clinic" },
      timestamp: (now | todate)
    }]
  }')

curl -s -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"

echo "Discord notification sent"
