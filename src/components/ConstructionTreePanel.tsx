import { useState, useMemo, useEffect, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import type { Shape } from '@forge/index';
import { getShapeCompilePlan } from '@forge/kernel';
import type { ShapeCompilePlan, ShapeCompileTransformStep } from '@forge/compilePlan';
import { useForgeStore } from '../store/forgeStore';

const fmt = (n: number): string => {
  const s = (Math.round(n * 1000) / 1000).toString();
  return s;
};

const planLabel = (plan: ShapeCompilePlan): string => {
  switch (plan.kind) {
    case 'box': return `Box ${fmt(plan.x)} × ${fmt(plan.y)} × ${fmt(plan.z)}`;
    case 'cylinder': {
      const rLabel = plan.radiusTop !== undefined && plan.radiusTop !== plan.radius
        ? `r=${fmt(plan.radius)}→${fmt(plan.radiusTop)}`
        : `r=${fmt(plan.radius)}`;
      return `Cylinder ${rLabel} h=${fmt(plan.height)}`;
    }
    case 'sphere': return `Sphere r=${fmt(plan.radius)}`;
    case 'extrude': return `Extrude h=${fmt(plan.height)}`;
    case 'revolve': return `Revolve ${fmt(plan.degrees)}°`;
    case 'loft': return `Loft (${plan.profiles.length} profiles)`;
    case 'sweep': return 'Sweep';
    case 'boolean':
      return plan.op === 'union' ? 'Union'
        : plan.op === 'difference' ? 'Difference'
        : 'Intersection';
    case 'transform': {
      const kinds = [...new Set(plan.steps.map((s) => s.kind))];
      return kinds.length > 0 ? `Transform (${kinds.join(', ')})` : 'Transform';
    }
    case 'fillet': return `Fillet r=${fmt(plan.radius)}`;
    case 'chamfer': return `Chamfer ${fmt(plan.size)}`;
    case 'shell': return `Shell t=${fmt(plan.thickness)}`;
    case 'hole': return 'Hole';
    case 'cut': return 'Cut';
    case 'trimByPlane': return 'Trim by Plane';
    case 'sheetMetal': return 'Sheet Metal';
    case 'queryOwner': return planLabel(plan.base);
    default: return (plan as { kind: string }).kind;
  }
};

const planChildren = (plan: ShapeCompilePlan): ShapeCompilePlan[] => {
  switch (plan.kind) {
    case 'boolean': return plan.shapes;
    case 'transform': return [plan.base];
    case 'queryOwner': return planChildren(plan.base);
    case 'shell': return [plan.base];
    case 'hole': return [plan.base];
    case 'cut': return [plan.base];
    case 'fillet': return [plan.base];
    case 'chamfer': return [plan.base];
    case 'trimByPlane': return [plan.base];
    default: return [];
  }
};

// Resolve through transparent queryOwner wrappers
const resolvePlan = (plan: ShapeCompilePlan): ShapeCompilePlan =>
  plan.kind === 'queryOwner' ? resolvePlan(plan.base) : plan;

// Build the ghost plan for a given path, wrapping with any ancestor transforms so the
// sub-shape appears at its final (post-transform) world position within the object.
const getPlanForGhost = (rootPlan: ShapeCompilePlan, path: string): ShapeCompilePlan => {
  const parts = path === 'root' ? [] : path.split('/').slice(1);
  let current = resolvePlan(rootPlan);
  const transformSteps: ShapeCompileTransformStep[][] = [];

  for (const part of parts) {
    if (current.kind === 'transform') {
      transformSteps.push(current.steps);
    }
    const children = planChildren(current);
    current = resolvePlan(children[parseInt(part, 10)]);
  }

  // Wrap innermost-last: reduceRight means outermost ancestor wraps outermost
  return transformSteps.reduceRight(
    (plan, steps): ShapeCompilePlan => ({ kind: 'transform', base: plan, steps }),
    current,
  );
};

// Collect paths that should be auto-expanded: root and any direct boolean children
const collectAutoExpanded = (plan: ShapeCompilePlan, path: string, depth: number): Set<string> => {
  const expanded = new Set<string>();
  if (depth > 1) return expanded;
  expanded.add(path);
  const children = planChildren(plan);
  children.forEach((child, i) => {
    const childPath = `${path}/${i}`;
    const nested = collectAutoExpanded(child, childPath, depth + 1);
    nested.forEach((p) => expanded.add(p));
  });
  return expanded;
};

// Flatten visible nodes in DFS order for keyboard navigation
type FlatNode = { path: string; plan: ShapeCompilePlan };

const flattenVisible = (
  plan: ShapeCompilePlan,
  path: string,
  expandedSet: Set<string>,
): FlatNode[] => {
  if (plan.kind === 'queryOwner') return flattenVisible(plan.base, path, expandedSet);
  const result: FlatNode[] = [{ path, plan }];
  if (expandedSet.has(path)) {
    planChildren(plan).forEach((child, i) => {
      result.push(...flattenVisible(child, `${path}/${i}`, expandedSet));
    });
  }
  return result;
};

function ConstructionNode({
  plan,
  depth,
  path,
  expandedSet,
  selectedPath,
  onToggle,
  onSelect,
}: {
  plan: ShapeCompilePlan;
  depth: number;
  path: string;
  expandedSet: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  if (plan.kind === 'queryOwner') {
    return (
      <ConstructionNode
        plan={plan.base}
        depth={depth}
        path={path}
        expandedSet={expandedSet}
        selectedPath={selectedPath}
        onToggle={onToggle}
        onSelect={onSelect}
      />
    );
  }

  const children = planChildren(plan);
  const hasChildren = children.length > 0;
  const isExpanded = expandedSet.has(path);
  const isSelected = selectedPath === path;
  const label = planLabel(plan);

  const rowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    paddingLeft: 8 + depth * 14,
    cursor: 'pointer',
    borderRadius: 4,
    fontSize: 12,
    color: isSelected ? 'var(--fc-accent, #4a9eff)' : 'var(--fc-text)',
    userSelect: 'none',
    background: isSelected || hovered ? 'var(--fc-bgActive)' : 'transparent',
    fontWeight: isSelected ? 600 : 400,
  };

  const handleArrowClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (hasChildren) onToggle(path);
  };

  const handleRowClick = (): void => {
    onSelect(path);
  };

  const handleRowDoubleClick = (e: MouseEvent): void => {
    e.stopPropagation();
    if (hasChildren) onToggle(path);
  };

  return (
    <div>
      <div
        style={rowStyle}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          style={{ width: 16, fontSize: 10, color: 'var(--fc-textDim)', flexShrink: 0, textAlign: 'center', cursor: hasChildren ? 'pointer' : 'default' }}
          onClick={handleArrowClick}
        >
          {hasChildren ? (isExpanded ? '▾' : '▸') : '·'}
        </span>
        <span>{label}</span>
      </div>
      {hasChildren && isExpanded && children.map((child, i) => (
        <ConstructionNode
          key={i}
          plan={child}
          depth={depth + 1}
          path={`${path}/${i}`}
          expandedSet={expandedSet}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function ConstructionTreePanel({ shape, objectId }: { shape: Shape; objectId: string }) {
  const plan = useMemo(() => getShapeCompilePlan(shape), [shape]);
  const setConstructionGhost = useForgeStore((s) => s.setConstructionGhost);
  const constructionGhost = useForgeStore((s) => s.constructionGhost);

  const initialExpanded = useMemo(
    () => plan ? collectAutoExpanded(plan, 'root', 0) : new Set<string>(),
    [plan],
  );

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(initialExpanded);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Clear local selection if ghost is actively set for a different object
  useEffect(() => {
    if (constructionGhost !== null && constructionGhost.objectId !== objectId) {
      setSelectedPath(null);
    }
  }, [constructionGhost, objectId]);

  if (!plan) return null;

  const togglePath = (path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Update selection and ghost for a path.
  // null = full deselect (Escape). 'root' = highlight root, clear ghost. else = highlight + ghost.
  const applyGhost = (path: string | null): void => {
    if (!path) {
      setSelectedPath(null);
      setConstructionGhost(null);
    } else if (path === 'root') {
      setSelectedPath('root');
      setConstructionGhost(null);
    } else {
      setSelectedPath(path);
      setConstructionGhost({ plan: getPlanForGhost(plan, path), objectId });
    }
  };

  const handleSelect = (path: string): void => {
    applyGhost(path);
  };

  // Keyboard navigation
  const flatNodes = flattenVisible(plan, 'root', expandedPaths);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const idx = selectedPath ? flatNodes.findIndex((n) => n.path === selectedPath) : -1;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = flatNodes[Math.max(idx, 0) + (idx >= 0 ? 1 : 0)];
        if (next) applyGhost(next.path);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (idx > 0) applyGhost(flatNodes[idx - 1].path);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (!selectedPath) break;
        const node = flatNodes[idx];
        if (!node || planChildren(node.plan).length === 0) break;
        if (!expandedPaths.has(selectedPath)) {
          togglePath(selectedPath);
        } else {
          // move into first child
          const firstChild = flatNodes[idx + 1];
          if (firstChild) applyGhost(firstChild.path);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (!selectedPath || selectedPath === 'root') break;
        if (expandedPaths.has(selectedPath)) {
          togglePath(selectedPath);
        } else {
          // go to parent
          const parentPath = selectedPath.substring(0, selectedPath.lastIndexOf('/'));
          applyGhost(parentPath || null);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        applyGhost(null);
        break;
      }
      default: break;
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--fc-borderLight)', padding: '10px 12px' }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--fc-textDim)',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}>
        Construction
      </div>
      <div
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          border: '1px solid var(--fc-borderLight)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--fc-bgOverlay)',
          padding: '4px 0',
          outline: 'none',
        }}
      >
        <ConstructionNode
          plan={plan}
          depth={0}
          path="root"
          expandedSet={expandedPaths}
          selectedPath={selectedPath}
          onToggle={togglePath}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}
