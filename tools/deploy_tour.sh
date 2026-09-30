#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
STAGE_DIR=$(mktemp -d /tmp/mycanoe-tour.XXXXXX)
cleanup() {
  case "$STAGE_DIR" in
    /tmp/mycanoe-tour.*) rm -rf -- "$STAGE_DIR" ;;
  esac
}
trap cleanup EXIT

cd "$ROOT_DIR"
python3 tools/build_map.py
cp tour/index.html "$STAGE_DIR/index.html"
cp tour/legacy.html "$STAGE_DIR/legacy.html"
cp tour/service-worker.js tour/manifest.webmanifest tour/pwa-icon.svg "$STAGE_DIR/"
cp health.txt "$STAGE_DIR/"
cp protect_polygons.geojson wlz.geojson waterplay.geojson rivers.geojson roads.geojson daiso_stores.geojson hanaro_stores.geojson og.png "$STAGE_DIR/"
cp admin_dong_index.json "$STAGE_DIR/"
cp -R admin_dong "$STAGE_DIR/"
npx --yes wrangler pages deploy "$STAGE_DIR" --project-name mycanoe-tour --branch main --commit-dirty=true
