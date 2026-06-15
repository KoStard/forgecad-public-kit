#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///

"""Summarize a ForgeCAD inspection manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_manifest(path_arg: str) -> tuple[Path, dict[str, Any]]:
    path = Path(path_arg).expanduser()
    if path.is_dir():
        path = path / "manifest.json"
    if not path.exists():
        raise SystemExit(f"manifest not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        return path, json.load(handle)


def fmt_num(value: Any, digits: int = 2) -> str:
    if isinstance(value, (int, float)) and value == value and value not in (float("inf"), float("-inf")):
        return f"{value:.{digits}f}"
    if value is None:
        return "null"
    return str(value)


def dimensions(scene: dict[str, Any]) -> str:
    bbox = scene.get("bbox") or {}
    mn = bbox.get("min")
    mx = bbox.get("max")
    if not (isinstance(mn, list) and isinstance(mx, list) and len(mn) >= 3 and len(mx) >= 3):
        return "unknown"
    size = [mx[i] - mn[i] for i in range(3)]
    return " x ".join(fmt_num(v, 1) for v in size)


def evidence_keys(manifest: dict[str, Any]) -> list[str]:
    bundle = manifest.get("bundle") or {}
    emitted = bundle.get("evidenceEmitted")
    if isinstance(emitted, list) and emitted:
        return [str(item) for item in emitted]
    evidence = manifest.get("evidence") or {}
    return sorted(evidence.keys())


def object_names(manifest: dict[str, Any]) -> list[str]:
    scene = manifest.get("scene") or {}
    objects = scene.get("objects") or []
    names: list[str] = []
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        name = obj.get("name") or obj.get("id")
        if name:
            names.append(str(name))
    return names


def print_header(manifest_path: Path, manifest: dict[str, Any]) -> None:
    source = manifest.get("source") or {}
    bundle = manifest.get("bundle") or {}
    scene = manifest.get("scene") or {}
    generator = manifest.get("generator") or {}
    print(f"Manifest: {manifest_path}")
    print(f"Command:  {generator.get('command', 'unknown')}")
    if generator.get("forgecadVersion"):
        print(f"Version:  {generator['forgecadVersion']}")
    print(f"Source:   {source.get('entryFile', 'unknown')}")
    requested = bundle.get("evidenceRequested") or evidence_keys(manifest)
    print(f"Evidence: requested={requested} emitted={evidence_keys(manifest)}")
    print(f"Filters:  {bundle.get('filters', {})}")
    print(f"Scene:    objects={len(scene.get('objects') or [])} size={dimensions(scene)} volume={fmt_num(scene.get('volume'), 1)}")
    names = object_names(manifest)
    if names:
        preview = ", ".join(names[:12])
        suffix = "" if len(names) <= 12 else f", ... (+{len(names) - 12})"
        print(f"Objects:  {preview}{suffix}")


def print_collisions(evidence: dict[str, Any]) -> None:
    collisions = evidence.get("collisions")
    if not isinstance(collisions, dict):
        return
    findings = collisions.get("collisions") or []
    print("")
    print(f"Collisions: count={collisions.get('collisionCount', len(findings))}")
    for finding in findings[:12]:
        print(
            "  - "
            f"{finding.get('sourceName', finding.get('sourceId'))} vs "
            f"{finding.get('targetName', finding.get('targetId'))}: "
            f"overlapVolume={fmt_num(finding.get('overlapVolume'), 3)}"
        )
    if len(findings) > 12:
        print(f"  ... +{len(findings) - 12} more")
    warnings = collisions.get("warnings") or []
    for warning in warnings:
        print(f"  warning: {warning}")


def print_thickness(evidence: dict[str, Any]) -> None:
    thickness = evidence.get("thickness")
    if not isinstance(thickness, dict):
        return
    objects = thickness.get("objects") or []
    ranked = sorted(
        [obj for obj in objects if isinstance(obj, dict)],
        key=lambda obj: (
            -(obj.get("criticalAreaPercent") or 0),
            -(obj.get("warningAreaPercent") or 0),
            -(obj.get("unresolvedAreaPercent") or 0),
            obj.get("minThickness") if obj.get("minThickness") is not None else float("inf"),
        ),
    )
    print("")
    print(
        "Thickness: "
        f"objects={thickness.get('objectCount', len(objects))} "
        f"thresholds={thickness.get('options', {})}"
    )
    for obj in ranked[:12]:
        print(
            "  - "
            f"{obj.get('name', obj.get('id'))}: "
            f"min={fmt_num(obj.get('minThickness'))} "
            f"p05={fmt_num(obj.get('p05Thickness'))} "
            f"critical={fmt_num(obj.get('criticalAreaPercent'))}% "
            f"warning={fmt_num(obj.get('warningAreaPercent'))}% "
            f"unresolved={fmt_num(obj.get('unresolvedAreaPercent'))}%"
        )
    if len(ranked) > 12:
        print(f"  ... +{len(ranked) - 12} more")
    for warning in thickness.get("warnings") or []:
        print(f"  warning: {warning}")


def print_connectivity(evidence: dict[str, Any]) -> None:
    connectivity = evidence.get("connectivity")
    if not isinstance(connectivity, dict):
        return
    components = connectivity.get("components") or []
    print("")
    print(
        "Connectivity: "
        f"objects={connectivity.get('objectCount', 0)} "
        f"components={connectivity.get('componentCount', len(components))} "
        f"edges={len(connectivity.get('edges') or [])}"
    )
    for component in components[:12]:
        names = component.get("objectNames") or []
        print(f"  - component {component.get('index')}: bodies={component.get('bodyCount')} objects={names}")
    if len(components) > 12:
        print(f"  ... +{len(components) - 12} more")
    for warning in connectivity.get("warnings") or []:
        print(f"  warning: {warning}")


def print_distance(evidence: dict[str, Any]) -> None:
    distance = evidence.get("distance")
    if not isinstance(distance, dict):
        return
    objects = [obj for obj in distance.get("objects") or [] if isinstance(obj, dict)]
    ranked = sorted(objects, key=lambda obj: obj.get("rootDistance") or 0, reverse=True)
    print("")
    print(
        "Distance: "
        f"components={distance.get('componentCount', 0)} "
        f"root={distance.get('rootComponentIndex')} "
        f"maxRootDistance={fmt_num(distance.get('maxRootDistance'))}"
    )
    for obj in ranked[:12]:
        print(
            "  - "
            f"{obj.get('name', obj.get('id'))}: "
            f"component={obj.get('componentIndex')} "
            f"rootDistance={fmt_num(obj.get('rootDistance'))} "
            f"nearestGap={fmt_num(obj.get('nearestGap'))}"
        )
    if len(ranked) > 12:
        print(f"  ... +{len(ranked) - 12} more")
    for warning in distance.get("warnings") or []:
        print(f"  warning: {warning}")


def print_sections(evidence: dict[str, Any]) -> None:
    sections = evidence.get("sections")
    if not isinstance(sections, dict):
        return
    planes = sections.get("planes") or {}
    print("")
    print("Sections:")
    for plane_name in ("xy", "xz", "yz"):
        plane = planes.get(plane_name)
        if not isinstance(plane, dict):
            continue
        slices = plane.get("slices") or []
        path_counts = [s.get("pathCount") for s in slices if isinstance(s, dict)]
        areas = [s.get("area") for s in slices if isinstance(s, dict)]
        print(
            f"  - {plane_name}: slices={len(slices)} "
            f"pathCounts={path_counts} "
            f"areas={[fmt_num(area, 1) for area in areas]}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest_or_bundle", help="Path to manifest.json or its containing inspect bundle directory")
    parser.add_argument("--json", action="store_true", help="Print a compact JSON summary instead of text")
    args = parser.parse_args()

    manifest_path, manifest = load_manifest(args.manifest_or_bundle)
    evidence = manifest.get("evidence") or {}

    if args.json:
        scene = manifest.get("scene") or {}
        summary = {
            "manifest": str(manifest_path),
            "source": (manifest.get("source") or {}).get("entryFile"),
            "evidence": evidence_keys(manifest),
            "objectCount": len(scene.get("objects") or []),
            "dimensions": dimensions(scene),
            "volume": scene.get("volume"),
            "collisionCount": (evidence.get("collisions") or {}).get("collisionCount"),
            "connectivityComponents": (evidence.get("connectivity") or {}).get("componentCount"),
            "distanceMaxRootDistance": (evidence.get("distance") or {}).get("maxRootDistance"),
        }
        print(json.dumps(summary, indent=2))
        return

    print_header(manifest_path, manifest)
    print_collisions(evidence)
    print_thickness(evidence)
    print_connectivity(evidence)
    print_distance(evidence)
    print_sections(evidence)


if __name__ == "__main__":
    main()
