#!/bin/bash

# Auto-commit script for WindexsChat2.0
# Usage: ./auto-commit.sh [commit-message]

set -e

echo "🔄 Auto-commit script started"

# Check if there are any changes
if git diff --quiet && git diff --staged --quiet; then
    echo "✨ No changes to commit"
    exit 0
fi

# Add all changes
echo "📦 Adding changes..."
git add .

# Generate commit message if not provided
if [ $# -eq 0 ]; then
    # Get current timestamp
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Get git status summary
    CHANGED_FILES=$(git status --porcelain | wc -l)
    NEW_FILES=$(git status --porcelain | grep "^A" | wc -l)
    MODIFIED_FILES=$(git status --porcelain | grep "^M" | wc -l)
    DELETED_FILES=$(git status --porcelain | grep "^D" | wc -l)

    # Create descriptive commit message
    COMMIT_MSG="🔄 Auto-commit: ${CHANGED_FILES} files changed"

    if [ $NEW_FILES -gt 0 ]; then
        COMMIT_MSG="${COMMIT_MSG} (+${NEW_FILES} new)"
    fi

    if [ $MODIFIED_FILES -gt 0 ]; then
        COMMIT_MSG="${COMMIT_MSG} (${MODIFIED_FILES} modified)"
    fi

    if [ $DELETED_FILES -gt 0 ]; then
        COMMIT_MSG="${COMMIT_MSG} (-${DELETED_FILES} deleted)"
    fi

    COMMIT_MSG="${COMMIT_MSG} - ${TIMESTAMP}"
else
    COMMIT_MSG="$1"
fi

# Commit with the generated message
echo "💾 Committing: ${COMMIT_MSG}"
git commit -m "${COMMIT_MSG}"

# Push if remote exists
if git remote | grep -q origin; then
    echo "⬆️  Pushing to remote..."
    git push origin main 2>/dev/null || echo "⚠️  Push failed (remote may be ahead)"
else
    echo "📝 No remote configured, skipping push"
fi

echo "✅ Commit completed successfully"