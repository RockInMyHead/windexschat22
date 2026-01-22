#!/bin/bash

# Watch for changes and auto-commit every 5 minutes
# Usage: ./commit-watch.sh

echo "👀 Starting commit watcher (commits every 5 minutes)"
echo "Press Ctrl+C to stop"

INTERVAL=300  # 5 minutes

while true; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Checking for changes..."

    # Run auto-commit script
    ./auto-commit.sh

    # Wait for next interval
    echo "⏰ Next check in 5 minutes..."
    sleep $INTERVAL
done