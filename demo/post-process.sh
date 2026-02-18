#!/bin/bash
# demo/post-process.sh
# Converts per-scene webm clips to mp4, then concatenates into a final demo video.
# Uses Docker (jrottenberg/ffmpeg) — no local ffmpeg install needed.
#
# Usage: npm run demo:process

set -euo pipefail

OUTPUT_DIR="demo/output"
SCENES_DIR="$OUTPUT_DIR/scenes/account-a"
MP4_DIR="$OUTPUT_DIR/mp4"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Docker image for ffmpeg
FFMPEG_IMAGE="jrottenberg/ffmpeg:5-alpine"

# Resolve absolute path to project root (for Docker volume mount)
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ffmpeg via Docker: mount the project root at /work
ffmpeg_docker() {
  docker run --rm -v "$PROJECT_ROOT:/work" -w /work "$FFMPEG_IMAGE" "$@"
}

# Check Docker is available
if ! command -v docker &> /dev/null; then
  echo "Error: Docker not installed."
  exit 1
fi

# Pull ffmpeg image if not present (only on first run)
if ! docker image inspect "$FFMPEG_IMAGE" &> /dev/null; then
  echo "Pulling $FFMPEG_IMAGE..."
  docker pull "$FFMPEG_IMAGE"
fi

# Find scene videos (sorted by name = scene order)
SCENE_FILES=$(ls -1 "$SCENES_DIR/"*.webm 2>/dev/null | sort)

if [ -z "$SCENE_FILES" ]; then
  echo "Error: No scene videos found in $SCENES_DIR/"
  echo "Run 'npm run demo:record' first."
  exit 1
fi

# Clean previous mp4s
rm -rf "$MP4_DIR"
mkdir -p "$MP4_DIR"

# Step 1: Convert each scene webm to mp4
echo "Converting scenes to mp4..."
CONCAT_FILE="$OUTPUT_DIR/.concat.txt"
> "$CONCAT_FILE"
COUNT=0

while IFS= read -r webm; do
  name=$(basename "$webm" .webm)
  mp4="$MP4_DIR/${name}.mp4"
  echo "  $name"

  ffmpeg_docker -y -i "$webm" \
    -c:v libx264 -crf 23 -preset medium \
    -vf "fps=30" \
    -movflags +faststart \
    "$mp4" 2>/dev/null

  # Absolute paths inside Docker container (/work is the project root)
  echo "file '/work/$mp4'" >> "$CONCAT_FILE"
  COUNT=$((COUNT + 1))
done <<< "$SCENE_FILES"

# Step 2: Concatenate all scene mp4s into one video
FINAL="$OUTPUT_DIR/jits-demo-${TIMESTAMP}.mp4"
echo ""
echo "Concatenating $COUNT scenes..."

ffmpeg_docker -y -f concat -safe 0 -i "$CONCAT_FILE" \
  -c copy \
  -movflags +faststart \
  "$FINAL" 2>/dev/null

rm "$CONCAT_FILE"

echo ""
echo "Final video: $FINAL"
echo "Scene clips: $MP4_DIR/"

# Step 3: Side-by-side clips for scenes with both A and B recordings
B_DIR="$OUTPUT_DIR/scenes/account-b"
B_FILES=$(ls -1 "$B_DIR/"*.webm 2>/dev/null | sort)

if [ -n "${B_FILES:-}" ]; then
  echo ""
  echo "Account B scenes found — creating side-by-side clips..."
  SBS_DIR="$OUTPUT_DIR/side-by-side"
  mkdir -p "$SBS_DIR"

  while IFS= read -r b_webm; do
    name=$(basename "$b_webm" .webm)
    a_webm="$SCENES_DIR/${name}.webm"

    if [ -f "$a_webm" ]; then
      sbs="$SBS_DIR/${name}-sbs.mp4"
      echo "  $name"

      ffmpeg_docker -y -i "$a_webm" -i "$b_webm" \
        -filter_complex "[0:v]scale=390:844[left];[1:v]scale=390:844[right];[left][right]hstack=inputs=2" \
        -c:v libx264 -crf 23 -preset medium \
        -movflags +faststart \
        "$sbs" 2>/dev/null
    fi
  done <<< "$B_FILES"
fi

echo ""
echo "Done!"
