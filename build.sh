#!/usr/bin/env bash
# build.sh — Concatenate page modules into a single bundle
# Usage: bash build.sh

set -e

OUTDIR="$(dirname "$0")"
OUTFILE="$OUTDIR/page-bundle.js"

cat "$OUTDIR/page/constants.js" \
    "$OUTDIR/page/dom-engine.js" \
    "$OUTDIR/page/element-ops.js" \
    "$OUTDIR/page/page-info.js" \
    "$OUTDIR/page/animation.js" \
    "$OUTDIR/page/agent.js" \
    > "$OUTFILE"

LINES=$(wc -l < "$OUTFILE")
SIZE=$(wc -c < "$OUTFILE")
echo "Built page-bundle.js: $LINES lines, $SIZE bytes"
