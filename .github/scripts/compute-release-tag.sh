#!/usr/bin/env bash
set -euo pipefail

# Computes the next patch release tag based on commits since the latest base tag.
#
# Stdout (KEY=VALUE lines when a new tag should be created):
#   tag=vX.Y.Z
#   base_tag=vX.Y
#
# Exit codes:
#   0 - success (empty stdout means nothing to release)
#   1 - no base version tag found

LATEST_TAG=$(git tag --list 'v[0-9]*.[0-9]*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+(\.0)?$' | head -1 || true)

if [ -z "$LATEST_TAG" ]; then
  echo "No version tag found. Create one with: git tag v0.15 && git push origin v0.15" >&2
  exit 1
fi

VERSION_PART=${LATEST_TAG#v}
MAJOR=$(echo "$VERSION_PART" | cut -d. -f1)
MINOR=$(echo "$VERSION_PART" | cut -d. -f2)

PATCH=$(git rev-list "$LATEST_TAG"..HEAD --count)

if [ "$PATCH" -eq 0 ]; then
  echo "No commits since $LATEST_TAG. Nothing to release." >&2
  exit 0
fi

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
TAG="v$NEW_VERSION"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Nothing new to release." >&2
  exit 0
fi

echo "tag=$TAG"
echo "base_tag=$LATEST_TAG"
