#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

try:
    import cadquery as cq
except Exception as exc:
    raise SystemExit(
        "CadQuery is required for BREP export. Install it in the selected Python environment. "
        f"Import failed: {exc}"
    )


def apply_profile_transforms(wp: "cq.Workplane", profile: Dict[str, Any]) -> "cq.Workplane":
    for step in profile.get("transforms", []):
        if step["kind"] == "translate":
            wp = wp.transformed(offset=cq.Vector(step["x"], step["y"], 0))
        elif step["kind"] == "rotate":
            wp = wp.transformed(rotate=cq.Vector(0, 0, step["degrees"]))
        else:
            raise ValueError(f"Unsupported profile transform: {step['kind']}")
    return wp


def build_profile_workplane(profile: Dict[str, Any]) -> "cq.Workplane":
    wp = cq.Workplane("XY")
    wp = apply_profile_transforms(wp, profile)
    if profile["kind"] == "rect":
        return wp.rect(profile["width"], profile["height"], centered=profile["center"])
    if profile["kind"] == "circle":
        return wp.circle(profile["radius"])
    raise ValueError(f"Unsupported profile kind: {profile['kind']}")


def build_shape(plan: Dict[str, Any]) -> "cq.Shape":
    kind = plan["kind"]
    if kind == "box":
        centered = (plan["center"], plan["center"], plan["center"])
        return cq.Workplane("XY").box(plan["x"], plan["y"], plan["z"], centered=centered).val()
    if kind == "cylinder":
        radius_top = plan.get("radiusTop")
        if radius_top is None or abs(radius_top - plan["radius"]) < 1e-9:
            return cq.Workplane("XY").circle(plan["radius"]).extrude(plan["height"], both=plan["center"]).val()
        shape = cq.Solid.makeCone(plan["radius"], radius_top, plan["height"])
        if plan["center"]:
            shape = shape.translate((0, 0, -plan["height"] / 2))
        return shape
    if kind == "sphere":
        return cq.Solid.makeSphere(plan["radius"])
    if kind == "extrude":
        wp = build_profile_workplane(plan["profile"])
        return wp.extrude(plan["height"], both=plan["center"]).val()
    if kind == "revolve":
        wp = build_profile_workplane(plan["profile"])
        return wp.revolve(plan["degrees"], (0, 0, 0), (0, 1, 0)).val()
    if kind == "boolean":
        shapes = [build_shape(item) for item in plan["shapes"]]
        if not shapes:
            raise ValueError("Boolean plan has no shapes")
        result = shapes[0]
        for shape in shapes[1:]:
            if plan["op"] == "union":
                result = result.fuse(shape)
            elif plan["op"] == "difference":
                result = result.cut(shape)
            elif plan["op"] == "intersection":
                result = result.intersect(shape)
            else:
                raise ValueError(f"Unsupported boolean op: {plan['op']}")
        return result
    if kind == "transform":
        result = build_shape(plan["base"])
        for step in plan["steps"]:
            if step["kind"] == "translate":
                result = result.translate((step["x"], step["y"], step["z"]))
                continue
            if step["kind"] == "rotate":
                if abs(step["xDeg"]) > 1e-9:
                    result = result.rotate((0, 0, 0), (1, 0, 0), step["xDeg"])
                if abs(step["yDeg"]) > 1e-9:
                    result = result.rotate((0, 0, 0), (0, 1, 0), step["yDeg"])
                if abs(step["zDeg"]) > 1e-9:
                    result = result.rotate((0, 0, 0), (0, 0, 1), step["zDeg"])
                continue
            raise ValueError(f"Unsupported transform step: {step['kind']}")
        return result
    raise ValueError(f"Unsupported plan kind: {kind}")


def export_shapes(objects: List[Dict[str, Any]], output_path: Path, fmt: str) -> None:
    shapes = [build_shape(obj["plan"]) for obj in objects]
    if not shapes:
        raise ValueError("No exportable shapes were provided")
    merged = shapes[0] if len(shapes) == 1 else cq.Compound.makeCompound(shapes)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "step":
        merged.exportStep(str(output_path))
        return
    if fmt == "brep":
        merged.exportBrep(str(output_path))
        return
    raise ValueError(f"Unsupported export format: {fmt}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--format", required=True, choices=["step", "brep"])
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text())
    export_shapes(payload["objects"], Path(args.output), args.format)


if __name__ == "__main__":
    main()
