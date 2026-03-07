#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = [
#   "cadquery==2.5.2",
# ]
# ///

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import cadquery as cq
except Exception as exc:
    raise SystemExit(
        "CadQuery is required for BREP export. Install it in the selected Python environment. "
        f"Import failed: {exc}"
    )


def combine_shapes(op: str, shapes: List["cq.Shape"]) -> "cq.Shape":
    if not shapes:
        raise ValueError("Boolean operation has no shapes")
    result = shapes[0]
    for shape in shapes[1:]:
        if op == "union":
            result = result.fuse(shape)
        elif op == "difference":
            result = result.cut(shape)
        elif op == "intersection":
            result = result.intersect(shape)
        else:
            raise ValueError(f"Unsupported boolean op: {op}")
    return result


def multiply_affine(lhs: List[List[float]], rhs: List[List[float]]) -> List[List[float]]:
    return [
        [sum(lhs[row][k] * rhs[k][col] for k in range(3)) for col in range(3)]
        for row in range(3)
    ]


def build_profile_transform_matrix(profile: Dict[str, Any]) -> Optional["cq.Matrix"]:
    matrix = [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
    ]
    has_transform = False

    for step in profile.get("transforms", []):
        has_transform = True
        if step["kind"] == "translate":
            step_matrix = [
                [1.0, 0.0, float(step["x"])],
                [0.0, 1.0, float(step["y"])],
                [0.0, 0.0, 1.0],
            ]
        elif step["kind"] == "rotate":
            radians = math.radians(float(step["degrees"]))
            cos_a = math.cos(radians)
            sin_a = math.sin(radians)
            step_matrix = [
                [cos_a, -sin_a, 0.0],
                [sin_a, cos_a, 0.0],
                [0.0, 0.0, 1.0],
            ]
        elif step["kind"] == "scale":
            step_matrix = [
                [float(step["x"]), 0.0, 0.0],
                [0.0, float(step["y"]), 0.0],
                [0.0, 0.0, 1.0],
            ]
        elif step["kind"] == "mirror":
            nx = float(step["normalX"])
            ny = float(step["normalY"])
            length = math.hypot(nx, ny)
            if length < 1e-12:
                step_matrix = [
                    [1.0, 0.0, 0.0],
                    [0.0, 1.0, 0.0],
                    [0.0, 0.0, 1.0],
                ]
            else:
                nx /= length
                ny /= length
                step_matrix = [
                    [1.0 - 2.0 * nx * nx, -2.0 * nx * ny, 0.0],
                    [-2.0 * ny * nx, 1.0 - 2.0 * ny * ny, 0.0],
                    [0.0, 0.0, 1.0],
                ]
        else:
            raise ValueError(f"Unsupported profile transform: {step['kind']}")
        matrix = multiply_affine(step_matrix, matrix)

    if not has_transform:
        return None

    return cq.Matrix([
        [matrix[0][0], matrix[0][1], 0.0, matrix[0][2]],
        [matrix[1][0], matrix[1][1], 0.0, matrix[1][2]],
        [0.0, 0.0, 1.0, 0.0],
    ])


def apply_profile_transforms(sketch: "cq.Sketch", profile: Dict[str, Any]) -> "cq.Sketch":
    matrix = build_profile_transform_matrix(profile)
    if matrix is None:
        return sketch
    faces = sketch.faces().vals()
    transformed = cq.Sketch()
    for face in faces:
        transformed = transformed.face(face.transformGeometry(matrix))
    return transformed.reset()


def apply_shape_affine(shape: "cq.Shape", matrix: "cq.Matrix") -> "cq.Shape":
    if hasattr(shape, "transformGeometry"):
        return shape.transformGeometry(matrix)
    return shape.transformShape(matrix)


def build_shape_scale_matrix(sx: float, sy: float, sz: float) -> "cq.Matrix":
    return cq.Matrix([
        [sx, 0.0, 0.0, 0.0],
        [0.0, sy, 0.0, 0.0],
        [0.0, 0.0, sz, 0.0],
    ])


def build_polygon_sketch(points: List[List[float]]) -> "cq.Sketch":
    if len(points) < 3:
        raise ValueError("Polygon profile needs at least 3 points")
    wire = cq.Wire.makePolygon([(float(x), float(y), 0.0) for x, y in points], close=True)
    face = cq.Face.makeFromWires(wire)
    return cq.Sketch().face(face).reset()


def build_sketch_from_face(face: "cq.Face") -> "cq.Sketch":
    return cq.Sketch().face(face).reset()


def build_clean_profile_face(profile: Dict[str, Any]) -> "cq.Face":
    solid = build_extruded_profile(profile, 1.0, False)
    top_faces = cq.Workplane(obj=solid).faces(">Z").vals()
    if not top_faces:
        raise ValueError("Failed to recover a profile face from the base shape")

    merged = top_faces[0]
    for face in top_faces[1:]:
        merged = merged.fuse(face)
    merged = merged.clean()

    faces = merged.Faces() if hasattr(merged, "Faces") else [merged]
    if len(faces) != 1:
        raise ValueError(f"Offset fallback expected 1 merged face, got {len(faces)}")
    return faces[0]


def build_profile_sketch(profile: Dict[str, Any]) -> "cq.Sketch":
    kind = profile["kind"]
    if kind == "rect":
        sketch = cq.Sketch().rect(profile["width"], profile["height"])
        if not profile["center"]:
            sketch = sketch.moved(cq.Location(cq.Vector(profile["width"] / 2, profile["height"] / 2, 0)))
        return apply_profile_transforms(sketch, profile)

    if kind == "roundedRect":
        radius = min(profile["radius"], profile["width"] / 2, profile["height"] / 2)
        sketch = cq.Sketch().rect(profile["width"], profile["height"])
        if radius > 1e-9:
            sketch = sketch.vertices().fillet(radius).reset()
        if not profile["center"]:
            sketch = sketch.moved(cq.Location(cq.Vector(profile["width"] / 2, profile["height"] / 2, 0)))
        return apply_profile_transforms(sketch, profile)

    if kind == "circle":
        return apply_profile_transforms(cq.Sketch().circle(profile["radius"]), profile)

    if kind == "polygon":
        return apply_profile_transforms(build_polygon_sketch(profile["points"]), profile)

    if kind == "boolean":
        sketches = [build_profile_sketch(item) for item in profile["profiles"]]
        if not sketches:
            raise ValueError("Profile boolean has no child profiles")
        result = sketches[0]
        for sketch in sketches[1:]:
            if profile["op"] == "union":
                result = result + sketch
            elif profile["op"] == "difference":
                result = result - sketch
            elif profile["op"] == "intersection":
                result = result * sketch
            else:
                raise ValueError(f"Unsupported profile boolean op: {profile['op']}")
        return apply_profile_transforms(result, profile)

    if kind == "offset":
        if profile["join"] != "Round":
            raise ValueError(f"Unsupported profile offset join: {profile['join']}")
        delta = float(profile["delta"])
        try:
            sketch = build_profile_sketch(profile["base"]).reset().wires().offset(delta)
        except Exception:
            face = build_clean_profile_face(profile["base"])
            outer_wires = face.outerWire().offset2D(delta, kind="arc")
            if len(outer_wires) != 1:
                raise ValueError(f"Offset fallback expected 1 outer wire, got {len(outer_wires)}")

            inner_wires = []
            for hole in face.innerWires():
                inner_wires.extend(hole.offset2D(-delta, kind="arc"))
            sketch = build_sketch_from_face(cq.Face.makeFromWires(outer_wires[0], inner_wires))
        return apply_profile_transforms(sketch, profile)

    raise ValueError(f"Unsupported profile kind: {kind}")


def with_profile_scale(profile: Dict[str, Any], sx: float, sy: float) -> Dict[str, Any]:
    clone = dict(profile)
    clone["transforms"] = [*profile.get("transforms", []), {"kind": "scale", "x": sx, "y": sy}]
    return clone


def build_extruded_profile(
    profile: Dict[str, Any],
    height: float,
    center: bool,
    scale_top: Optional[List[float]] = None,
) -> "cq.Shape":
    if profile["kind"] == "boolean":
        shapes = [build_extruded_profile(item, height, center, scale_top) for item in profile["profiles"]]
        return combine_shapes(profile["op"], shapes)

    if scale_top is None or (abs(scale_top[0] - 1.0) < 1e-9 and abs(scale_top[1] - 1.0) < 1e-9):
        sketch = build_profile_sketch(profile)
        return cq.Workplane("XY").placeSketch(sketch).extrude(height, both=center).val()

    z0 = -height / 2 if center else 0.0
    z1 = height / 2 if center else height
    bottom = build_profile_sketch(profile).moved(cq.Location(cq.Vector(0, 0, z0)))
    top = build_profile_sketch(with_profile_scale(profile, scale_top[0], scale_top[1])).moved(
        cq.Location(cq.Vector(0, 0, z1))
    )
    return cq.Workplane("XY").placeSketch(bottom, top).loft().val()


def build_revolved_profile(profile: Dict[str, Any], degrees: float) -> "cq.Shape":
    if profile["kind"] == "boolean":
        shapes = [build_revolved_profile(item, degrees) for item in profile["profiles"]]
        return combine_shapes(profile["op"], shapes)
    sketch = build_profile_sketch(profile)
    return cq.Workplane("XY").placeSketch(sketch).revolve(degrees, (0, 0, 0), (0, 1, 0)).val()


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
        return cq.Workplane("XY").sphere(plan["radius"]).val()
    if kind == "extrude":
        return build_extruded_profile(plan["profile"], plan["height"], plan["center"], plan.get("scaleTop"))
    if kind == "revolve":
        return build_revolved_profile(plan["profile"], plan["degrees"])
    if kind == "boolean":
        return combine_shapes(plan["op"], [build_shape(item) for item in plan["shapes"]])
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
            if step["kind"] == "scale":
                result = apply_shape_affine(
                    result,
                    build_shape_scale_matrix(float(step["x"]), float(step["y"]), float(step["z"])),
                )
                continue
            if step["kind"] == "rotateAround":
                pivot = (step["pivotX"], step["pivotY"], step["pivotZ"])
                axis_end = (
                    step["pivotX"] + step["axisX"],
                    step["pivotY"] + step["axisY"],
                    step["pivotZ"] + step["axisZ"],
                )
                result = result.rotate(pivot, axis_end, step["degrees"])
                continue
            if step["kind"] == "mirror":
                result = result.mirror((step["normalX"], step["normalY"], step["normalZ"]))
                continue
            raise ValueError(f"Unsupported transform step: {step['kind']}")
        return result
    raise ValueError(f"Unsupported plan kind: {kind}")


def parse_hex_color(value: Optional[str]) -> Optional["cq.Color"]:
    if not value:
        return None
    text = value.strip()
    if not text.startswith("#"):
        try:
            return cq.Color(text)
        except Exception:
            return None

    if len(text) == 7:
        try:
            r = int(text[1:3], 16) / 255.0
            g = int(text[3:5], 16) / 255.0
            b = int(text[5:7], 16) / 255.0
        except ValueError:
            return None
        return cq.Color(r, g, b)

    if len(text) == 4:
        try:
            r = int(text[1] * 2, 16) / 255.0
            g = int(text[2] * 2, 16) / 255.0
            b = int(text[3] * 2, 16) / 255.0
        except ValueError:
            return None
        return cq.Color(r, g, b)

    return None


def make_unique_name(name: Optional[str], index: int, used: set[str]) -> str:
    base = (name or "").strip() or f"Object {index + 1}"
    candidate = base
    suffix = 2
    while candidate in used:
        candidate = f"{base} ({suffix})"
        suffix += 1
    used.add(candidate)
    return candidate


def export_step_assembly(objects: List[Dict[str, Any]], output_path: Path) -> None:
    assy = cq.Assembly(name=output_path.stem or "ForgeCAD")
    used_names: set[str] = set()

    for index, obj in enumerate(objects):
        shape = build_shape(obj["plan"])
        assy.add(
            shape,
            name=make_unique_name(obj.get("name"), index, used_names),
            color=parse_hex_color(obj.get("color")),
        )

    assy.export(str(output_path), exportType="STEP")


def export_shapes(objects: List[Dict[str, Any]], output_path: Path, fmt: str) -> None:
    if not objects:
        raise ValueError("No exportable shapes were provided")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "step":
        export_step_assembly(objects, output_path)
        return
    shapes = [build_shape(obj["plan"]) for obj in objects]
    merged = shapes[0] if len(shapes) == 1 else cq.Compound.makeCompound(shapes)
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
