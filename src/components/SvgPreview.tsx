import { useForgeStore } from '../store/forgeStore';

export function SvgPreview() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);

  if (!activeFile || !activeFile.toLowerCase().endsWith('.svg')) return null;

  const svgContent = files[activeFile];
  if (!svgContent) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--fc-bg)',
        zIndex: 10,
        overflow: 'auto',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          maxHeight: '80%',
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'var(--fc-textDim)',
          fontSize: 12,
          userSelect: 'none',
        }}
      >
        {activeFile}
      </div>
    </div>
  );
}
