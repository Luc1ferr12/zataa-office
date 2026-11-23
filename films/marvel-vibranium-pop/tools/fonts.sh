#!/bin/sh
# Font film ini (SIL OFL 1.1, lihat CREDITS) tidak disimpan di git: Anton + Archivo Black dari github.com/google/fonts.
set -e
D=$(cd "$(dirname "$0")/.." && pwd)/fonts; mkdir -p "$D"
GF=https://github.com/google/fonts/raw/main/ofl
[ -s "$D/Anton-Regular.ttf" ] || curl -fsSL -o "$D/Anton-Regular.ttf" "$GF/anton/Anton-Regular.ttf"
[ -s "$D/ArchivoBlack-Regular.ttf" ] || curl -fsSL -o "$D/ArchivoBlack-Regular.ttf" "$GF/archivoblack/ArchivoBlack-Regular.ttf"
