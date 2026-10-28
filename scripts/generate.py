"""Reproduce the verified font packages from this repository's pinned sources."""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from importlib.metadata import version
import json
import re

from fontTools import subset
from fontTools.ttLib import TTFont

from fontlib import ROOT, CONFIG, digest, encode, points, unicode_range, axes, source_for, native_info, effective_points


def partition_plans(font, source, ranges):
    base = ROOT / "sources" / font["id"]
    result = []
    for original in source["originals"]:
        path = base / original["file"]
        with TTFont(path, lazy=True) as face:
            chars = effective_points(font, path.name, face.getBestCmap())
        is_cjk = lambda c: 0x3400 <= c <= 0x9FFF or 0xF900 <= c <= 0xFAFF or 0x20000 <= c <= 0x323AF
        remaining = {c for c in chars if is_cjk(c)}
        prefix = original.get("prefix", "sc" if "_SC" in path.name else "font")
        groups = []
        if chars - remaining:
            groups.append((f"{prefix}-text", chars - remaining))
        for index, bucket in enumerate(reversed(ranges)):
            group = remaining & bucket
            if group:
                groups.append((f"{prefix}-cn-{index:03}", group))
                remaining -= group
        rest = sorted(remaining)
        groups.extend((f"{prefix}-extra-{i // 256:03}", set(rest[i:i + 256])) for i in range(0, len(rest), 256))
        result.extend({"group": group, "original": path.name, "unicodeRange": unicode_range(chars)} for group, chars in groups)
    return result


def subset_to_file(path, characters, temporary):
    with TTFont(path, lazy=True, recalcTimestamp=False) as face:
        options = subset.Options()
        options.flavor = "woff2"
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_languages = ["*"]
        options.name_legacy = True
        options.glyph_names = True
        options.hinting = True
        options.legacy_kern = True
        options.notdef_outline = True
        options.recommended_glyphs = True
        options.recalc_bounds = False
        options.recalc_timestamp = False
        options.canonical_order = True
        options.bidi_closure = False
        options.ignore_missing_unicodes = False
        cutter = subset.Subsetter(options=options)
        cutter.populate(unicodes=sorted(characters))
        cutter.subset(face)
        face.flavor = "woff2"
        temporary.parent.mkdir(parents=True, exist_ok=True)
        face.save(temporary)


def generate_face(task):
    font_id, entry = task
    path = ROOT / "sources" / font_id / entry["original"]
    temporary = ROOT / "output/generation" / font_id / entry["file"]
    subset_to_file(path, points(entry["unicodeRange"]), temporary)
    assert digest(temporary) == entry["sha256"], f"Generated font differs from verified baseline: {temporary}"
    target = ROOT / "packages" / font_id / "files" / entry["file"]
    target.write_bytes(temporary.read_bytes())
    return target.name


def artifacts(font, source):
    css = f'/* {font["family"]}. Copyright {font["copyright"]}. See {font["licenseFile"]}. */\n'
    low, high = font["axis"]["min"], font["axis"]["max"]
    for entry in source["faces"]:
        css += (f'@font-face {{\n  font-family: "{font["family"]}";\n  font-style: normal;\n'
                f'  font-weight: {low} {high};\n  font-display: swap;\n'
                f'  src: url("./files/{entry["file"]}") format("woff2");\n'
                f'  unicode-range: {entry["unicodeRange"]};\n}}\n')
    native = native_info(font["id"])
    variable_axes = {tag: {k: f"{axis[k]:g}" for k in ("default", "min", "max")} for tag, axis in native["axes"].items()}
    variable_axes["wght"]["step"] = "1"
    metadata = {
        "id": font["id"], "family": font["family"], "version": font["fontVersion"] + f' / {native["version"]}',
        "category": "sans-serif", "styles": ["normal"],
        "weights": sorted(set(native["namedWeights"].values())),
        "variable": variable_axes,
        "namedWeights": native["namedWeights"], "files": len(source["faces"]),
        "unicodeCoverage": len(set().union(*(points(e["unicodeRange"]) for e in source["faces"]))),
        "license": {"type": "custom", "file": font["licenseFile"], "attribution": font["copyright"]},
        "source": font["homepage"], "type": "vendor",
    }
    package = {
        "name": font["name"], "version": CONFIG["version"],
        "description": f'Self-host {font["family"]} variable font with Unicode-range WOFF2 subsets.',
        "main": "index.css", "style": "index.css", "types": "index.d.css.ts",
        "sideEffects": ["**/*.css"], "license": f'SEE LICENSE IN {font["licenseFile"]}',
        "homepage": font["homepage"], "keywords": ["font", "variable", "woff2", "css", "self-hosted", font["id"]],
        "publishConfig": {"access": "public", "registry": "https://registry.npmjs.org/"},
        "files": ["index.css", "wght.css", "index.d.css.ts", "metadata.json", "unicode.json", "sources.json", "README.md", "LICENSE", *(["LICENSE.pdf"] if font["licenseFile"].endswith(".pdf") else []), "files/*.woff2"],
        "exports": {
            ".": {"types": "./index.d.css.ts", "sass": "./index.css", "default": "./index.css"},
            "./wght": {"types": "./index.d.css.ts", "sass": "./wght.css", "default": "./wght.css"},
            "./wght.css": {"types": "./index.d.css.ts", "sass": "./wght.css", "default": "./wght.css"},
            "./files/*": "./files/*", "./metadata.json": "./metadata.json", "./unicode.json": "./unicode.json",
            "./sources.json": "./sources.json", "./package.json": "./package.json", "./LICENSE": "./LICENSE",
            **({"./LICENSE.pdf": "./LICENSE.pdf"} if font["licenseFile"].endswith(".pdf") else {}),
        },
    }
    provenance = {
        "family": font["family"], "fontVersion": font["fontVersion"], "officialPage": font["homepage"],
        "upstream": source["upstream"], "originals": source["originals"], "license": source["license"],
        "generation": {"kind": font["kind"], **({"fonttools": "4.68.0", "brotli": "1.2.1", "partitionSource": "@fontsource-variable/noto-sans-sc@5.3.1/wght.css"} if font["kind"] == "variable-ttf" else {})},
        "files": [{k: e[k] for k in ("file", "bytes", "sha256", "unicodeRange")} for e in source["faces"]],
    }
    readme = f'''# {font["name"]}

Self-host **{font["family"]}** with a variable weight axis and Unicode-range WOFF2 subsets.

```sh
npm install {font["name"]}
```

Import one of these equivalent CSS entry points in your application:

```js
import "{font["name"]}";
// Or: import "{font["name"]}/wght";
// Or: import "{font["name"]}/wght.css";
```

```css
body {{
  font-family: "{font["family"]}", sans-serif;
  font-weight: {font["axis"]["default"]};
}}
```

## Font data

- Weight axis: **{low}–{high}**, native default **{font["axis"]["default"]}**; normal style.
- **{len(source["faces"])}** local WOFF2 files, loaded by character range.
- Font version: {font["fontVersion"]}.
- No runtime dependencies or install scripts; no external font service requests.
- `metadata.json`, `unicode.json`, `sources.json`, and `files/*` are exported.

{'MiSans Regular, Medium and Demibold use native weights 330, 380 and 450. UI weight remapping belongs in the consuming application.\n' if font["id"] == "mi-sans" else ''}{'Optical size axis: **10–22**, native default **16**. Both the weight and optical size axes are preserved; the browser can use automatic optical sizing.\n' if font.get("opticalSize") else ''}
## Copyright and license

Copyright {font["copyright"]}. Font rights remain with the original copyright holder.
The original vendor license is included as **{font["licenseFile"]}**; it is not an MIT or SIL OFL font license.
This is an independently maintained package, not an official vendor package.

[Official font source]({font["homepage"]}). File hashes and original download details are recorded in `sources.json`.
'''
    result = {"package.json": encode(package), "index.css": css, "wght.css": css, "index.d.css.ts": "export {};\n", "metadata.json": encode(metadata), "unicode.json": encode({e["file"]: e["unicodeRange"] for e in source["faces"]}), "sources.json": encode(provenance), "README.md": readme}
    if font["licenseFile"].endswith(".pdf"):
        result["LICENSE"] = f'Copyright {font["copyright"]}.\nThe complete original font license is in LICENSE.pdf.\nOfficial source: {font["homepage"]}\n'
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    assert not (args.check and args.force)
    assert version("fonttools") == "4.68.0" and version("Brotli") == "1.2.1"
    partition = ROOT / "node_modules" / CONFIG["partition"]["package"] / CONFIG["partition"]["file"]
    assert digest(partition) == CONFIG["partition"]["sha256"], "Character grouping source changed"
    ranges = [points(s) for s in re.findall(r"unicode-range:\s*([^;]+);", partition.read_text(encoding="utf8"))]
    tasks = []
    for font in CONFIG["fonts"]:
        source = source_for(font)
        base = ROOT / "sources" / font["id"]
        assert digest(base / source["license"]["file"]) == source["license"]["sha256"]
        for entry in source["originals"]:
            assert digest(base / entry["file"]) == entry["sha256"]
        assert len(source["faces"]) == font["expectedSlices"]
        if font["kind"] == "variable-ttf":
            derived = partition_plans(font, source, ranges)
            expected = [{k: e[k] for k in ("group", "original", "unicodeRange")} for e in source["faces"]]
            assert derived == expected, f"Pinned character partition changed: {font['id']}"
        for entry in source["faces"]:
            target = ROOT / "packages" / font["id"] / "files" / entry["file"]
            valid = target.is_file() and digest(target) == entry["sha256"]
            if font["kind"] == "official-woff2":
                original = base / "files" / entry["file"]
                assert digest(original) == entry["sha256"]
                if not valid or args.force:
                    assert not args.check, f"Missing or stale font: {target}"
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(original.read_bytes())
            elif args.force or not valid:
                assert not args.check, f"Missing or stale font: {target}"
                tasks.append((font["id"], entry))
    if tasks:
        print(f"Reproducing {len(tasks)} slices against the verified SHA-256 baseline", flush=True)
        with ProcessPoolExecutor(max_workers=2) as pool:
            jobs = [pool.submit(generate_face, t) for t in tasks]
            for index, job in enumerate(as_completed(jobs), 1):
                job.result()
                if index % 20 == 0 or index == len(jobs):
                    print(f"Verified {index}/{len(jobs)} regenerated files", flush=True)
    for font in CONFIG["fonts"]:
        source = source_for(font)
        package = ROOT / "packages" / font["id"]
        package.mkdir(parents=True, exist_ok=True)
        for name, content in artifacts(font, source).items():
            target = package / name
            if args.check:
                assert target.read_bytes() == content.encode("utf8"), f"Generated file drift: {target}"
            else:
                target.write_bytes(content.encode("utf8"))
        original = ROOT / "sources" / font["id"] / font["licenseFile"]
        target = package / font["licenseFile"]
        if args.check:
            assert target.read_bytes() == original.read_bytes(), f"License bytes changed: {target}"
        else:
            target.write_bytes(original.read_bytes())
        assert {p.name for p in (package / "files").iterdir()} == {e["file"] for e in source["faces"]}
        print(f'{font["name"]}: {len(source["faces"])} files, verified', flush=True)


if __name__ == "__main__":
    main()
