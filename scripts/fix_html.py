import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "index.html"
s = p.read_text(encoding="utf-8")

for old, new in [
    ("\u2014", "-"),
    ("\u2013", "-"),
    ("\u2026", "..."),
    ("\u00b7", "-"),
    ("\u00d7", "x"),
    ("â€”", "-"),
    ("â€¦", "..."),
    ("Â·", "-"),
    ("Ã—", "x"),
    ("âˆ'1", "-1"),
]:
    s = s.replace(old, new)

note = (
    "GPU-facing tris (instances x geometry). Fur uses stacked shell layers with alpha - "
    "overdraw can exceed these tri bands. Three tiers match the Apple device matrix; "
    "hover a row for models."
)
close = chr(60) + "/" + "div" + chr(62)
s = re.sub(
    r'<div class="poly-hud-note">.*?</div>',
    "<div class=\"poly-hud-note\">" + note + close,
    s,
    count=1,
    flags=re.S,
)

p.write_text(s, encoding="utf-8")
print("fixed", p)
