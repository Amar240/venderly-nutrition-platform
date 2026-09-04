#!/usr/bin/env bash
# Build and push the app image to ECR under a UNIQUE, traceable tag.
#
# Why this script exists: the ECR repository has tag immutability turned on
# (deliberately — it makes rollback trustworthy). That means `docker push`
# of an already-used tag such as `:latest` is REJECTED by the registry, and
# the rejection is easy to miss: every layer reports "Layer already exists"
# and only the very last line says the tag could not be overwritten. The
# result looks like a successful push while ECS keeps deploying the original
# image forever. That cost a full debugging session once; it should not be
# possible to hit again.
#
# So: never `:latest`. Every build gets `<UTC date>-<git short sha>`, which is
# unique per commit, sorts chronologically, and points at exactly the source
# that produced it.
set -euo pipefail

ACCOUNT_ID="980228515132"
REGION="us-east-2"
REPO="woodbridge-nutrition"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

cd "$(dirname "$0")/.."

# --- refuse to ship something that isn't in git -----------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "WARNING: working tree has uncommitted changes."
  echo "The image is built from your working directory, so it would contain"
  echo "code that is not in git — and the tag below would name a commit that"
  echo "does not describe what is actually inside the image."
  echo
  git status --short
  echo
  read -r -p "Build anyway? [y/N] " reply
  case "$reply" in
    [yY]) TAG_SUFFIX="$(git rev-parse --short HEAD)-dirty" ;;
    *) echo "Aborted. Commit first, then re-run."; exit 1 ;;
  esac
else
  TAG_SUFFIX="$(git rev-parse --short HEAD)"
fi

TAG="$(date -u +%Y-%m-%d)-${TAG_SUFFIX}"
IMAGE="${REGISTRY}/${REPO}:${TAG}"

echo "==> Image: ${IMAGE}"
echo

echo "==> Logging in to ECR…"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

# --platform is not optional on an Apple Silicon Mac: without it the image
# builds and pushes happily, then dies at runtime with an exec format error.
echo "==> Building (linux/amd64)…"
docker build --platform linux/amd64 -t "${REPO}:${TAG}" .

echo "==> Tagging and pushing…"
docker tag "${REPO}:${TAG}" "$IMAGE"
docker push "$IMAGE"

cat <<EOF

============================================================
Pushed successfully.

  ${IMAGE}

Next: point the App Runner service at this exact tag.
  App Runner -> Services -> woodbridge-nutrition
    -> Configuration -> Edit
    -> Container image URI (paste the line above)
    -> Save and deploy

The service is https://h3kftp3qtj.us-east-2.awsapprunner.com

Then watch the service Logs for:
  [AppRunner] Health check is successful. Routing traffic to application.
============================================================
EOF
