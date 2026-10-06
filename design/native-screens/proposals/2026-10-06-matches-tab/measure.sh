#!/bin/bash
# Measures each board's natural height with headless Chrome and writes heights.json.
# Usage: ./measure.sh && python3 generate.py heights.json
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
echo "{" > "$HERE/heights.json"
first=1
for f in "$HERE"/project/P-MT-*.dc.html; do
  b="$(basename "$f")"
  python3 - "$f" "$TMP/$b" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = s.replace('<script src="./support.js"></script>', '')
s = re.sub(r'(<div style="width: \d+px; )height: \d+px;', r'\1height: auto;', s, count=1)
s = s.replace('</body>', '<script>window.addEventListener("load",()=>setTimeout(()=>{document.body.setAttribute("data-h",document.querySelector("x-dc > div").scrollHeight)},300))</script></body>')
open(sys.argv[2], 'w').write(s)
PY
  h=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=6000 --dump-dom "file://$TMP/$b" 2>/dev/null | grep -o 'data-h="[0-9]*"' | grep -o '[0-9]*')
  [ $first -eq 0 ] && echo "," >> "$HERE/heights.json"
  first=0
  printf '  "%s": %s' "$b" "$h" >> "$HERE/heights.json"
done
echo "" >> "$HERE/heights.json"
echo "}" >> "$HERE/heights.json"
rm -rf "$TMP"
cat "$HERE/heights.json"
