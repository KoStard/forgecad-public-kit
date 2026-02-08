import { useForgeStore } from '../store/forgeStore';

export function ExportPanel() {
  const result = useForgeStore((s) => s.result);

  const exportSTL = () => {
    if (!result?.shape) return;
    const mesh = result.shape.getMesh();
    const numTri = mesh.numTri;
    const numProp = mesh.numProp;

    // Binary STL format
    const bufferSize = 84 + numTri * 50;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // 80-byte header
    const header = 'ForgeCAD STL Export';
    for (let i = 0; i < 80; i++) {
      view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }
    view.setUint32(80, numTri, true);

    let offset = 84;
    for (let t = 0; t < numTri; t++) {
      const i0 = mesh.triVerts[t * 3];
      const i1 = mesh.triVerts[t * 3 + 1];
      const i2 = mesh.triVerts[t * 3 + 2];

      const v0 = [mesh.vertProperties[i0 * numProp], mesh.vertProperties[i0 * numProp + 1], mesh.vertProperties[i0 * numProp + 2]];
      const v1 = [mesh.vertProperties[i1 * numProp], mesh.vertProperties[i1 * numProp + 1], mesh.vertProperties[i1 * numProp + 2]];
      const v2 = [mesh.vertProperties[i2 * numProp], mesh.vertProperties[i2 * numProp + 1], mesh.vertProperties[i2 * numProp + 2]];

      // Compute face normal
      const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) || 1;

      // Normal
      view.setFloat32(offset, n[0] / len, true); offset += 4;
      view.setFloat32(offset, n[1] / len, true); offset += 4;
      view.setFloat32(offset, n[2] / len, true); offset += 4;
      // Vertices
      for (const v of [v0, v1, v2]) {
        view.setFloat32(offset, v[0], true); offset += 4;
        view.setFloat32(offset, v[1], true); offset += 4;
        view.setFloat32(offset, v[2], true); offset += 4;
      }
      // Attribute byte count
      view.setUint16(offset, 0, true); offset += 2;
    }

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forge-export.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid #333' }}>
      <button
        onClick={exportSTL}
        disabled={!result?.shape}
        style={{
          width: '100%',
          padding: '6px',
          background: result?.shape ? '#4a9eff' : '#333',
          color: result?.shape ? '#fff' : '#666',
          border: 'none',
          borderRadius: 4,
          cursor: result?.shape ? 'pointer' : 'default',
          fontSize: 13,
        }}
      >
        Export STL
      </button>
    </div>
  );
}
