"""Shared deterministic font parsing and fidelity checks."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from functools import lru_cache
import json

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "font-config.json").read_text(encoding="utf8"))


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def encode(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def points(value):
    result = set()
    for part in value.split(","):
        bounds = part.strip().upper().removeprefix("U+").split("-")
        result.update(range(int(bounds[0], 16), int(bounds[-1], 16) + 1))
    return result


def unicode_range(values):
    values = sorted(values)
    if not values:
        return ""
    runs = []
    first = previous = values[0]
    for point in values[1:] + [0x110000]:
        if point != previous + 1:
            runs.append(f"U+{first:X}" if first == previous else f"U+{first:X}-{previous:X}")
            first = point
        previous = point
    return ", ".join(runs)


def axes(font):
    return [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in font["fvar"].axes]


def metrics(font):
    return [font["head"].unitsPerEm] + [getattr(font[t], a) for t, a in (
        ("hhea", "ascent"), ("hhea", "descent"), ("hhea", "lineGap"),
        ("OS/2", "sTypoAscender"), ("OS/2", "sTypoDescender"),
        ("OS/2", "sTypoLineGap"), ("OS/2", "usWinAscent"), ("OS/2", "usWinDescent"),
    )]


def glyph_signature(font, name):
    glyph = font["glyf"][name]
    coordinates, ends, flags = glyph.getCoordinates(font["glyf"])
    return (font["hmtx"][name], tuple(coordinates), tuple(ends), bytes(flags),
            font["vmtx"][name] if "vmtx" in font else None,
            glyph.program.getBytecode() if hasattr(glyph, "program") else b"")


def variations(font, name):
    return sorted(((tuple(sorted(v.axes.items())), tuple(v.coordinates))
                   for v in font["gvar"].variations.get(name, [])), key=repr)


def source_for(font):
    return json.loads((ROOT / "sources" / font["id"] / "source.json").read_text(encoding="utf8"))


def effective_points(font, original, cmap):
    result = set(cmap)
    composite = font.get("composite")
    if composite:
        with TTFont(ROOT / "sources" / font["id"] / composite["override"], lazy=True) as override:
            overrides = set(override.getBestCmap()) & points(composite["unicodeRange"])
        result = result - overrides if original == composite["base"] else result & overrides
    return result


@lru_cache
def native_info(font_id):
    font = next(f for f in CONFIG["fonts"] if f["id"] == font_id)
    source = source_for(font)
    base = ROOT / "sources" / font_id
    path = base / source["originals"][0]["file"] if source["originals"] else base / "files" / source["faces"][0]["file"]
    with TTFont(path) as face:
        instances = {face["name"].getDebugName(i.subfamilyNameID): i.coordinates["wght"] for i in face["fvar"].instances}
        return {"version": face["name"].getDebugName(5), "namedWeights": instances,
                "axes": {a.axisTag: {"min": a.minValue, "default": a.defaultValue, "max": a.maxValue} for a in face["fvar"].axes}}


def verify_geometry(task):
    font, original, entries = task
    base = ROOT / "sources" / font["id"]
    path = base / original if font["kind"] == "variable-ttf" else base / "files" / original
    with TTFont(path) as source:
        source_cmap = source.getBestCmap()
        signatures, variable = {}, {}
        locations = ([{"wght": w, "opsz": o} for w in [100, 400, 550, 700, 850] for o in [10, 16, 22]]
                     if "HVAR" in source and font.get("opticalSize") else [])
        source_sets = [source.getGlyphSet(location=location) for location in locations]
        advance_cache = {}
        mapped = set()
        for entry in entries:
            target = ROOT / "packages" / font["id"] / "files" / entry["file"]
            with TTFont(target) as actual:
                cmap = actual.getBestCmap()
                assert axes(actual) == axes(source), f"Weight axis changed: {target}"
                assert metrics(actual) == metrics(source), f"Line metrics changed: {target}"
                for tag in ("prep", "fpgm", "cvt ", "gasp", "avar"):
                    assert (tag in actual) == (tag in source), f"Missing table {tag}: {target}"
                    if tag in source:
                        assert actual[tag].compile(actual) == source[tag].compile(source), f"Changed table {tag}: {target}"
                if font["kind"] == "variable-ttf":
                    assert set(cmap) == points(entry["unicodeRange"]), f"Subset coverage changed: {target}"
                else:
                    assert cmap == source_cmap, f"Official font cmap changed: {target}"
                for point, name in cmap.items():
                    assert point in source_cmap, f"Invented codepoint: {point:X}"
                    expected = source_cmap[point]
                    if expected not in signatures:
                        signatures[expected] = glyph_signature(source, expected)
                        variable[expected] = variations(source, expected)
                    assert glyph_signature(actual, name) == signatures[expected], f"Glyph/hinting/advance changed: {target} U+{point:X}"
                    assert variations(actual, name) == variable[expected], f"Variable interpolation changed: {target} U+{point:X}"
                    mapped.add(point)
                # HVAR stores advance interpolation independently of gvar phantom
                # points. Verify it on the full native wght/opsz grid as well.
                for index, location in enumerate(locations):
                    actual_set = actual.getGlyphSet(location=location)
                    for point, name in cmap.items():
                        expected = source_cmap[point]
                        cache_key = (index, expected)
                        if cache_key not in advance_cache:
                            advance_cache[cache_key] = source_sets[index][expected].width
                        assert abs(actual_set[name].width - advance_cache[cache_key]) < 1e-6, f"HVAR advance changed: {target} U+{point:X} {location}"
        if font["kind"] == "variable-ttf":
            expected = effective_points(font, original, source_cmap)
            assert mapped == expected, f"Incomplete font coverage: {font['id']} {original}"
    return {"font": font["id"], "source": original, "files": len(entries), "characters": len(mapped)}
