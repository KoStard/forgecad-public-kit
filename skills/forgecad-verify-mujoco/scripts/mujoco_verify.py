#!/usr/bin/env python3
"""Verify a ForgeCAD MJCF package by running MuJoCo dynamics and rendering frames."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path
from typing import Iterable


def parse_actuator(value: str) -> tuple[str, float]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("expected NAME=VALUE")
    name, raw = value.split("=", 1)
    name = name.strip()
    if not name:
        raise argparse.ArgumentTypeError("actuator name is empty")
    try:
        ctrl = float(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid actuator value {raw!r}") from exc
    return name, ctrl


def parse_joint_range(value: str) -> tuple[str, float, float]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("expected JOINT=MIN:MAX")
    name, raw_range = value.split("=", 1)
    name = name.strip()
    if not name:
        raise argparse.ArgumentTypeError("joint name is empty")
    if ":" not in raw_range:
        raise argparse.ArgumentTypeError("expected range as MIN:MAX")
    raw_min, raw_max = raw_range.split(":", 1)
    try:
        min_value = float(raw_min)
        max_value = float(raw_max)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid numeric range {raw_range!r}") from exc
    if min_value > max_value:
        raise argparse.ArgumentTypeError(f"range minimum {min_value} is greater than maximum {max_value}")
    return name, min_value, max_value


def cycles_from_radians(value: float) -> float:
    return value / math.tau


def resolve_scene(path: Path) -> Path:
    if path.is_file():
        return path
    scene = path / "scene.xml"
    if scene.is_file():
        return scene
    raise SystemExit(f"Could not find scene.xml at {path}")


def geom_name(mujoco, model, geom_id: int) -> str:
    return mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, geom_id) or f"geom#{geom_id}"


def joint_name(mujoco, model, joint_id: int) -> str:
    return mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, joint_id) or f"joint#{joint_id}"


def contact_counts(mujoco, model, data, limit: int) -> list[dict[str, object]]:
    counts: Counter[tuple[str, str]] = Counter()
    for i in range(data.ncon):
        contact = data.contact[i]
        a = geom_name(mujoco, model, int(contact.geom1))
        b = geom_name(mujoco, model, int(contact.geom2))
        if a > b:
            a, b = b, a
        counts[(a, b)] += 1
    return [{"geom1": a, "geom2": b, "count": count} for (a, b), count in counts.most_common(limit)]


def qpos_for_joint(model, joint_id: int) -> float:
    return float(model.jnt_qposadr[joint_id])


def first_freejoint(mujoco, model) -> int | None:
    for joint_id in range(model.njnt):
        if model.jnt_type[joint_id] == mujoco.mjtJoint.mjJNT_FREE:
            return joint_id
    return None


def make_camera(mujoco, lookat: Iterable[float], distance: float, azimuth: float, elevation: float):
    camera = mujoco.MjvCamera()
    camera.type = mujoco.mjtCamera.mjCAMERA_FREE
    camera.lookat[:] = list(lookat)
    camera.distance = distance
    camera.azimuth = azimuth
    camera.elevation = elevation
    return camera


def render_frame(mujoco, renderer, model, data, camera, label: str, path: Path) -> None:
    from PIL import Image, ImageDraw

    mujoco.mj_forward(model, data)
    renderer.update_scene(data, camera=camera)
    image = Image.fromarray(renderer.render())
    draw = ImageDraw.Draw(image)
    draw.rectangle((12, 12, min(image.width - 12, 1120), 72), fill=(255, 255, 255))
    draw.text((22, 22), label, fill=(0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def render_camera_preview_grid(mujoco, renderer, model, data, args, path: Path) -> str:
    from PIL import Image, ImageDraw

    images = []
    for azimuth in args.camera_preview_azimuths:
        camera = make_camera(mujoco, args.camera_lookat, args.camera_distance, azimuth, args.camera_elevation)
        mujoco.mj_forward(model, data)
        renderer.update_scene(data, camera=camera)
        image = Image.fromarray(renderer.render())
        draw = ImageDraw.Draw(image)
        label = f"azimuth {azimuth:g}"
        draw.rectangle((12, 12, min(image.width - 12, 260), 52), fill=(255, 255, 255))
        draw.text((22, 22), label, fill=(0, 0, 0))
        images.append(image)

    if not images:
        return ""

    cols = min(3, len(images))
    rows = int(math.ceil(len(images) / cols))
    width, height = images[0].size
    canvas = Image.new("RGB", (cols * width, rows * height), (255, 255, 255))
    for index, image in enumerate(images):
        canvas.paste(image, ((index % cols) * width, (index // cols) * height))

    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)
    return str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package_or_scene", type=Path, help="MJCF package directory or scene.xml path")
    parser.add_argument("--settle-seconds", type=float, default=2.0)
    parser.add_argument("--seconds", type=float, default=6.0)
    parser.add_argument("--actuator", action="append", type=parse_actuator, default=[], help="Control as NAME=VALUE")
    parser.add_argument("--watch-joint", action="append", default=[], help="Joint name whose motion should be reported")
    parser.add_argument("--assert-min-joint-delta", type=float, default=0.0)
    parser.add_argument(
        "--expect-drive-delta",
        action="append",
        type=parse_joint_range,
        default=[],
        help="Require signed post-settle joint delta as JOINT=MIN:MAX in MuJoCo qpos units",
    )
    parser.add_argument(
        "--expect-drive-cycles",
        action="append",
        type=parse_joint_range,
        default=[],
        help="Require signed post-settle revolute joint travel as JOINT=MIN:MAX in cycles/turns",
    )
    parser.add_argument(
        "--expect-final-qvel",
        action="append",
        type=parse_joint_range,
        default=[],
        help="Require final joint velocity as JOINT=MIN:MAX in MuJoCo qvel units",
    )
    parser.add_argument("--max-root-drop", type=float, default=0.02, help="Maximum allowed root Z drop in meters for free-root models")
    parser.add_argument("--contact-top-n", type=int, default=12)
    parser.add_argument("--render-dir", type=Path)
    parser.add_argument("--fps", type=float, default=6.0)
    parser.add_argument("--camera-lookat", nargs=3, type=float, default=[0.0, 0.0, 0.0])
    parser.add_argument("--camera-distance", type=float, default=0.35)
    parser.add_argument("--camera-azimuth", type=float, default=-45.0)
    parser.add_argument("--camera-elevation", type=float, default=-20.0)
    parser.add_argument(
        "--camera-preview-grid",
        action="store_true",
        help="Write a labeled azimuth grid to render-dir/camera_preview_grid.png before choosing/reporting a view",
    )
    parser.add_argument(
        "--camera-preview-azimuths",
        nargs="+",
        type=float,
        default=[-90, 0, 45, 90, 135, 180],
        help="Azimuths in degrees to include in --camera-preview-grid",
    )
    args = parser.parse_args()
    if args.camera_preview_grid and not args.render_dir:
        parser.error("--camera-preview-grid requires --render-dir")

    import mujoco

    scene_path = resolve_scene(args.package_or_scene)
    model = mujoco.MjModel.from_xml_path(str(scene_path))
    data = mujoco.MjData(model)

    actuator_ids: list[tuple[str, int, float]] = []
    for name, ctrl in args.actuator:
        actuator_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, name)
        if actuator_id < 0:
            raise SystemExit(f"Unknown actuator {name!r}")
        actuator_ids.append((name, actuator_id, ctrl))

    watch_names = list(dict.fromkeys(
        args.watch_joint
        + [name for name, _min_value, _max_value in args.expect_drive_delta]
        + [name for name, _min_value, _max_value in args.expect_drive_cycles]
        + [name for name, _min_value, _max_value in args.expect_final_qvel]
    ))
    watch_joints: list[tuple[str, int, int, int]] = []
    for name in watch_names:
        joint_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
        if joint_id < 0:
            raise SystemExit(f"Unknown joint {name!r}")
        watch_joints.append((name, joint_id, int(model.jnt_qposadr[joint_id]), int(model.jnt_dofadr[joint_id])))

    free_joint_id = first_freejoint(mujoco, model)
    free_qadr = int(model.jnt_qposadr[free_joint_id]) if free_joint_id is not None else None

    renderer = None
    camera = None
    if args.render_dir:
        renderer = mujoco.Renderer(model, height=900, width=1200)
        camera = make_camera(mujoco, args.camera_lookat, args.camera_distance, args.camera_azimuth, args.camera_elevation)

    def snapshot(label: str) -> dict[str, object]:
        root_pos = None
        if free_qadr is not None:
            root_pos = [float(x) for x in data.qpos[free_qadr : free_qadr + 3]]
        return {
            "label": label,
            "time": float(data.time),
            "root_pos": root_pos,
            "watched": {
                name: {"qpos": float(data.qpos[qadr]), "qvel": float(data.qvel[dadr])}
                for name, _joint_id, qadr, dadr in watch_joints
            },
            "ncon": int(data.ncon),
            "contacts": contact_counts(mujoco, model, data, args.contact_top_n),
        }

    mujoco.mj_forward(model, data)
    initial = snapshot("initial")
    initial_joint_qpos = {name: float(data.qpos[qadr]) for name, _joint_id, qadr, _dadr in watch_joints}
    initial_root_z = float(data.qpos[free_qadr + 2]) if free_qadr is not None else None
    if renderer and camera:
        camera_preview_grid = None
        if args.camera_preview_grid:
            camera_preview_grid = render_camera_preview_grid(
                mujoco,
                renderer,
                model,
                data,
                args,
                args.render_dir / "camera_preview_grid.png",
            )
        render_frame(mujoco, renderer, model, data, camera, "initial", args.render_dir / "00_initial.png")
    else:
        camera_preview_grid = None

    settle_steps = max(0, int(round(args.settle_seconds / model.opt.timestep)))
    for _ in range(settle_steps):
        mujoco.mj_step(model, data)
    settled = snapshot("settled")
    settled_joint_qpos = {name: float(data.qpos[qadr]) for name, _joint_id, qadr, _dadr in watch_joints}
    if renderer and camera:
        render_frame(mujoco, renderer, model, data, camera, "settled", args.render_dir / "01_settled.png")

    total_steps = max(0, int(round(args.seconds / model.opt.timestep)))
    frame_interval = max(1, int(round((1.0 / max(args.fps, 1e-9)) / model.opt.timestep)))
    rendered = []
    for step in range(total_steps):
        for _name, actuator_id, ctrl in actuator_ids:
            data.ctrl[actuator_id] = ctrl
        mujoco.mj_step(model, data)
        if renderer and camera and step % frame_interval == 0:
            frame_path = args.render_dir / f"drive_{step:06d}.png"
            render_frame(mujoco, renderer, model, data, camera, f"drive t={data.time:.2f}s", frame_path)
            rendered.append(str(frame_path))

    final = snapshot("final")
    if renderer and camera:
        render_frame(mujoco, renderer, model, data, camera, "final", args.render_dir / "99_final.png")
        renderer.close()

    joint_delta = {
        name: float(data.qpos[qadr]) - initial_joint_qpos[name]
        for name, _joint_id, qadr, _dadr in watch_joints
    }
    joint_drive_delta = {
        name: float(data.qpos[qadr]) - settled_joint_qpos[name]
        for name, _joint_id, qadr, _dadr in watch_joints
    }
    joint_cycles = {name: cycles_from_radians(value) for name, value in joint_delta.items()}
    joint_drive_cycles = {name: cycles_from_radians(value) for name, value in joint_drive_delta.items()}
    final_joint_qvel = {
        name: float(data.qvel[dadr])
        for name, _joint_id, _qadr, dadr in watch_joints
    }
    root_drop = None
    if free_qadr is not None and initial_root_z is not None:
        root_drop = initial_root_z - float(data.qpos[free_qadr + 2])

    summary = {
        "scene": str(scene_path),
        "counts": {"nbody": int(model.nbody), "njnt": int(model.njnt), "nu": int(model.nu), "ngeom": int(model.ngeom)},
        "free_joint": joint_name(mujoco, model, free_joint_id) if free_joint_id is not None else None,
        "actuators": [{"name": name, "ctrl": ctrl} for name, _actuator_id, ctrl in actuator_ids],
        "joint_delta": joint_delta,
        "joint_drive_delta": joint_drive_delta,
        "joint_cycles": joint_cycles,
        "joint_drive_cycles": joint_drive_cycles,
        "final_joint_qvel": final_joint_qvel,
        "expectations": {
            "drive_delta": [
                {"joint": name, "min": min_value, "max": max_value}
                for name, min_value, max_value in args.expect_drive_delta
            ],
            "drive_cycles": [
                {"joint": name, "min": min_value, "max": max_value}
                for name, min_value, max_value in args.expect_drive_cycles
            ],
            "final_qvel": [
                {"joint": name, "min": min_value, "max": max_value}
                for name, min_value, max_value in args.expect_final_qvel
            ],
        },
        "root_drop_m": root_drop,
        "camera": {
            "lookat": args.camera_lookat,
            "distance": args.camera_distance,
            "azimuth": args.camera_azimuth,
            "elevation": args.camera_elevation,
            "preview_grid": camera_preview_grid,
        },
        "snapshots": [initial, settled, final],
        "render_dir": str(args.render_dir) if args.render_dir else None,
        "rendered_frames": rendered[:5] + (["..."] if len(rendered) > 5 else []),
    }
    print(json.dumps(summary, indent=2))

    failures = []
    if root_drop is not None and root_drop > args.max_root_drop:
        failures.append(f"root dropped {root_drop:.6f}m > {args.max_root_drop:.6f}m")
    if args.assert_min_joint_delta > 0:
        max_delta = max((abs(value) for value in joint_delta.values()), default=0.0)
        if max_delta < args.assert_min_joint_delta:
            failures.append(f"watched joints moved only {max_delta:.6f}; expected {args.assert_min_joint_delta:.6f}")
    for name, min_value, max_value in args.expect_drive_delta:
        value = joint_drive_delta[name]
        if not min_value <= value <= max_value:
            failures.append(
                f"{name} drive delta {value:.6f} outside expected range [{min_value:.6f}, {max_value:.6f}]"
            )
    for name, min_value, max_value in args.expect_drive_cycles:
        value = joint_drive_cycles[name]
        if not min_value <= value <= max_value:
            failures.append(
                f"{name} drive cycles {value:.6f} outside expected range [{min_value:.6f}, {max_value:.6f}]"
            )
    for name, min_value, max_value in args.expect_final_qvel:
        value = final_joint_qvel[name]
        if not min_value <= value <= max_value:
            failures.append(
                f"{name} final qvel {value:.6f} outside expected range [{min_value:.6f}, {max_value:.6f}]"
            )
    if any(math.isnan(value) or math.isinf(value) for value in data.qpos):
        failures.append("qpos contains NaN or Inf")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
