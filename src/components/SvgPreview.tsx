import { useForgeStore } from '../store/forgeStore';

export function SvgPreview() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);

  if (!activeFile || !activeFile.toLowerCase().endsWith('.svg')) return null;

  const svgContent = files[activeFile];
  if (!svgContent) return null;

  // Ensure the SVG element fills its container by injecting width/height="100%"
  // if the SVG tag doesn't already have them. SVGs with only viewBox and no
  // explicit dimensions collapse to 0×0 inside a flex container.
  const sized = svgContent.replace(/(<svg\b)(?![^>]*\bwidth\s*=)/i, '$1 width="100%" height="100%"');

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
        padding: 40,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: renders trusted compiler-generated SVG
        dangerouslySetInnerHTML={{ __html: sized }}
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
