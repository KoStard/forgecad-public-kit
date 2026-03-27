#!/usr/bin/env python3
"""
ForgeCAD → Blender Cycles render script.

Usage (called by forgecad render-hq, not directly):
  blender --background --python render.py -- <config.json>

config.json contains:
  {
    "obj_path": "/tmp/model.obj",
    "output_path": "/tmp/render.png",
    "width": 1920,
    "height": 1080,
    "samples": 256,
    "engine": "CYCLES",          # CYCLES | BLENDER_EEVEE_NEXT
    "preset": "studio",          # studio | outdoor | dramatic | clay | wireframe
    "background": "#252526",
    "camera": { "position": [x,y,z], "target": [x,y,z], "fov": 45 },
    "objects": [ { "name": "...", "color": "#5b9bd5" }, ... ],
    "hdri_path": null,           # optional custom HDRI path
    "transparent": false,        # transparent background
    "denoise": true
  }
"""

import bpy
import sys
import json
import math
import os
from mathutils import Vector


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hex_to_rgb(hex_str):
    """Convert '#rrggbb' to (r, g, b) in 0-1 range."""
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def hex_to_rgba(hex_str, alpha=1.0):
    r, g, b = hex_to_rgb(hex_str)
    return (r, g, b, alpha)


def clear_scene():
    """Remove all default objects."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Remove orphan data
    for block in bpy.data.meshes:
        if block.users == 0:
            bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        if block.users == 0:
            bpy.data.materials.remove(block)


def import_obj(path):
    """Import OBJ file and return imported objects."""
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=path, up_axis='Z', forward_axis='NEGATIVE_Y')
    after = set(bpy.data.objects)
    return list(after - before)


# ---------------------------------------------------------------------------
# Material presets
# ---------------------------------------------------------------------------

def make_cad_material(name, color_hex, preset):
    """Create a PBR material matching a preset style."""
    mat = bpy.data.materials.new(name=name)
    # Nodes are enabled by default in Blender 5+
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (400, 0)

    if preset == 'clay':
        bsdf = nodes.new('ShaderNodeBsdfDiffuse')
        bsdf.inputs['Color'].default_value = (0.85, 0.82, 0.78, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
        bsdf.location = (200, 0)
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
        return mat

    if preset == 'wireframe':
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value = hex_to_rgba(color_hex)
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.5
        bsdf.inputs['Alpha'].default_value = 0.15
        bsdf.location = (200, 0)
        mat.blend_method = 'BLEND'  # Eevee transparency
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

        # Add wireframe overlay via mix
        wire = nodes.new('ShaderNodeWireframe')
        wire.inputs['Size'].default_value = 0.002
        wire.location = (-200, -200)
        mix = nodes.new('ShaderNodeMixShader')
        mix.location = (300, 0)
        solid_bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        solid_bsdf.inputs['Base Color'].default_value = hex_to_rgba(color_hex)
        solid_bsdf.inputs['Roughness'].default_value = 0.3
        solid_bsdf.location = (0, -200)
        links.new(wire.outputs['Fac'], mix.inputs['Fac'])
        links.new(bsdf.outputs['BSDF'], mix.inputs[1])
        links.new(solid_bsdf.outputs['BSDF'], mix.inputs[2])
        links.new(mix.outputs['Shader'], output.inputs['Surface'])
        return mat

    if preset == 'toon':
        # Toon shader using Shader-to-RGB for quantized lighting
        bsdf = nodes.new('ShaderNodeBsdfDiffuse')
        r, g, b = hex_to_rgb(color_hex)
        bsdf.inputs['Color'].default_value = (r, g, b, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.5
        bsdf.location = (-200, 0)

        shader_to_rgb = nodes.new('ShaderNodeShaderToRGB')
        shader_to_rgb.location = (0, 0)
        links.new(bsdf.outputs['BSDF'], shader_to_rgb.inputs['Shader'])

        # Color ramp to quantize into 3-4 bands
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.location = (200, 0)
        ramp.color_ramp.interpolation = 'CONSTANT'
        # Remove default stops and add quantized ones
        elements = ramp.color_ramp.elements
        elements[0].position = 0.0
        elements[0].color = (r * 0.3, g * 0.3, b * 0.3, 1.0)
        elements[1].position = 0.3
        elements[1].color = (r * 0.6, g * 0.6, b * 0.6, 1.0)
        e2 = elements.new(0.6)
        e2.color = (r * 0.85, g * 0.85, b * 0.85, 1.0)
        e3 = elements.new(0.85)
        e3.color = (r, g, b, 1.0)

        links.new(shader_to_rgb.outputs['Color'], ramp.inputs['Fac'])

        diffuse_out = nodes.new('ShaderNodeBsdfDiffuse')
        diffuse_out.location = (400, 0)
        links.new(ramp.outputs['Color'], diffuse_out.inputs['Color'])
        links.new(diffuse_out.outputs['BSDF'], output.inputs['Surface'])
        return mat

    if preset == 'xray':
        # X-ray: Fresnel-based glow on dark background
        fresnel = nodes.new('ShaderNodeFresnel')
        fresnel.inputs['IOR'].default_value = 1.1
        fresnel.location = (-200, 0)

        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Color'].default_value = (0.3, 0.7, 1.0, 1.0)
        emission.inputs['Strength'].default_value = 2.0
        emission.location = (0, 100)

        transparent = nodes.new('ShaderNodeBsdfTransparent')
        transparent.location = (0, -100)

        mix = nodes.new('ShaderNodeMixShader')
        mix.location = (200, 0)
        links.new(fresnel.outputs['Fac'], mix.inputs['Fac'])
        links.new(transparent.outputs['BSDF'], mix.inputs[1])
        links.new(emission.outputs['Emission'], mix.inputs[2])
        links.new(mix.outputs['Shader'], output.inputs['Surface'])
        mat.blend_method = 'BLEND'
        return mat

    if preset == 'normals':
        # Normal map visualization — emission from geometry normal
        geometry = nodes.new('ShaderNodeNewGeometry')
        geometry.location = (-400, 0)

        # Map normal from [-1,1] to [0,1]
        mapping = nodes.new('ShaderNodeVectorMath')
        mapping.operation = 'MULTIPLY_ADD'
        mapping.location = (-200, 0)
        mapping.inputs[1].default_value = (0.5, 0.5, 0.5)  # scale
        mapping.inputs[2].default_value = (0.5, 0.5, 0.5)  # offset
        links.new(geometry.outputs['Normal'], mapping.inputs[0])

        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Strength'].default_value = 1.0
        emission.location = (0, 0)
        links.new(mapping.outputs['Vector'], emission.inputs['Color'])
        links.new(emission.outputs['Emission'], output.inputs['Surface'])
        return mat

    if preset == 'silhouette':
        # Simple white diffuse — Freestyle does the ink lines
        bsdf = nodes.new('ShaderNodeBsdfDiffuse')
        bsdf.inputs['Color'].default_value = (0.92, 0.90, 0.88, 1.0)
        bsdf.inputs['Roughness'].default_value = 1.0
        bsdf.location = (200, 0)
        links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
        return mat

    # Default PBR material (studio / outdoor / dramatic)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (200, 0)

    r, g, b = hex_to_rgb(color_hex)
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)

    if preset == 'studio':
        bsdf.inputs['Metallic'].default_value = 0.05
        bsdf.inputs['Roughness'].default_value = 0.35
        bsdf.inputs['Coat Weight'].default_value = 0.1
        bsdf.inputs['Coat Roughness'].default_value = 0.4
    elif preset == 'outdoor':
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.5
    elif preset == 'dramatic':
        bsdf.inputs['Metallic'].default_value = 0.8
        bsdf.inputs['Roughness'].default_value = 0.2
        bsdf.inputs['Coat Weight'].default_value = 0.3
    elif preset == 'glass':
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.05
        bsdf.inputs['Transmission Weight'].default_value = 0.95
        bsdf.inputs['IOR'].default_value = 1.45
    elif preset == 'metallic':
        bsdf.inputs['Metallic'].default_value = 1.0
        bsdf.inputs['Roughness'].default_value = 0.15
    else:
        # Fallback — nice default
        bsdf.inputs['Metallic'].default_value = 0.05
        bsdf.inputs['Roughness'].default_value = 0.35

    links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat


# ---------------------------------------------------------------------------
# Scene measurement
# ---------------------------------------------------------------------------

def compute_scene_bounds(objects):
    """Compute bounding box center, size, and radius for all mesh objects."""
    min_co = Vector((float('inf'),) * 3)
    max_co = Vector((float('-inf'),) * 3)
    for obj in objects:
        if obj.type != 'MESH':
            continue
        bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        for corner in bbox_corners:
            min_co.x = min(min_co.x, corner.x)
            min_co.y = min(min_co.y, corner.y)
            min_co.z = min(min_co.z, corner.z)
            max_co.x = max(max_co.x, corner.x)
            max_co.y = max(max_co.y, corner.y)
            max_co.z = max(max_co.z, corner.z)

    center = (min_co + max_co) / 2
    diagonal = (max_co - min_co).length
    radius = diagonal / 2
    return center, diagonal, radius, min_co, max_co


# ---------------------------------------------------------------------------
# Lighting presets
# ---------------------------------------------------------------------------

def setup_lighting_studio(center=Vector((0,0,0)), radius=1.0):
    """Three-point studio lighting with soft shadows, scaled to model size."""
    s = max(radius, 0.01)  # scale factor

    # Key light
    key = bpy.data.lights.new(name='Key', type='AREA')
    key.energy = 500 * (s ** 2) / 4  # Energy scales with area (distance^2)
    key.size = s * 0.8
    key.color = (1.0, 0.98, 0.95)
    key_obj = bpy.data.objects.new('Key', key)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = center + Vector((s * 2, -s * 1.5, s * 2.5))
    key_obj.rotation_euler = (math.radians(55), 0, math.radians(40))

    # Fill light
    fill = bpy.data.lights.new(name='Fill', type='AREA')
    fill.energy = 150 * (s ** 2) / 4
    fill.size = s * 1.2
    fill.color = (0.85, 0.9, 1.0)
    fill_obj = bpy.data.objects.new('Fill', fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = center + Vector((-s * 2, -s, s * 1.5))
    fill_obj.rotation_euler = (math.radians(50), 0, math.radians(-50))

    # Rim light
    rim = bpy.data.lights.new(name='Rim', type='AREA')
    rim.energy = 300 * (s ** 2) / 4
    rim.size = s * 0.5
    rim.color = (1.0, 1.0, 1.0)
    rim_obj = bpy.data.objects.new('Rim', rim)
    bpy.context.collection.objects.link(rim_obj)
    rim_obj.location = center + Vector((0, s * 2, s * 2))
    rim_obj.rotation_euler = (math.radians(125), 0, math.radians(180))


def setup_lighting_outdoor():
    """Sun light with sky texture."""
    sun = bpy.data.lights.new(name='Sun', type='SUN')
    sun.energy = 5
    sun.color = (1.0, 0.95, 0.9)
    sun_obj = bpy.data.objects.new('Sun', sun)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(50), 0, math.radians(30))

    # Sky texture on world
    world = ensure_world_nodes()
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new('ShaderNodeBackground')
    sky = nodes.new('ShaderNodeTexSky')
    # Blender 5.1 uses HOSEK_WILKIE (NISHITA was renamed/removed)
    sky.sky_type = 'HOSEK_WILKIE'
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(sky.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    links.new(bg.outputs['Background'], output.inputs['Surface'])


def setup_lighting_dramatic(center=Vector((0,0,0)), radius=1.0):
    """High-contrast single spot with dark fill, scaled to model size."""
    s = max(radius, 0.01)

    spot = bpy.data.lights.new(name='Spot', type='SPOT')
    spot.energy = 2000 * (s ** 2) / 4
    spot.spot_size = math.radians(45)
    spot.spot_blend = 0.3
    spot.color = (1.0, 0.95, 0.85)
    spot.shadow_soft_size = s * 0.15
    spot_obj = bpy.data.objects.new('Spot', spot)
    bpy.context.collection.objects.link(spot_obj)
    spot_obj.location = center + Vector((s * 1.5, -s, s * 2.5))
    # Point at center
    direction = center - spot_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    spot_obj.rotation_euler = rot_quat.to_euler()


def ensure_world_nodes():
    """Get or create the World with node tree enabled."""
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    bpy.context.scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    return world


def setup_hdri(hdri_path, strength=1.0):
    """Set up HDRI environment lighting from an .hdr or .exr file."""
    world = ensure_world_nodes()
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    env_tex = nodes.new('ShaderNodeTexEnvironment')
    env_tex.image = bpy.data.images.load(hdri_path)
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(env_tex.outputs['Color'], bg.inputs['Color'])
    links.new(bg.outputs['Background'], output.inputs['Surface'])


def setup_background_color(hex_color):
    """Set a solid color as the world background."""
    world = ensure_world_nodes()
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    bg = nodes.new('ShaderNodeBackground')
    r, g, b = hex_to_rgb(hex_color)
    bg.inputs['Color'].default_value = (r, g, b, 1.0)
    bg.inputs['Strength'].default_value = 0.5
    output = nodes.new('ShaderNodeOutputWorld')
    links.new(bg.outputs['Background'], output.inputs['Surface'])


# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------

def setup_camera(config, objects):
    """Create and position the camera."""
    cam_data = bpy.data.cameras.new('Camera')
    cam_obj = bpy.data.objects.new('Camera', cam_data)
    bpy.context.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj

    cam_config = config.get('camera') or {}

    # Set FOV
    fov = cam_config.get('fov', 45)
    cam_data.lens_unit = 'FOV'
    cam_data.angle = math.radians(fov)

    if cam_config.get('position') and cam_config.get('target'):
        pos = Vector(cam_config['position'])
        target = Vector(cam_config['target'])
        cam_obj.location = pos
        direction = target - pos
        rot_quat = direction.to_track_quat('-Z', 'Y')
        cam_obj.rotation_euler = rot_quat.to_euler()
    else:
        # Auto-frame: compute bounding box of all mesh objects
        auto_frame_camera(cam_obj, objects)

    return cam_obj


def auto_frame_camera(cam_obj, objects):
    """Position camera to frame all objects nicely — iso view."""
    if not objects:
        cam_obj.location = (5, -5, 5)
        cam_obj.rotation_euler = (math.radians(55), 0, math.radians(45))
        return

    center, diagonal, radius, _, _ = compute_scene_bounds(objects)

    # Position camera at iso angle, distance based on bounding sphere
    distance = diagonal * 1.2
    cam_obj.location = center + Vector((distance * 0.7, -distance * 0.7, distance * 0.5))

    direction = center - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # Set clip distances based on model size
    cam_obj.data.clip_start = diagonal * 0.001
    cam_obj.data.clip_end = diagonal * 20


# ---------------------------------------------------------------------------
# Ground plane
# ---------------------------------------------------------------------------

def setup_freestyle(scene, preset, radius):
    """Enable Freestyle line rendering for artistic presets."""
    scene.render.use_freestyle = True
    view_layer = scene.view_layers[0]
    view_layer.use_freestyle = True

    # Configure Freestyle line set
    freestyle = view_layer.freestyle_settings
    freestyle.crease_angle = math.radians(134)

    # Get or create a line set
    if freestyle.linesets:
        lineset = freestyle.linesets[0]
    else:
        lineset = freestyle.linesets.new('ForgeLines')

    # Edge detection types
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    lineset.select_edge_mark = False
    lineset.select_contour = True

    # Line style
    style = lineset.linestyle
    if preset == 'silhouette':
        style.color = (0.05, 0.05, 0.1)
        style.thickness = max(2.0, radius * 0.003)
    elif preset == 'toon':
        style.color = (0.1, 0.1, 0.15)
        style.thickness = max(1.5, radius * 0.002)


def add_ground_plane(objects):
    """Add a subtle ground plane that receives shadows."""
    if not objects:
        return

    # Find lowest point
    min_z = float('inf')
    for obj in objects:
        if obj.type != 'MESH':
            continue
        bbox_corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        for corner in bbox_corners:
            min_z = min(min_z, corner.z)

    bpy.ops.mesh.primitive_plane_add(size=100, location=(0, 0, min_z - 0.001))
    plane = bpy.context.active_object
    plane.name = 'GroundPlane'

    # Shadow catcher — no custom material needed, just set the flag
    plane.is_shadow_catcher = True
    return plane


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def render_turntable(scene, cam_obj, objects, video_config, width, height, samples, engine):
    """Render a turntable orbit animation around the model."""
    frames = video_config.get('frames', 72)
    fps = video_config.get('fps', 24)
    output_path = video_config.get('output_path', '/tmp/turntable.mp4')
    pitch_deg = video_config.get('pitch_deg', 25)

    # Compute orbit center and radius
    center, diagonal, radius, _, _ = compute_scene_bounds(objects)
    orbit_distance = diagonal * 1.2
    orbit_height = center.z + orbit_distance * math.sin(math.radians(pitch_deg)) * 0.5

    # Set up animation
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = fps

    # Output to temp frame sequence
    frame_dir = video_config.get('frame_dir', '/tmp/forgecad-frames')
    os.makedirs(frame_dir, exist_ok=True)
    scene.render.filepath = os.path.join(frame_dir, 'frame_')
    scene.render.image_settings.file_format = 'PNG'

    print(f'Rendering {frames} frames @ {width}x{height}, {samples} samples...')

    # Keyframe the camera orbit
    for frame in range(1, frames + 1):
        scene.frame_set(frame)
        angle = (frame - 1) / frames * 2 * math.pi

        # Orbit position
        x = center.x + orbit_distance * 0.7 * math.cos(angle)
        y = center.y + orbit_distance * 0.7 * math.sin(angle)
        z = orbit_height

        cam_obj.location = Vector((x, y, z))
        direction = center - cam_obj.location
        rot_quat = direction.to_track_quat('-Z', 'Y')
        cam_obj.rotation_euler = rot_quat.to_euler()

        cam_obj.keyframe_insert(data_path='location', frame=frame)
        cam_obj.keyframe_insert(data_path='rotation_euler', frame=frame)

    # Render all frames
    bpy.ops.render.render(animation=True)
    print(f'Frames rendered to {frame_dir}')

    # Stitch with ffmpeg if available
    try:
        import subprocess
        ffmpeg_cmd = [
            'ffmpeg', '-y',
            '-framerate', str(fps),
            '-i', os.path.join(frame_dir, 'frame_%04d.png'),
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', '18',
            '-preset', 'medium',
            output_path,
        ]
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
        print(f'Video saved to {output_path}')

        # Clean up frames
        import shutil
        shutil.rmtree(frame_dir, ignore_errors=True)
    except FileNotFoundError:
        print(f'ffmpeg not found — frames saved to {frame_dir}')
        print(f'Stitch manually: ffmpeg -framerate {fps} -i {frame_dir}/frame_%04d.png -c:v libx264 -pix_fmt yuv420p {output_path}')
    except Exception as e:
        print(f'ffmpeg failed: {e}')
        print(f'Frames are in {frame_dir}')


def main():
    # Parse config from argument after '--'
    argv = sys.argv
    separator_idx = argv.index('--') if '--' in argv else -1
    if separator_idx < 0 or separator_idx + 1 >= len(argv):
        print('ERROR: No config JSON path provided after --', file=sys.stderr)
        sys.exit(1)

    config_path = argv[separator_idx + 1]
    with open(config_path, 'r') as f:
        config = json.load(f)

    obj_path = config['obj_path']
    output_path = config['output_path']
    width = config.get('width', 1920)
    height = config.get('height', 1080)
    samples = config.get('samples', 256)
    engine = config.get('engine', 'CYCLES')
    preset = config.get('preset', 'studio')
    background = config.get('background', '#252526')
    transparent = config.get('transparent', False)
    denoise = config.get('denoise', True)
    hdri_path = config.get('hdri_path')
    object_colors = {o['name']: o.get('color', '#5b9bd5') for o in config.get('objects', [])}

    # Scene setup
    clear_scene()

    # Render engine
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_depth = '16'
    scene.render.filepath = output_path

    if engine == 'CYCLES':
        scene.cycles.samples = samples
        scene.cycles.use_denoising = denoise
        scene.cycles.use_adaptive_sampling = True
        # Use GPU if available, fallback to CPU
        prefs = bpy.context.preferences.addons.get('cycles')
        if prefs:
            cprefs = prefs.preferences
            # Try Metal (macOS), then CUDA, then CPU
            for compute_type in ['METAL', 'CUDA', 'OPTIX', 'NONE']:
                try:
                    cprefs.compute_device_type = compute_type
                    cprefs.get_devices()
                    if compute_type != 'NONE':
                        for device in cprefs.devices:
                            device.use = True
                        scene.cycles.device = 'GPU'
                        print(f'Using {compute_type} GPU rendering')
                        break
                except:
                    continue
            else:
                scene.cycles.device = 'CPU'
                print('Using CPU rendering')
    elif engine == 'BLENDER_EEVEE_NEXT':
        scene.eevee.taa_render_samples = samples

    # Transparent background
    if transparent:
        scene.render.film_transparent = True
        scene.render.image_settings.color_mode = 'RGBA'
    else:
        scene.render.image_settings.color_mode = 'RGB'

    # Color management
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium Contrast'

    # Import model
    imported = import_obj(obj_path)
    if not imported:
        print(f'ERROR: No objects imported from {obj_path}', file=sys.stderr)
        sys.exit(1)

    print(f'Imported {len(imported)} objects from {obj_path}')

    # Smooth shading + auto-smooth normals for nicer renders
    for obj in imported:
        if obj.type == 'MESH':
            # Set smooth shading
            for poly in obj.data.polygons:
                poly.use_smooth = True
            # Auto smooth with angle threshold
            if hasattr(obj.data, 'use_auto_smooth'):
                obj.data.use_auto_smooth = True
                obj.data.auto_smooth_angle = math.radians(30)

    # Apply materials
    default_color = '#5b9bd5'
    for obj in imported:
        if obj.type != 'MESH':
            continue
        color = object_colors.get(obj.name, default_color)
        mat = make_cad_material(f'Mat_{obj.name}', color, preset)
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    # Compute scene bounds for scale-aware lighting
    center, diagonal, radius, _, _ = compute_scene_bounds(imported)
    print(f'Scene bounds: center={center}, diagonal={diagonal:.1f}, radius={radius:.1f}')

    # Artistic presets: special lighting and Freestyle configuration
    ARTISTIC_PRESETS = {'toon', 'xray', 'normals', 'silhouette'}
    is_artistic = preset in ARTISTIC_PRESETS

    # Lighting
    if hdri_path and os.path.exists(hdri_path):
        setup_hdri(hdri_path)
    elif preset == 'outdoor':
        setup_lighting_outdoor()
    elif preset == 'dramatic':
        setup_lighting_dramatic(center, radius)
        setup_background_color('#0a0a0a')
    elif preset == 'xray':
        setup_background_color('#020408')
        # Soft fill light for x-ray glow
        setup_lighting_studio(center, radius)
    elif preset == 'normals':
        # No lighting needed — emission material
        setup_background_color('#1a1a1a')
    elif preset == 'silhouette':
        setup_background_color('#f5f3f0')
        setup_lighting_studio(center, radius)
    elif preset == 'toon':
        setup_lighting_studio(center, radius)
        setup_background_color(background)
    elif preset == 'studio':
        setup_lighting_studio(center, radius)
        setup_background_color(background)
    else:
        setup_lighting_studio(center, radius)
        setup_background_color(background)

    # Freestyle line rendering for artistic presets
    if preset in ('toon', 'silhouette'):
        setup_freestyle(scene, preset, radius)

    # Ground plane (for studio/outdoor)
    if preset in ('studio', 'outdoor') and not transparent:
        add_ground_plane(imported)

    # Camera
    cam_obj = setup_camera(config, imported)

    # Video mode: orbit turntable animation
    video_config = config.get('video')
    if video_config:
        render_turntable(scene, cam_obj, imported, video_config, width, height, samples, engine)
    else:
        # Still render
        print(f'Rendering {width}x{height} @ {samples} samples with {engine}...')
        bpy.ops.render.render(write_still=True)
        print(f'Saved to {output_path}')


if __name__ == '__main__':
    main()
