#!/usr/bin/env bash
# Usage: ./scripts/release.sh [patch|minor|major|<version>]

set -euo pipefail

BUMP_TYPE="${1:-patch}"
CURRENT_VERSION=$(jq -r .version package.json)

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VERSION="$BUMP_TYPE"
else
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
  case "$BUMP_TYPE" in
    patch) PATCH=$((PATCH + 1)) ;;
    minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
    major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
    *) echo "Usage: $0 [patch|minor|major|<version>]"; exit 1 ;;
  esac
  NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo "Current version: $CURRENT_VERSION"
echo "New version: $NEW_VERSION"

jq --arg version "$NEW_VERSION" '.version = $version' package.json > package.json.tmp
mv package.json.tmp package.json

git add package.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "Version bumped to v$NEW_VERSION"
echo "Run 'git push origin HEAD && git push origin v$NEW_VERSION' to publish"