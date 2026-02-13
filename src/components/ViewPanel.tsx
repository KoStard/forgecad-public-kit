import { useForgeStore } from '../store/forgeStore';
import type { CSSProperties } from 'react';
import type { CutPlaneDef } from '@forge/cutPlane';

const btnStyle = (active = false): CSSProperties => ({
  padding: '4px 8px',
  background: active ? 'var(--fc-accent)' : 'transparent',
  color: active ? 'var(--fc-accentText)' : 'var(--fc-textMuted)',
  border: '1px solid var(--fc-border)',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

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

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'var(--fc-bgInput)',
  border: '1px solid var(--fc-border)',
  borderRadius: 4,
  padding: '4px 6px',
  color: 'var(--fc-text)',
  fontSize: 12,
};

export function ViewPanel() {
  const renderMode = useForgeStore((s) => s.renderMode);
  const setRenderMode = useForgeStore((s) => s.setRenderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const setGridEnabled = useForgeStore((s) => s.setGridEnabled);
  const setGridSize = useForgeStore((s) => s.setGridSize);
  const result = useForgeStore((s) => s.result);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const setObjectVisibility = useForgeStore((s) => s.setObjectVisibility);
  const setObjectOpacity = useForgeStore((s) => s.setObjectOpacity);
  const setObjectColor = useForgeStore((s) => s.setObjectColor);
  const selectedObjectId = useForgeStore((s) => s.selectedObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const measureSnapPx = useForgeStore((s) => s.measureSnapPx);
  const setMeasureSnapPx = useForgeStore((s) => s.setMeasureSnapPx);
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const toggleDimensions = useForgeStore((s) => s.toggleDimensions);
  const updateSketchConstraint = useForgeStore((s) => s.updateSketchConstraint);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const setCutPlaneEnabled = useForgeStore((s) => s.setCutPlaneEnabled);
  const cutPlanes: CutPlaneDef[] = result?.cutPlanes ?? [];

  const objects = result?.objects ?? [];
  const selectedObject = objects.find((obj) => obj.id === selectedObjectId) ?? null;
  const constraintMeta = selectedObject?.sketchMeta ?? null;
  const constraintStatusColor = constraintMeta?.status === 'over'
    ? '#ff4d4f'
    : constraintMeta?.status === 'fully'
      ? '#35c759'
      : constraintMeta?.status === 'under'
        ? '#4aa3ff'
        : 'var(--fc-textDim)';

  return (
    <div
      style={{
        width: 280,
        background: 'var(--fc-bgPanel)',
        borderLeft: '1px solid var(--fc-border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--fc-borderLight)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-text)' }}>View Panel</div>
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>Viewport control center</div>
      </div>

      <div style={{ ...sectionStyle, borderTop: 'none' }}>
        <div style={labelStyle}>Render Mode</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnStyle(renderMode === 'solid')} onClick={() => setRenderMode('solid')}>Solid</button>
          <button style={btnStyle(renderMode === 'wireframe')} onClick={() => setRenderMode('wireframe')}>Wireframe</button>
          <button style={btnStyle(renderMode === 'overlay')} onClick={() => setRenderMode('overlay')}>Overlay</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Projection</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btnStyle(projectionMode === 'perspective')} onClick={() => setProjectionMode('perspective')}>Perspective</button>
          <button style={btnStyle(projectionMode === 'orthographic')} onClick={() => setProjectionMode('orthographic')}>Orthographic</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Views</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button style={btnStyle()} onClick={() => requestViewCommand({ type: 'snap', view: 'iso' })}>⌂ Home</button>
          <button style={btnStyle()} onClick={() => requestViewCommand({ type: 'fit' })}>Fit</button>
          <button
            style={btnStyle()}
            onClick={() => requestViewCommand({ type: 'zoom', targetId: selectedObjectId })}
            disabled={!selectedObjectId}
          >
            Zoom Sel
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {(['front', 'back', 'left', 'right', 'top', 'bottom'] as const).map((v) => (
            <button key={v} style={btnStyle()} onClick={() => requestViewCommand({ type: 'snap', view: v })}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <div style={labelStyle}>Objects</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {objects.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No objects loaded</div>
        )}
        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isSelected = selectedObjectId === obj.id;
          return (
            <div
              key={obj.id}
              onClick={() => selectObject(obj.id)}
              onMouseEnter={() => setHoveredObjectId(obj.id)}
              onMouseLeave={() => setHoveredObjectId(null)}
              style={{
                padding: '8px 8px',
                border: '1px solid var(--fc-borderLight)',
                borderRadius: 6,
                marginBottom: 8,
                background: isSelected ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={settings.visible}
                  onChange={(e) => setObjectVisibility(obj.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span style={{ fontSize: 12, color: 'var(--fc-text)', flex: 1 }}>{obj.name}</span>
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => setObjectColor(obj.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>Opacity</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={settings.opacity}
                  onChange={(e) => setObjectOpacity(obj.id, Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 32, textAlign: 'right' }}>{Math.round(settings.opacity * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {constraintMeta && (
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Constraints</span>
            <span style={{ fontSize: 11, color: constraintStatusColor }}>{constraintMeta.status}</span>
          </div>
          {constraintMeta.constraints.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No constraints in this sketch</div>
          )}
          {constraintMeta.constraints.map((constraint) => (
            <div
              key={constraint.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                border: '1px solid var(--fc-borderLight)',
                borderRadius: 6,
                marginBottom: 6,
                background: constraint.isConflicting ? 'var(--fc-errorBg)' : 'var(--fc-bgOverlay)',
              }}
            >
              <span style={{ fontSize: 11, color: constraint.isConflicting ? 'var(--fc-error)' : 'var(--fc-text)', width: 48 }}>
                {constraint.label}
              </span>
              {constraint.isDimension && constraint.value !== undefined ? (
                <input
                  type="number"
                  value={constraint.value}
                  onChange={(e) => {
                    const nextValue = Number(e.target.value);
                    if (Number.isNaN(nextValue) || !selectedObject) return;
                    updateSketchConstraint(selectedObject.id, constraint.id, nextValue);
                  }}
                  style={inputStyle}
                />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>{constraint.type}</span>
              )}
            </div>
          ))}
          {constraintMeta.rejected.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fc-error)', marginBottom: 4 }}>Rejected constraints</div>
              {constraintMeta.rejected.map((constraint) => (
                <div key={constraint.id} style={{ fontSize: 11, color: 'var(--fc-error)' }}>
                  {constraint.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={labelStyle}>Display</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={gridEnabled}
              onChange={(e) => setGridEnabled(e.target.checked)}
            />
            Show grid
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={dimensionsVisible}
              onChange={toggleDimensions}
            />
            Show dimensions
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>Grid size</span>
          <input
            type="number"
            min={1}
            max={200}
            value={gridSize}
            onChange={(e) => setGridSize(Math.max(1, Number(e.target.value) || 1))}
            style={inputStyle}
          />
        </div>
      </div>

      {cutPlanes.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Cut Planes</div>
          {cutPlanes.map((cp) => (
            <div key={cp.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
                <input
                  type="checkbox"
                  checked={cutPlaneEnabled[cp.name] ?? false}
                  onChange={(e) => setCutPlaneEnabled(cp.name, e.target.checked)}
                />
                ✂ {cp.name}
              </label>
            </div>
          ))}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={labelStyle}>Measure</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>Snap radius (px)</span>
          <input
            type="number"
            min={4}
            max={40}
            value={measureSnapPx}
            onChange={(e) => setMeasureSnapPx(Math.max(4, Math.min(40, Number(e.target.value) || 4)))}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}
