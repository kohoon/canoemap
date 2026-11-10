#!/bin/bash
# Run the VWorld refresh in a clean checkout, preserving the working project.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_ROOT="$HOME/Library/Caches/kr.crowdbase.canoemap.protection"
mkdir -p "$CACHE_ROOT"
LOCK_DIR="$CACHE_ROOT/running"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  RUNNING_PID="$(cat "$LOCK_DIR/pid" 2>/dev/null || true)"
  if [[ "$RUNNING_PID" =~ ^[0-9]+$ ]] && ps -p "$RUNNING_PID" -o args= | grep -Fq "$PROJECT_ROOT/tools/refresh_protection_job.sh"; then
    echo "Protection refresh is already running."
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
fi
echo "$$" > "$LOCK_DIR/pid"
RUN_DIR=""
cleanup() {
  if [[ -n "$RUN_DIR" ]]; then rm -rf "$RUN_DIR"; fi
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR"
}
trap cleanup EXIT
echo "Protection refresh started at $(date -Iseconds)"
if [[ ! -f "$PROJECT_ROOT/vworld_key.txt" ]]; then
  echo "VWorld key file is missing."
  exit 1
fi
if [[ ! -x "$CACHE_ROOT/venv/bin/python" ]]; then
  python3 -m venv "$CACHE_ROOT/venv"
fi
PYTHON="$CACHE_ROOT/venv/bin/python"
if ! "$PYTHON" -c 'import shapely; assert shapely.__version__ == "2.1.2"' >/dev/null 2>&1; then
  "$PYTHON" -m pip install --quiet shapely==2.1.2
fi
RUN_DIR="$(mktemp -d "$CACHE_ROOT/checkout.XXXXXXXX")"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' clone --quiet --depth 1 https://github.com/kohoon/canoemap.git "$RUN_DIR"
cd "$RUN_DIR"
export VWORLD_KEY="$(cat "$PROJECT_ROOT/vworld_key.txt")"
export VWORLD_DOMAIN="https://canoe.crowdbase.kr"
"$PYTHON" -u tools/refresh_protect.py
unset VWORLD_KEY
"$PYTHON" -m unittest discover -s tests -p 'test_protect_refresh.py'
git add protect_polygons.geojson index.html map.html test.html tour/legacy.html
if git diff --cached --quiet; then
  echo "VWorld source is unchanged; verified existing snapshot."
  exit 0
fi
git -c user.name="CanoeMap data refresh" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" commit --quiet -m "Refresh verified VWorld protection boundaries"
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push --quiet origin HEAD:main
COMMIT="$(git rev-parse HEAD)"
echo "Published protection update $COMMIT at $(date -Iseconds)"
