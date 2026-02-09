import { useForgeStore } from '../store/forgeStore';
import type { CSSProperties } from 'react';

const btnStyle = (active = false): CSSProperties => ({
  padding: '4px 8px',
  background: active ? '#4a9eff' : 'transparent',
  color: active ? '#fff' : '#bbb',
  border: '1px solid #444',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

const sectionStyle: CSSProperties = {
  borderTop: '1px solid #2b2b2b',
  padding: '10px 12px',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#9aa0a6',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
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
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const measureSnapPx = useForgeStore((s) => s.measureSnapPx);
  const setMeasureSnapPx = useForgeStore((s) => s.setMeasureSnapPx);
  const updateSketchConstraint = useForgeStore((s) => s.updateSketchConstraint);

  const objects = result?.objects ?? [];
  const selectedObject = objects.find((obj) => obj.id === selectedObjectId) ?? null;
  const constraintMeta = selectedObject?.sketchMeta ?? null;
  const constraintStatusColor = constraintMeta?.status === 'over'
    ? '#ff4d4f'
    : constraintMeta?.status === 'fully'
      ? '#35c759'
      : constraintMeta?.status === 'under'
        ? '#4aa3ff'
        : '#777';

  return (
    <div
      style={{
        width: 280,
        background: '#1f1f1f',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2b2b2b' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e1e1e1' }}>View Panel</div>
        <div style={{ fontSize: 11, color: '#777' }}>Viewport control center</div>
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
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btnStyle()} onClick={() => requestViewCommand({ type: 'fit' })}>Fit View</button>
          <button
            style={btnStyle()}
            onClick={() => requestViewCommand({ type: 'zoom', targetId: selectedObjectId })}
            disabled={!selectedObjectId}
          >
            Zoom Selection
          </button>
        </div>
      </div>

      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <div style={labelStyle}>Objects</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {objects.length === 0 && (
          <div style={{ fontSize: 12, color: '#666', padding: '6px 0' }}>No objects loaded</div>
        )}
        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isSelected = selectedObjectId === obj.id;
          return (
            <div
              key={obj.id}
              onClick={() => selectObject(obj.id)}
              style={{
                padding: '8px 8px',
                border: '1px solid #2d2d2d',
                borderRadius: 6,
                marginBottom: 8,
                background: isSelected ? '#2a3440' : '#202020',
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
                <span style={{ fontSize: 12, color: '#e3e3e3', flex: 1 }}>{obj.name}</span>
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => setObjectColor(obj.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#777' }}>Opacity</span>
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
                <span style={{ fontSize: 11, color: '#777', width: 32, textAlign: 'right' }}>{Math.round(settings.opacity * 100)}%</span>
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
            <div style={{ fontSize: 12, color: '#666', padding: '6px 0' }}>No constraints in this sketch</div>
          )}
          {constraintMeta.constraints.map((constraint) => (
            <div
              key={constraint.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                marginBottom: 6,
                background: constraint.isConflicting ? '#3a1d1d' : '#202020',
              }}
            >
              <span style={{ fontSize: 11, color: constraint.isConflicting ? '#ff4d4f' : '#cfcfcf', width: 48 }}>
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
                  style={{
                    flex: 1,
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: 4,
                    padding: '4px 6px',
                    color: '#ddd',
                    fontSize: 12,
                  }}
                />
              ) : (
                <span style={{ fontSize: 12, color: '#888' }}>{constraint.type}</span>
              )}
            </div>
          ))}
          {constraintMeta.rejected.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#ff4d4f', marginBottom: 4 }}>Rejected constraints</div>
              {constraintMeta.rejected.map((constraint) => (
                <div key={constraint.id} style={{ fontSize: 11, color: '#ff4d4f' }}>
                  {constraint.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={sectionStyle}>
        <div style={labelStyle}>Grid</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ccc' }}>
            <input
              type="checkbox"
              checked={gridEnabled}
              onChange={(e) => setGridEnabled(e.target.checked)}
            />
            Show grid
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Grid size</span>
          <input
            type="number"
            min={1}
            max={200}
            value={gridSize}
            onChange={(e) => setGridSize(Math.max(1, Number(e.target.value) || 1))}
            style={{
              flex: 1,
              background: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              padding: '4px 6px',
              color: '#ddd',
              fontSize: 12,
            }}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Measure</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Snap radius (px)</span>
          <input
            type="number"
            min={4}
            max={40}
            value={measureSnapPx}
            onChange={(e) => setMeasureSnapPx(Math.max(4, Math.min(40, Number(e.target.value) || 4)))}
            style={{
              flex: 1,
              background: '#111',
              border: '1px solid #333',
              borderRadius: 4,
              padding: '4px 6px',
              color: '#ddd',
              fontSize: 12,
            }}
          />
        </div>
      </div>
    </div>
  );
}
