#!/usr/bin/env bash
set -eu

: "${FRONTEND_IMAGE:?Set FRONTEND_IMAGE to the target image name and tag}"

pnpm run build
docker build -t "$FRONTEND_IMAGE" .
docker push "$FRONTEND_IMAGE"
