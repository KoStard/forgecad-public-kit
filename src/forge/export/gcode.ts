/**
 * ForgeCAD — G-code Builder
 *
 * Programmatic toolpath generation for FDM 3D printing.
 * Returns a GCodeBuilder that the runner recognizes as a renderable output type,
 * enabling both viewport visualization and G-code file export.
 */

// ---- Public types ----

/** Supported printer presets. 'generic' emits standard G-code. Bambu presets emit firmware-specific metadata and start/end sequences. */
export type PrinterPreset = 'generic' | 'bambu-a1' | 'bambu-p1s' | 'bambu-x1c' | 'bambu-a1-mini';

export interface PrinterProfile {
  /** Bed width in mm (X axis). Default: 220 */
  bedX?: number;
  /** Bed depth in mm (Y axis). Default: 220 */
  bedY?: number;
  /** Max print height in mm (Z axis). Default: 250 */
  bedZ?: number;
  /** Nozzle diameter in mm. Default: 0.4 */
  nozzle?: number;
  /** Filament diameter in mm. Default: 1.75 */
  filament?: number;
  /** Layer height in mm. Default: 0.2 */
  layerHeight?: number;
  /** Default print speed in mm/min. Default: 1800 (30 mm/s) */
  printSpeed?: number;
  /** Travel (non-extrusion) speed in mm/min. Default: 7200 (120 mm/s) */
  travelSpeed?: number;
  /** Retraction distance in mm. Default: 1.0 */
  retractionDistance?: number;
  /** Retraction speed in mm/min. Default: 2700 (45 mm/s) */
  retractionSpeed?: number;
  /** Printer preset — controls start/end G-code and metadata header. Default: 'generic' */
  printer?: PrinterPreset;
  /** Filament type for Bambu metadata header (e.g. 'PLA', 'PETG', 'ABS'). Default: 'PLA' */
  filamentType?: string;
  /** Filament color hex for Bambu metadata (e.g. '#FFFFFF'). Default: '#FFFFFF' */
  filamentColor?: string;
}

export interface PreheatOptions {
  hotend?: number;
  bed?: number;
}

/** A single segment of toolpath — either extrusion or travel. */
export interface ToolpathSegment {
  /** Start position [x, y, z] */
  from: [number, number, number];
  /** End position [x, y, z] */
  to: [number, number, number];
  /** true = extrusion move, false = travel move */
  extrude: boolean;
  /** Feed rate in mm/min */
  speed: number;
}

/** Serializable toolpath data for rendering and export. */
export interface ToolpathData {
  segments: ToolpathSegment[];
  /** Bounding box of all toolpath points */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Raw G-code string for export */
  gcode: string;
  /** Estimated print time in seconds */
  estimatedTimeSeconds: number;
  /** Total extrusion length in mm */
  totalExtrusionMm: number;
  /** Total filament used in mm */
  totalFilamentMm: number;
  /** Nozzle diameter in mm — used by the viewer for bead width */
  beadWidth: number;
  /** Layer height in mm — used by the viewer for bead height */
  beadHeight: number;
}

// ---- Defaults ----

type ResolvedProfile = Required<PrinterProfile>;

const DEFAULT_PROFILE: ResolvedProfile = {
  bedX: 220,
  bedY: 220,
  bedZ: 250,
  nozzle: 0.4,
  filament: 1.75,
  filamentType: 'PLA',
  layerHeight: 0.2,
  printSpeed: 1800,
  travelSpeed: 7200,
  retractionDistance: 1.0,
  retractionSpeed: 2700,
  printer: 'generic',
  filamentColor: '#FFFFFF',
};

/** Bambu Lab A1 bed dimensions and defaults. */
const BAMBU_A1_OVERRIDES: Partial<PrinterProfile> = {
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  retractionDistance: 0.8,
  retractionSpeed: 1800, // 30 mm/s
  travelSpeed: 18000, // 300 mm/s
};

/** Bambu Lab A1 mini bed dimensions and defaults. */
const BAMBU_A1_MINI_OVERRIDES: Partial<PrinterProfile> = {
  bedX: 180,
  bedY: 180,
  bedZ: 180,
  retractionDistance: 0.8,
  retractionSpeed: 1800,
  travelSpeed: 18000,
};

/** Bambu Lab P1S / X1C share the same bed. */
const BAMBU_P1_X1_OVERRIDES: Partial<PrinterProfile> = {
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  retractionDistance: 0.8,
  retractionSpeed: 1800,
  travelSpeed: 18000,
};

function bambuOverridesFor(preset: PrinterPreset): Partial<PrinterProfile> {
  switch (preset) {
    case 'bambu-a1': return BAMBU_A1_OVERRIDES;
    case 'bambu-a1-mini': return BAMBU_A1_MINI_OVERRIDES;
    case 'bambu-p1s':
    case 'bambu-x1c': return BAMBU_P1_X1_OVERRIDES;
    default: return {};
  }
}

function isBambu(preset: PrinterPreset): boolean {
  return preset.startsWith('bambu-');
}

// ---- G-code Builder ----

export class GCodeBuilder {
  private profile: Required<PrinterProfile>;
  private pos: [number, number, number] = [0, 0, 0];
  private posInitialized = false; // true after first explicit move
  private e = 0; // cumulative extrusion
  private retracted = false;
  private currentSpeed: number;
  private lines: string[] = [];
  private _segments: ToolpathSegment[] = [];

  // Track bounds
  private _minX = Infinity;
  private _minY = Infinity;
  private _minZ = Infinity;
  private _maxX = -Infinity;
  private _maxY = -Infinity;
  private _maxZ = -Infinity;

  // Filament cross-section area (precomputed)
  private filamentArea: number;

  constructor(profile?: PrinterProfile) {
    const preset = profile?.printer ?? DEFAULT_PROFILE.printer;
    // Apply Bambu hardware overrides first, then user overrides on top
    this.profile = { ...DEFAULT_PROFILE, ...bambuOverridesFor(preset), ...profile };
    this.currentSpeed = this.profile.printSpeed;
    this.filamentArea = Math.PI * (this.profile.filament / 2) ** 2;
  }

  // ---- Configuration ----

  /** Set print speed in mm/s (converted to mm/min internally). */
  setSpeed(mmPerSec: number): this {
    this.currentSpeed = mmPerSec * 60;
    return this;
  }

  /** Set print speed in mm/min. */
  setSpeedMmMin(mmPerMin: number): this {
    this.currentSpeed = mmPerMin;
    return this;
  }

  /** Set layer height for subsequent extrusion calculations. */
  setLayerHeight(mm: number): this {
    this.profile.layerHeight = mm;
    return this;
  }

  // ---- Preamble / Postamble ----

  /** Add standard start G-code: homing, heating, priming. */
  preheat(opts?: PreheatOptions): this {
    const hotend = opts?.hotend ?? 200;
    const bed = opts?.bed ?? 60;

    if (isBambu(this.profile.printer)) {
      this._preheatBambu(hotend, bed);
    } else {
      this._preheatGeneric(hotend, bed);
    }

    this.e = 0;
    this.pos = [0, 0, 0];
    return this;
  }

  private _preheatGeneric(hotend: number, bed: number): void {
    this.lines.push('; === ForgeCAD G-code ===');
    this.lines.push('; Generated by ForgeCAD GCodeBuilder');
    this.lines.push('');
    // Slicer-compatible metadata (Bambu Studio, PrusaSlicer, etc.)
    this.lines.push(`; filament_type = ${this.profile.filamentType}`);
    this.lines.push(`; nozzle_diameter = ${this.profile.nozzle}`);
    this.lines.push(`; filament_diameter = ${this.profile.filament}`);
    this.lines.push(`; layer_height = ${this.profile.layerHeight}`);
    this.lines.push(`; bed_temperature = ${bed}`);
    this.lines.push(`; temperature = ${hotend}`);
    this.lines.push('');
    this.lines.push('G21 ; mm units');
    this.lines.push('G90 ; absolute positioning');
    this.lines.push('M82 ; absolute extrusion');
    this.lines.push('');
    this.lines.push(`M140 S${bed} ; set bed temp`);
    this.lines.push(`M104 S${hotend} ; set hotend temp`);
    this.lines.push(`M190 S${bed} ; wait for bed`);
    this.lines.push(`M109 S${hotend} ; wait for hotend`);
    this.lines.push('');
    this.lines.push('G28 ; home all axes');
    this.lines.push('G92 E0 ; reset extruder');
    this.lines.push('');
  }

  private _preheatBambu(hotend: number, bed: number): void {
    const p = this.profile;
    const filType = p.filamentType;
    const filColor = p.filamentColor;
    const cx = Math.round(p.bedX / 2);
    const cy = Math.round(p.bedY / 2);

    // ---- BambuStudio-compatible metadata header ----
    // This is what the firmware and BambuStudio parse for filament mapping.
    this.lines.push('; generated by ForgeCAD (BambuStudio compatible)');
    this.lines.push('; BambuStudio-compatible G-code');
    this.lines.push('');
    this.lines.push(`; printer_model = ${bambuModelName(p.printer)}`);
    this.lines.push(`; nozzle_diameter = ${p.nozzle}`);
    this.lines.push(`; filament_type = ${filType}`);
    this.lines.push(`; filament_colour = ${filColor}`);
    this.lines.push(`; nozzle_temperature = ${hotend}`);
    this.lines.push(`; bed_temperature = ${bed}`);
    this.lines.push(`; layer_height = ${p.layerHeight}`);
    this.lines.push('; total_layer_count = 1'); // toolpath mode — single logical layer
    this.lines.push(`; nozzle_temperature_initial_layer = ${hotend}`);
    this.lines.push(`; bed_temperature_initial_layer = ${bed}`);
    this.lines.push('');
    // BambuStudio requires >= 80 recognized config keys in the CONFIG_BLOCK
    // or it rejects the file with "suspiciously low number of configuration values".
    for (const line of bambuConfigBlock(p, hotend, bed)) {
      this.lines.push(line);
    }
    this.lines.push('');

    // ---- Bambu start sequence ----
    this.lines.push(';===== machine: ForgeCAD toolpath =========================');
    this.lines.push('');
    this.lines.push('G21 ; mm units');
    this.lines.push('G90 ; absolute positioning');
    this.lines.push('M82 ; absolute extrusion');
    this.lines.push('');

    // Tell firmware what filament is loaded
    this.lines.push(`M1002 set_filament_type:${filType}`);
    this.lines.push('');

    // Heat bed and nozzle
    this.lines.push(`M140 S${bed} ; set bed temp`);
    this.lines.push(`M104 S${hotend} ; set hotend temp`);
    this.lines.push(`M190 S${bed} ; wait for bed`);
    this.lines.push(`M109 S${hotend} ; wait for hotend`);
    this.lines.push('');

    // Home
    this.lines.push('G28 ; home all axes');
    this.lines.push('');

    // Reset extruder
    this.lines.push('G92 E0 ; reset extruder');
    this.lines.push('');

    // Turn on filament runout detection
    this.lines.push('M412 S1 ; filament runout detection on');
    this.lines.push('');

    // Simple purge/prime line along front edge of bed
    this.lines.push('; === prime line ===');
    this.lines.push('G1 Z0.3 F600 ; lift to first layer height');
    this.lines.push(`G1 X10 Y5 F${Math.round(p.travelSpeed)} ; move to prime start`);
    this.lines.push('G1 E5 F300 ; prime nozzle');
    const primeEnd = Math.min(p.bedX - 10, 200);
    this.lines.push(`G1 X${primeEnd} E15 F1200 ; prime line`);
    this.lines.push('G92 E0 ; reset extruder after prime');
    this.lines.push('G1 Z2 F600 ; lift');
    this.lines.push(`G1 X${cx} Y${cy} F${Math.round(p.travelSpeed)} ; move to center`);
    this.lines.push('');

    // Enable motion system features
    this.lines.push('M975 S1 ; vibration compensation on');
    this.lines.push('M1007 S1 ; mass estimation on');
    this.lines.push('');
  }

  /** Add standard end G-code: retract, cool down, present print. */
  cooldown(): this {
    if (isBambu(this.profile.printer)) {
      this._cooldownBambu();
    } else {
      this._cooldownGeneric();
    }
    return this;
  }

  private _cooldownGeneric(): void {
    this.retract();
    this.lines.push('');
    this.lines.push('M104 S0 ; hotend off');
    this.lines.push('M140 S0 ; bed off');
    this.lines.push('M107 ; fan off');
    this.lines.push('G91 ; relative positioning');
    this.lines.push('G1 Z10 F600 ; lift nozzle');
    this.lines.push('G90 ; absolute positioning');
    this.lines.push('G1 X0 Y200 F3000 ; present print');
    this.lines.push('M84 ; disable steppers');
    this.lines.push('; === End of ForgeCAD G-code ===');
  }

  private _cooldownBambu(): void {
    this.retract();
    const p = this.profile;
    const maxZ = this._maxZ !== -Infinity ? this._maxZ : 10;

    this.lines.push('');
    this.lines.push(';===== end G-code =========================');

    // Turn off clog detection
    this.lines.push('G392 S0 ; nozzle clog detect off');
    this.lines.push('');

    this.lines.push('M400 ; wait for buffer to clear');
    this.lines.push('G92 E0 ; zero extruder');
    this.lines.push('G1 E-0.8 F1800 ; retract');
    this.lines.push('');

    // Lift to safe Z
    const safeZ = Math.min(maxZ + 5, p.bedZ - 1);
    this.lines.push(`G1 Z${f(safeZ)} F900 ; lift nozzle above print`);
    this.lines.push('');

    // Turn off heaters and fans
    this.lines.push('M140 S0 ; bed off');
    this.lines.push('M104 S0 ; hotend off');
    this.lines.push('M106 S0 ; part fan off');
    this.lines.push('M106 P2 S0 ; aux fan off');
    this.lines.push('M106 P3 S0 ; chamber fan off');
    this.lines.push('');

    // Present print — move to front of bed
    this.lines.push('M400 ; wait for moves to finish');
    this.lines.push(`G1 X0 Y${p.bedY - 20} F3000 ; present print`);
    this.lines.push('');

    // Lower Z motor current, drop bed for access
    this.lines.push('M17 S ; save motor current');
    this.lines.push('M17 Z0.4 ; lower Z current for safety');
    const dropZ = Math.min(maxZ + 100, p.bedZ);
    this.lines.push(`G1 Z${Math.round(dropZ)} F600 ; lower bed for part removal`);
    this.lines.push('M400 P100');
    this.lines.push('M17 R ; restore motor current');
    this.lines.push('');

    // Disable motors, reset feed
    this.lines.push('M220 S100 ; reset feedrate');
    this.lines.push('M221 S100 ; reset flowrate');
    this.lines.push('M400');
    this.lines.push('M18 X Y Z ; disable steppers');
    this.lines.push('');
    this.lines.push(';===== end of ForgeCAD G-code =========================');
  }

  // ---- Movement ----

  /** Travel (no extrusion) to a point. Auto-retracts. */
  travelTo(x: number, y: number, z: number): this {
    this.retract();
    const from: [number, number, number] = [...this.pos];
    this.lines.push(`G0 X${f(x)} Y${f(y)} Z${f(z)} F${Math.round(this.profile.travelSpeed)}`);
    // Only record a visual segment if position was already initialized
    // (skip the initial home→start travel so it doesn't render as a line from 0,0,0)
    if (this.posInitialized) {
      this._segments.push({ from, to: [x, y, z], extrude: false, speed: this.profile.travelSpeed });
    }
    this.pos = [x, y, z];
    this.posInitialized = true;
    this._updateBounds(x, y, z);
    return this;
  }

  /** Extrude to a point. Auto-unretracts if needed. */
  extrudeTo(x: number, y: number, z: number): this {
    this.unretract();
    const from: [number, number, number] = [...this.pos];
    const dist = Math.sqrt((x - this.pos[0]) ** 2 + (y - this.pos[1]) ** 2 + (z - this.pos[2]) ** 2);

    if (dist < 1e-6) return this; // skip zero-length moves

    // E = (cross-section of extruded bead) * distance / filament cross-section
    const beadArea = this.profile.layerHeight * this.profile.nozzle;
    const eIncrement = (beadArea * dist) / this.filamentArea;
    this.e += eIncrement;

    this.lines.push(`G1 X${f(x)} Y${f(y)} Z${f(z)} E${f(this.e)} F${Math.round(this.currentSpeed)}`);
    if (this.posInitialized) {
      this._segments.push({ from, to: [x, y, z], extrude: true, speed: this.currentSpeed });
    }
    this.pos = [x, y, z];
    this.posInitialized = true;
    this._updateBounds(x, y, z);
    return this;
  }

  /** Extrude a relative displacement. */
  extrudeBy(dx: number, dy: number, dz: number): this {
    return this.extrudeTo(this.pos[0] + dx, this.pos[1] + dy, this.pos[2] + dz);
  }

  /** Travel a relative displacement. */
  travelBy(dx: number, dy: number, dz: number): this {
    return this.travelTo(this.pos[0] + dx, this.pos[1] + dy, this.pos[2] + dz);
  }

  // ---- Fan ----

  /** Set fan speed (0-255 or 0.0-1.0). */
  setFan(speed: number): this {
    const s = speed <= 1 ? Math.round(speed * 255) : Math.round(speed);
    this.lines.push(`M106 S${Math.min(255, Math.max(0, s))}`);
    return this;
  }

  fanOff(): this {
    this.lines.push('M107');
    return this;
  }

  // ---- Raw G-code ----

  /** Insert a comment into the G-code. */
  comment(text: string): this {
    this.lines.push(`; ${text}`);
    return this;
  }

  /** Insert raw G-code line(s). */
  raw(line: string): this {
    this.lines.push(line);
    return this;
  }

  // ---- Retraction ----

  private retract(): void {
    if (this.retracted) return;
    this.e -= this.profile.retractionDistance;
    this.lines.push(`G1 E${f(this.e)} F${Math.round(this.profile.retractionSpeed)}`);
    this.retracted = true;
  }

  private unretract(): void {
    if (!this.retracted) return;
    this.e += this.profile.retractionDistance;
    this.lines.push(`G1 E${f(this.e)} F${Math.round(this.profile.retractionSpeed)}`);
    this.retracted = false;
  }

  // ---- Bounds tracking ----

  private _updateBounds(x: number, y: number, z: number): void {
    if (x < this._minX) this._minX = x;
    if (y < this._minY) this._minY = y;
    if (z < this._minZ) this._minZ = z;
    if (x > this._maxX) this._maxX = x;
    if (y > this._maxY) this._maxY = y;
    if (z > this._maxZ) this._maxZ = z;
  }

  // ---- Output ----

  /** Get the current position. */
  getPosition(): [number, number, number] {
    return [...this.pos];
  }

  /** Build the complete toolpath data (for serialization and rendering). */
  build(): ToolpathData {
    const gcode = this.lines.join('\n') + '\n';

    // Estimate print time from segments
    let totalTimeSeconds = 0;
    let totalExtrusionMm = 0;
    for (const seg of this._segments) {
      const dist = Math.sqrt((seg.to[0] - seg.from[0]) ** 2 + (seg.to[1] - seg.from[1]) ** 2 + (seg.to[2] - seg.from[2]) ** 2);
      totalTimeSeconds += dist / (seg.speed / 60); // speed is mm/min, want seconds
      if (seg.extrude) totalExtrusionMm += dist;
    }

    const hasPoints = this._minX !== Infinity;

    return {
      segments: this._segments,
      bounds: {
        min: hasPoints ? [this._minX, this._minY, this._minZ] : [0, 0, 0],
        max: hasPoints ? [this._maxX, this._maxY, this._maxZ] : [0, 0, 0],
      },
      gcode,
      estimatedTimeSeconds: totalTimeSeconds,
      totalExtrusionMm,
      totalFilamentMm: this.e,
      beadWidth: this.profile.nozzle,
      beadHeight: this.profile.layerHeight,
    };
  }

  /** Generate the G-code string. */
  toGCode(): string {
    return this.lines.join('\n') + '\n';
  }
}

// ---- Helpers ----

/** Format a number for G-code (5 decimal places, strip trailing zeros). */
function f(n: number): string {
  return n.toFixed(5).replace(/\.?0+$/, '');
}

/** Map printer preset to the model name BambuStudio expects in metadata. */
function bambuModelName(preset: PrinterPreset): string {
  switch (preset) {
    case 'bambu-a1': return 'Bambu Lab A1';
    case 'bambu-a1-mini': return 'Bambu Lab A1 mini';
    case 'bambu-p1s': return 'Bambu Lab P1S';
    case 'bambu-x1c': return 'Bambu Lab X1 Carbon';
    default: return 'Generic';
  }
}

/**
 * Generate a BambuStudio-compatible CONFIG_BLOCK with >= 80 recognized keys.
 * BambuStudio's Config.cpp rejects files with fewer than 80 recognized
 * key-value pairs (`set_deserialize` must accept each key).
 */
function bambuConfigBlock(p: ResolvedProfile, hotend: number, bed: number): string[] {
  const model = bambuModelName(p.printer);
  const filType = p.filamentType;
  const filColor = p.filamentColor;
  const lh = p.layerHeight;
  const lw = +(p.nozzle * 1.05).toFixed(2); // line width ~ 105% of nozzle
  const bedArea = `0x0,${p.bedX}x0,${p.bedX}x${p.bedY},0x${p.bedY}`;

  // All keys are recognized by BambuStudio's ConfigDef.
  // Values are sensible defaults for single-filament PLA on Bambu printers.
  const kv: [string, string | number][] = [
    // -- printer / machine --
    ['printer_model', model],
    ['printer_variant', `${p.nozzle}`],
    ['printer_settings_id', `ForgeCAD ${model} ${p.nozzle} nozzle`],
    ['printer_technology', 'FFF'],
    ['printer_structure', 'i3'],
    ['printable_area', bedArea],
    ['printable_height', p.bedZ],
    ['nozzle_diameter', p.nozzle],
    ['nozzle_type', 'stainless_steel'],
    ['nozzle_height', '4.76'],
    ['nozzle_volume', '92'],
    ['nozzle_temperature', hotend],
    ['nozzle_temperature_initial_layer', hotend],
    ['nozzle_temperature_range_low', '190'],
    ['nozzle_temperature_range_high', '260'],
    ['bed_temperature', bed],
    ['bed_temperature_initial_layer', bed],
    ['hot_plate_temp', bed],
    ['hot_plate_temp_initial_layer', bed],
    ['cool_plate_temp', Math.max(bed - 10, 35)],
    ['cool_plate_temp_initial_layer', Math.max(bed - 10, 35)],
    ['textured_plate_temp', bed],
    ['textured_plate_temp_initial_layer', bed],
    ['curr_bed_type', 'Hot Plate'],
    ['auxiliary_fan', '0'],
    ['machine_max_acceleration_extruding', '12000,12000'],
    ['machine_max_acceleration_x', '12000,12000'],
    ['machine_max_acceleration_y', '12000,12000'],
    ['machine_max_acceleration_z', '1500,1500'],
    ['machine_max_speed_z', '30,30'],
    ['machine_max_jerk_e', '3,3'],
    ['machine_max_jerk_x', '9,9'],
    ['machine_max_jerk_y', '9,9'],
    ['machine_max_jerk_z', '0.2,0.2'],
    ['machine_min_extruding_rate', '0,0'],
    ['machine_min_travel_rate', '0,0'],
    ['machine_load_filament_time', '25'],
    ['machine_unload_filament_time', '25'],
    ['machine_start_gcode', ''],
    ['machine_end_gcode', ''],
    ['machine_pause_gcode', ''],
    ['change_filament_gcode', ''],

    // -- filament --
    ['filament_type', filType],
    ['filament_colour', filColor],
    ['filament_diameter', `${p.filament}`],
    ['filament_density', '1.24'],
    ['filament_cost', '24.99'],
    ['filament_flow_ratio', '0.98'],
    ['filament_max_volumetric_speed', '21'],
    ['filament_vendor', 'Generic'],
    ['filament_ids', 'GFA00'],
    ['filament_settings_id', `${filType}`],
    ['filament_soluble', '0'],
    ['filament_is_support', '0'],
    ['filament_end_gcode', ''],
    ['filament_start_gcode', ''],

    // -- print / process --
    ['print_settings_id', 'ForgeCAD Toolpath'],
    ['layer_height', lh],
    ['initial_layer_print_height', lh],
    ['line_width', lw],
    ['initial_layer_line_width', lw],
    ['inner_wall_line_width', lw],
    ['outer_wall_line_width', lw],
    ['sparse_infill_line_width', lw],
    ['internal_solid_infill_line_width', lw],
    ['top_surface_line_width', lw],
    ['wall_loops', 2],
    ['top_shell_layers', 4],
    ['bottom_shell_layers', 3],
    ['top_shell_thickness', 0.8],
    ['bottom_shell_thickness', 0.6],
    ['sparse_infill_density', '15%'],
    ['sparse_infill_pattern', 'grid'],
    ['top_surface_pattern', 'monotonic'],
    ['bottom_surface_pattern', 'monotonic'],
    ['internal_solid_infill_pattern', 'monotonic'],
    ['infill_direction', 45],
    ['infill_combination', 0],
    ['infill_wall_overlap', '15%'],
    ['sparse_infill_anchor', '400%'],
    ['sparse_infill_anchor_max', 20],

    // -- speeds --
    ['outer_wall_speed', 200],
    ['inner_wall_speed', 300],
    ['sparse_infill_speed', 270],
    ['internal_solid_infill_speed', 250],
    ['top_surface_speed', 200],
    ['gap_infill_speed', 250],
    ['travel_speed', Math.round(p.travelSpeed / 60)],
    ['initial_layer_speed', 50],
    ['initial_layer_infill_speed', 105],
    ['bridge_speed', 50],
    ['small_perimeter_speed', 50],
    ['small_perimeter_threshold', 0],

    // -- acceleration --
    ['default_acceleration', 5000],
    ['outer_wall_acceleration', 5000],
    ['inner_wall_acceleration', 5000],
    ['initial_layer_acceleration', 500],
    ['top_surface_acceleration', 2000],
    ['sparse_infill_acceleration', 5000],
    ['travel_acceleration', 9000],
    ['initial_layer_travel_acceleration', 3000],

    // -- jerk --
    ['default_jerk', 0],
    ['outer_wall_jerk', 9],
    ['inner_wall_jerk', 9],
    ['infill_jerk', 9],
    ['initial_layer_jerk', 9],
    ['top_surface_jerk', 9],
    ['travel_jerk', 12],

    // -- retraction --
    ['retraction_length', p.retractionDistance],
    ['retraction_speed', Math.round(p.retractionSpeed / 60)],
    ['deretraction_speed', Math.round(p.retractionSpeed / 60)],
    ['retraction_minimum_travel', 1],
    ['retract_before_wipe', '0%'],
    ['retract_when_changing_layer', 0],
    ['wipe', 0],
    ['wipe_distance', 1],
    ['z_hop', 0.4],
    ['z_hop_types', 'Auto Lift'],
    ['retract_lift_above', 0],
    ['retract_lift_below', p.bedZ - 1],

    // -- fan --
    ['fan_max_speed', '80'],
    ['fan_min_speed', '60'],
    ['close_fan_the_first_x_layers', 1],
    ['fan_cooling_layer_time', 80],
    ['slow_down_layer_time', 6],
    ['slow_down_min_speed', 10],
    ['overhang_fan_speed', '100'],
    ['overhang_fan_threshold', '25%'],
    ['full_fan_speed_layer', 3],
    ['bridge_fan_speed', 100],
    ['additional_cooling_fan_speed', 0],
    ['reduce_fan_stop_start_freq', 0],

    // -- support --
    ['enable_support', 0],
    ['support_type', 'normal(auto)'],
    ['support_threshold_angle', 30],

    // -- skirt / brim --
    ['skirt_loops', 0],
    ['skirt_distance', 2],
    ['skirt_height', 1],
    ['brim_type', 'no_brim'],
    ['brim_width', 0],
    ['brim_object_gap', 0],

    // -- misc process --
    ['spiral_mode', 0],
    ['elefant_foot_compensation', 0.1],
    ['seam_position', 'aligned'],
    ['detect_overhang_wall', 1],
    ['detect_thin_wall', 1],
    ['single_extruder_multi_material', 1],
    ['enable_prime_tower', 0],
    ['print_sequence', 'by layer'],
    ['timelapse_type', 0],
    ['gcode_flavor', 'marlin'],
    ['use_relative_e_distances', 0],
    ['use_firmware_retraction', 0],
    ['gcode_add_line_number', 0],
    ['scan_first_layer', 1],
    ['enable_overhang_speed', 1],
    ['enable_arc_fitting', 0],
    ['reduce_crossing_wall', 0],
    ['max_travel_detour_distance', 0],
    ['filename_format', '{input_filename_base}_{filament_type[0]}_{print_time}.gcode'],
    ['resolution', 0.012],
    ['slice_closing_radius', 0.049],
    ['slicing_mode', 'regular'],
    ['enable_pressure_advance', 0],
    ['pressure_advance', 0.02],
    ['silent_mode', 0],
    ['exclude_object', 1],
  ];

  const lines: string[] = ['; CONFIG_BLOCK_START'];
  for (const [key, value] of kv) {
    lines.push(`; ${key} = ${value}`);
  }
  lines.push('; CONFIG_BLOCK_END');
  return lines;
}

// ---- Factory function for user scripts ----

/**
 * Create a new G-code builder with an optional printer profile.
 *
 * Usage in .forge.js scripts:
 * ```js
 * const g = gcode({ nozzle: 0.4, layerHeight: 0.2 });
 * g.preheat({ hotend: 200, bed: 60 });
 * // ... build toolpath ...
 * g.cooldown();
 * export default g;
 * ```
 */
export function gcode(profile?: PrinterProfile): GCodeBuilder {
  return new GCodeBuilder(profile);
}
