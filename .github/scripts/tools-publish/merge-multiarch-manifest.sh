#!/usr/bin/env bash
# Merge two single-arch image refs (image@sha256:...) into one multi-arch tag on GHCR.
# Env: IMAGE, VERSION, REF_TYPE, GITHUB_REF, AMD_FILE, ARM_FILE (paths to one-line image@digest each).
# Appends digest=sha256:... to GITHUB_OUTPUT (manifest list digest for cosign).
set -euo pipefail

AMD=$(tr -d '[:space:]' <"$AMD_FILE")
ARM=$(tr -d '[:space:]' <"$ARM_FILE")

ARGS=(-t "${IMAGE}:${VERSION}")
LATEST=false
if [[ "${REF_TYPE}" == "branch" && "${GITHUB_REF}" == "refs/heads/main" ]]; then
  LATEST=true
elif [[ "${REF_TYPE}" == "tag" ]]; then
  T="${GITHUB_REF#refs/tags/}"
  T="${T#v}"
  if [[ "$T" == "$VERSION" ]]; then
    LATEST=true
  fi
fi
if [[ "$LATEST" == "true" ]]; then
  ARGS+=(-t "${IMAGE}:latest")
fi

docker buildx imagetools create "${ARGS[@]}" "$AMD" "$ARM"

# Index digest for signing (text/json shape varies across buildx versions).
json=$(docker buildx imagetools inspect "${IMAGE}:${VERSION}" --format '{{json .}}' 2>/dev/null || true)
DIGEST=$(echo "$json" | jq -r '.digest // .manifest.digest // .Manifest.Descriptor.Digest // empty' 2>/dev/null || true)
if [[ -z "$DIGEST" || "$DIGEST" == "null" ]]; then
  DIGEST=$(docker buildx imagetools inspect "${IMAGE}:${VERSION}" 2>/dev/null | awk '/^[Dd]igest:/ {print $2; exit}')
fi
if [[ -z "$DIGEST" || "$DIGEST" == "null" ]]; then
  echo "::error::Could not read manifest list digest from imagetools inspect" >&2
  exit 1
fi
echo "digest=$DIGEST" >>"$GITHUB_OUTPUT"
echo "Merged ${IMAGE}:${VERSION} -> $DIGEST"
