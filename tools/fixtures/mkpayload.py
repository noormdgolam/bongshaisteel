"""Build a save payload from the seed, with a marker in hero.title."""
import json, sys, pathlib

out, marker, seed_path = sys.argv[1], sys.argv[2], sys.argv[3]
seed = json.loads(pathlib.Path(seed_path).read_text(encoding="utf-8"))
seed.setdefault("text", {})["hero.title"] = marker
pathlib.Path(out).write_text(json.dumps({"content": seed}), encoding="utf-8")
print("wrote", out, "marker:", marker)
