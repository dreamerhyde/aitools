#!/bin/bash

# Release script for aitools
# Usage: ./scripts/release.sh [patch|minor|major]

VERSION_TYPE=${1:-patch}

echo "🚀 Starting release process..."
echo "Version bump type: $VERSION_TYPE"
echo ""

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working directory is not clean. Please commit or stash changes."
  exit 1
fi

# Check if on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Error: Not on main branch. Please switch to main."
  exit 1
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Run tests and build
echo "🧪 Running build..."
bun run build

# Bump version
echo "📝 Bumping version..."
npm version $VERSION_TYPE -m "chore: release v%s"

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✅ New version: v$NEW_VERSION"

# Push commits and tags
echo "📤 Pushing to GitHub..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✨ Release v$NEW_VERSION initiated!"
echo "📦 GitHub Actions will automatically publish to npm"
echo "🔗 Check progress at: https://github.com/dreamerhyde/aitools/actions"
echo ""
echo "Next steps:"
echo "1. Wait for GitHub Actions to complete"
echo "2. Verify on npm: https://www.npmjs.com/package/@dreamerhyde/aitools"