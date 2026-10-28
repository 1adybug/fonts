"""Exhaustively compare every encoded glyph and variable tuple to the source."""
from concurrent.futures import ProcessPoolExecutor, as_completed
from fontlib import ROOT, CONFIG, source_for, verify_geometry, encode


def main():
    tasks = []
    for font in CONFIG["fonts"]:
        source = source_for(font)
        if font["kind"] == "official-woff2":
            tasks.extend((font, face["file"], [face]) for face in source["faces"])
        else:
            tasks.extend((font, original["file"], [face for face in source["faces"] if face["original"] == original["file"]]) for original in source["originals"])
    results = []
    with ProcessPoolExecutor(max_workers=3) as pool:
        jobs = [pool.submit(verify_geometry, task) for task in tasks]
        for index, job in enumerate(as_completed(jobs), 1):
            results.append(job.result())
            if index % 15 == 0 or index == len(jobs):
                print(f"Geometry verified: {index}/{len(jobs)} sources", flush=True)
    target = ROOT / "output/geometry.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(encode({"passed": True, "files": sum(r["files"] for r in results), "results": results}), encoding="utf8")
    print(f"All {sum(r['files'] for r in results)} WOFF2 files preserve glyphs, advances, hinting, line metrics and variable interpolation", flush=True)


if __name__ == "__main__":
    main()
