#!/bin/bash
cd "$(dirname "$0")"

echo "Pulling latest changes..."
git pull

SHA=$(git rev-parse HEAD)
echo "{\"sha\":\"$SHA\"}" > version.json

echo ""
echo "✅ Updated to $(git rev-parse --short HEAD)"
echo "👉 Go to chrome://extensions and click the reload button (↺) on Floating Daily To-Do"
