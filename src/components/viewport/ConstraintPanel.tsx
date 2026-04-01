import { formatArea, type LengthUnit } from '@forge/units';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { useForgeStore } from '../../store/forgeStore';

const sectionStyle: CSSProperties = {
  borderTop: '1px solid var(--fc-borderLight)',
  padding: '10px 12px',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--fc-textDim)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 10,
          color: 'var(--fc-textDim)',
          marginBottom: open ? 2 : 0,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 8 }}>{open ? '\u25BE' : '\u25B8'}</span>
        {title} ({count})
      </div>
      {open && children}
    </div>
  );
}

interface ConstraintPanelProps {
  constraintMeta: any;
  constraintStatusColor: string;
  selectedConstraintId: string | null;
  setSelectedConstraintId: (id: string | null) => void;
  selectedSketchEntityId: string | null;
  setSelectedSketchEntityId: (id: string | null) => void;
  surfacesVisible: boolean;
  selectedSurfaceIndex: number | null;
  setSelectedSurfaceIndex: (index: number | null) => void;
  hoveredSurfaceIndex: number | null;
  setHoveredSurfaceIndex: (index: number | null) => void;
  lengthUnit: LengthUnit;
}

export function ConstraintPanel({
  constraintMeta,
  constraintStatusColor,
  selectedConstraintId,
  setSelectedConstraintId,
  selectedSketchEntityId,
  setSelectedSketchEntityId,
  surfacesVisible,
  selectedSurfaceIndex,
  setSelectedSurfaceIndex,
  hoveredSurfaceIndex,
  setHoveredSurfaceIndex,
  lengthUnit,
}: ConstraintPanelProps) {
  const [constraintsSectionOpen, setConstraintsSectionOpen] = useState(true);

  if (!constraintMeta) return null;

  return (
    <>
      {/* Sketch Geometry Tree */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Sketch Geometry</div>
        {/* Edges */}
        {(constraintMeta.edges.lines.length > 0 || constraintMeta.edges.circles.length > 0 || constraintMeta.edges.arcs.length > 0) && (
          <CollapsibleSection
            title="Edges"
            count={constraintMeta.edges.lines.length + constraintMeta.edges.circles.length + constraintMeta.edges.arcs.length}
          >
            {constraintMeta.edges.lines.map((line: any) => {
              const isSelected = selectedSketchEntityId === line.id;
              const len = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
              return (
                <div
                  key={line.id}
                  onClick={() => setSelectedSketchEntityId(line.id)}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                    color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                  }}
                >
                  <span>
                    {line.name ? (
                      <>
                        {line.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{line.id}</span>
                      </>
                    ) : (
                      line.id
                    )}
                  </span>
                  <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>{len.toFixed(1)}mm</span>
                </div>
              );
            })}
            {constraintMeta.edges.circles.map((c: any) => {
              const isSelected = selectedSketchEntityId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedSketchEntityId(c.id)}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                    color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                  }}
                >
                  <span>
                    {c.name ? (
                      <>
                        {c.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{c.id}</span>
                      </>
                    ) : (
                      c.id
                    )}
                  </span>
                  <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>r={c.radius.toFixed(1)}mm</span>
                </div>
              );
            })}
            {constraintMeta.edges.arcs.map((a: any) => {
              const isSelected = selectedSketchEntityId === a.id;
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedSketchEntityId(a.id)}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                    color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                  }}
                >
                  <span>
                    {a.name ? (
                      <>
                        {a.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{a.id}</span>
                      </>
                    ) : (
                      a.id
                    )}
                  </span>
                  <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>r={a.radius.toFixed(1)}mm</span>
                </div>
              );
            })}
          </CollapsibleSection>
        )}
        {/* Points */}
        {constraintMeta.edges.points.length > 0 && (
          <CollapsibleSection title="Points" count={constraintMeta.edges.points.length}>
            {constraintMeta.edges.points.map((pt: any) => {
              const isSelected = selectedSketchEntityId === pt.id;
              return (
                <div
                  key={pt.id}
                  onClick={() => setSelectedSketchEntityId(pt.id)}
                  style={{
                    fontSize: 11,
                    padding: '2px 6px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                    color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                  }}
                >
                  <span>{pt.id}</span>
                  {isSelected && (
                    <span style={{ color: 'var(--fc-textDim)', fontSize: 10, paddingLeft: 8 }}>
                      ({pt.pos[0].toFixed(1)}, {pt.pos[1].toFixed(1)})
                    </span>
                  )}
                </div>
              );
            })}
          </CollapsibleSection>
        )}
        {/* Construction */}
        {(constraintMeta.construction.lines.length > 0 || constraintMeta.construction.circles.length > 0) && (
          <CollapsibleSection
            title="Construction"
            count={
              constraintMeta.construction.lines.length +
              constraintMeta.construction.circles.length +
              constraintMeta.construction.arcs.length
            }
          >
            {constraintMeta.construction.lines.map((line: any) => (
              <div key={line.id} style={{ fontSize: 11, padding: '2px 6px', color: '#888', fontStyle: 'italic' }}>
                {line.id}
              </div>
            ))}
            {constraintMeta.construction.circles.map((c: any) => (
              <div key={c.id} style={{ fontSize: 11, padding: '2px 6px', color: '#888', fontStyle: 'italic' }}>
                {c.id} — r={c.radius.toFixed(1)}mm
              </div>
            ))}
          </CollapsibleSection>
        )}
      </div>

      {/* Constraints section */}
      <div style={sectionStyle}>
        <div
          onClick={() => setConstraintsSectionOpen((v) => !v)}
          style={{
            ...labelStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span>
            <span style={{ fontSize: 8, marginRight: 4 }}>{constraintsSectionOpen ? '\u25BE' : '\u25B8'}</span>Constraints (
            {constraintMeta.constraints.length})
          </span>
          <span style={{ fontSize: 11, color: constraintStatusColor }}>
            {constraintMeta.status}
            {constraintMeta.dof !== 0 && (
              <span style={{ marginLeft: 4, opacity: 0.75 }}>{constraintMeta.dof > 0 ? `+${constraintMeta.dof}` : constraintMeta.dof}</span>
            )}
          </span>
        </div>
        {constraintsSectionOpen && (
          <>
            {constraintMeta.timedOut && (
              <div
                style={{
                  fontSize: 11,
                  color: '#f59e0b',
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  marginBottom: 6,
                }}
              >
                Solver timed out — result may be approximate. Try simplifying constraints or using groupRect() for rigid rectangles.
              </div>
            )}
            {constraintMeta.constraints.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No constraints in this sketch</div>
            )}
            {constraintMeta.constraints.map((constraint: any) => (
              <div
                key={constraint.id}
                onClick={() => setSelectedConstraintId(constraint.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  border: selectedConstraintId === constraint.id ? '1px solid #ffcc00' : '1px solid var(--fc-borderLight)',
                  borderRadius: 6,
                  marginBottom: 6,
                  background:
                    selectedConstraintId === constraint.id
                      ? 'rgba(255,204,0,0.15)'
                      : constraint.isConflicting
                        ? 'var(--fc-errorBg)'
                        : constraint.isRedundant
                          ? `color-mix(in srgb, var(--fc-sketchRedundant) 12%, transparent)`
                          : 'var(--fc-bgOverlay)',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: constraint.isConflicting
                      ? 'var(--fc-sketchConflicting)'
                      : constraint.isRedundant
                        ? 'var(--fc-sketchRedundant)'
                        : 'var(--fc-text)',
                    width: 48,
                  }}
                >
                  {constraint.label}
                </span>
                {constraint.isDimension && constraint.value !== undefined ? (
                  <span style={{ fontSize: 12, color: 'var(--fc-text)' }}>
                    {constraint.value.toFixed(2)} {lengthUnit}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>{constraint.type}</span>
                )}
                <span style={{ fontSize: 9, color: 'var(--fc-textDim)', marginLeft: 'auto', opacity: 0.6 }}>
                  {constraint.entityIds.join(', ')}
                </span>
              </div>
            ))}
            {constraintMeta.rejected.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--fc-error)', marginBottom: 4 }}>Rejected constraints</div>
                {constraintMeta.rejected.map((constraint: any) => (
                  <div key={constraint.id} style={{ fontSize: 11, color: 'var(--fc-error)' }} title={constraint.rejectionReason}>
                    {constraint.label}
                    {constraint.rejectionReason ? ` — ${constraint.rejectionReason}` : ''}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {constraintMeta.surfaces && constraintMeta.surfaces.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--fc-textDim)',
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Surfaces ({constraintMeta.surfaces.length})</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  useForgeStore.getState().toggleSurfaces();
                }}
                style={{ cursor: 'pointer', fontSize: 13, opacity: surfacesVisible ? 1 : 0.4, userSelect: 'none' }}
                title={surfacesVisible ? 'Hide surfaces' : 'Show surfaces'}
              >
                {surfacesVisible ? '\u25C9' : '\u25CE'}
              </span>
            </div>
            {constraintMeta.surfaces.map((s: any) => {
              const palette = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];
              const color = palette[s.index % palette.length];
              const isSelected = selectedSurfaceIndex === s.index;
              const isHovered = hoveredSurfaceIndex === s.index;
              return (
                <div
                  key={s.index}
                  onClick={() => setSelectedSurfaceIndex(s.index)}
                  onMouseEnter={() => setHoveredSurfaceIndex(s.index)}
                  onMouseLeave={() => setHoveredSurfaceIndex(null)}
                  style={{
                    fontSize: 11,
                    color: 'var(--fc-text)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '4px 6px',
                    marginBottom: 3,
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                    background: isSelected ? `${color}22` : isHovered ? 'var(--fc-bgOverlay)' : 'transparent',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span
                      style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, opacity: isSelected ? 1 : 0.7 }}
                    />
                    <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                      S{s.index} — {formatArea(s.area, lengthUnit, 1)}
                    </span>
                  </div>
                  {isSelected && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--fc-textDim)',
                        paddingLeft: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <span>
                        Centroid: ({s.centroid[0].toFixed(2)}, {s.centroid[1].toFixed(2)})
                      </span>
                      <span>
                        Bounds: [{s.bounds.min[0].toFixed(1)}, {s.bounds.min[1].toFixed(1)}] → [{s.bounds.max[0].toFixed(1)},{' '}
                        {s.bounds.max[1].toFixed(1)}]
                      </span>
                      <span>
                        Seed: ({s.seed[0].toFixed(2)}, {s.seed[1].toFixed(2)})
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* Selected entity info — show constraints referencing this entity */}
        {selectedSketchEntityId &&
          constraintMeta &&
          (() => {
            const relatedConstraints = constraintMeta.constraints.filter((c: any) => c.entityIds.includes(selectedSketchEntityId));
            if (relatedConstraints.length === 0) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 4 }}>
                  Constraints on {selectedSketchEntityId} ({relatedConstraints.length})
                </div>
                {relatedConstraints.map((c: any) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedConstraintId(c.id);
                    }}
                    style={{
                      fontSize: 11,
                      padding: '3px 6px',
                      marginBottom: 2,
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: c.isConflicting ? 'var(--fc-error)' : c.isRedundant ? '#faad14' : 'var(--fc-text)',
                      background: selectedConstraintId === c.id ? 'rgba(255,204,0,0.15)' : 'transparent',
                      border: selectedConstraintId === c.id ? '1px solid #ffcc00' : '1px solid transparent',
                    }}
                  >
                    {c.label} {c.isDimension && c.value !== undefined ? `= ${c.value}` : c.type}
                  </div>
                ))}
              </div>
            );
          })()}
      </div>
    </>
  );
}
