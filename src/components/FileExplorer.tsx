import { useForgeStore } from '../store/forgeStore';
import { EXAMPLE_PHONE_STAND } from '../examples/defaults';

const examples = [
  { name: 'Phone Stand', code: EXAMPLE_PHONE_STAND },
];

export function FileExplorer() {
  const loadFromText = useForgeStore((s) => s.loadFromText);

  return (
    <div style={{
      width: 220,
      background: '#252525',
      borderRight: '1px solid #333',
      display: 'flex',
      flexDirection: 'column',
      fontSize: 13,
    }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        fontWeight: 600,
        color: '#aaa',
      }}>
        Examples
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {examples.map((ex) => (
          <div
            key={ex.name}
            onClick={() => loadFromText(ex.code, `${ex.name}.forge.js`)}
            style={{
              padding: '6px 12px',
              cursor: 'pointer',
              color: '#ccc',
              borderBottom: '1px solid #2a2a2a',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2d2d2d'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            📄 {ex.name}
          </div>
        ))}
      </div>
    </div>
  );
}
