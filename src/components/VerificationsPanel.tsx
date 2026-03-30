import type { VerificationResult } from '@forge/index';
import { useEffect, useRef, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';

function PassIcon() {
  return (
    <span
      aria-label="pass"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--fc-success, #4caf50)',
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      ✓
    </span>
  );
}

function FailIcon() {
  return (
    <span
      aria-label="fail"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--fc-warning, #e6a817)',
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      ✕
    </span>
  );
}

interface VerificationRowProps {
  result: VerificationResult;
  onNavigate?: (line: number) => void;
}

function VerificationRow({ result, onNavigate }: VerificationRowProps) {
  const isFail = result.status === 'fail';
  const canNavigate = isFail && result.line != null;

  return (
    <div
      title={canNavigate ? `Click to jump to line ${result.line}` : undefined}
      onClick={canNavigate ? () => onNavigate?.(result.line!) : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '4px 0',
        cursor: canNavigate ? 'pointer' : 'default',
        borderRadius: 3,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (canNavigate) (e.currentTarget as HTMLDivElement).style.background = 'var(--fc-bgHover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '';
      }}
    >
      <div style={{ paddingTop: 1 }}>{isFail ? <FailIcon /> : <PassIcon />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              color: isFail ? 'var(--fc-warning, #e6a817)' : 'var(--fc-text)',
              fontWeight: 500,
              fontSize: 12,
            }}
          >
            {result.label}
          </span>
          {result.line != null && isFail && (
            <span
              style={{
                color: 'var(--fc-textDim)',
                fontSize: 10,
                fontFamily: 'monospace',
                background: 'var(--fc-bgHover)',
                padding: '1px 4px',
                borderRadius: 2,
              }}
            >
              line {result.line}
            </span>
          )}
        </div>
        <div
          style={{
            color: isFail ? 'var(--fc-textMuted, #999)' : 'var(--fc-textDim)',
            fontSize: 11,
            marginTop: 1,
            fontFamily: 'monospace',
            wordBreak: 'break-word',
          }}
        >
          {result.message}
        </div>
        {isFail && (result.expected != null || result.actual != null) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 10, fontFamily: 'monospace' }}>
            {result.expected != null && <span style={{ color: 'var(--fc-success, #4caf50)' }}>expected: {result.expected}</span>}
            {result.actual != null && <span style={{ color: 'var(--fc-warning, #e6a817)' }}>actual: {result.actual}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spec group — collapsible section for grouped verification results
// ---------------------------------------------------------------------------

interface SpecGroupProps {
  name: string;
  results: VerificationResult[];
  onNavigate?: (line: number) => void;
}

function SpecGroup({ name, results, onNavigate }: SpecGroupProps) {
  const failures = results.filter((v) => v.status === 'fail');
  const passes = results.filter((v) => v.status === 'pass');
  const hasFailures = failures.length > 0;
  const [collapsed, setCollapsed] = useState(!hasFailures);

  // Auto-expand when failures appear
  const prevHadFailures = useRef(hasFailures);
  useEffect(() => {
    if (hasFailures && !prevHadFailures.current) setCollapsed(false);
    prevHadFailures.current = hasFailures;
  }, [hasFailures]);

  const headerColor = hasFailures ? 'var(--fc-warning, #e6a817)' : 'var(--fc-success, #4caf50)';

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 0',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--fc-textDim)', width: 10 }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ color: headerColor, fontSize: 12 }}>{hasFailures ? '⚠' : '✓'}</span>
        <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--fc-text)' }}>{name}</span>
        <span
          style={{
            background: headerColor,
            color: 'var(--fc-bg)',
            borderRadius: 8,
            padding: '1px 6px',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {passes.length}/{results.length}
        </span>
      </div>
      {!collapsed && (
        <div style={{ paddingLeft: 18 }}>
          {failures.map((v) => (
            <VerificationRow key={v.id} result={v} onNavigate={onNavigate} />
          ))}
          {passes.length > 0 && failures.length > 0 && <div style={{ borderTop: '1px solid var(--fc-border)', margin: '4px 0' }} />}
          {passes.map((v) => (
            <VerificationRow key={v.id} result={v} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function VerificationsPanel() {
  const verifications = useForgeStore((s) => s.result?.verifications) ?? [];
  const requestEditorNavigate = useForgeStore((s) => s.requestEditorNavigate);
  const [collapsed, setCollapsed] = useState(true);
  const prevHadFailures = useRef(false);

  // Split into grouped (spec) and ungrouped results, preserving insertion order for groups
  const groupOrder: string[] = [];
  const groups = new Map<string, VerificationResult[]>();
  const ungrouped: VerificationResult[] = [];

  for (const v of verifications) {
    if (v.group) {
      if (!groups.has(v.group)) {
        groupOrder.push(v.group);
        groups.set(v.group, []);
      }
      groups.get(v.group)!.push(v);
    } else {
      ungrouped.push(v);
    }
  }

  const failures = verifications.filter((v) => v.status === 'fail');
  const passes = verifications.filter((v) => v.status === 'pass');
  const hasFailures = failures.length > 0;

  // Auto-expand when new failures appear
  useEffect(() => {
    if (hasFailures && !prevHadFailures.current) setCollapsed(false);
    prevHadFailures.current = hasFailures;
  }, [hasFailures]);

  if (verifications.length === 0) return null;

  const headerColor = hasFailures ? 'var(--fc-warning, #e6a817)' : 'var(--fc-success, #4caf50)';
  const ungroupedFailures = ungrouped.filter((v) => v.status === 'fail');
  const ungroupedPasses = ungrouped.filter((v) => v.status === 'pass');

  return (
    <div
      style={{
        maxHeight: '40%',
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid var(--fc-border)',
        background: 'var(--fc-bg)',
      }}
    >
      <div onClick={() => setCollapsed(!collapsed)} className="fc-panel-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: headerColor, fontSize: 13 }}>{hasFailures ? '⚠' : '✓'}</span>
          <span>Checks</span>
          <span
            style={{
              display: 'inline-flex',
              gap: 4,
              alignItems: 'center',
              marginLeft: 2,
            }}
          >
            {hasFailures && (
              <span
                style={{
                  background: 'var(--fc-warning, #e6a817)',
                  color: 'var(--fc-bg)',
                  borderRadius: 8,
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {failures.length} failed
              </span>
            )}
            {passes.length > 0 && (
              <span
                style={{
                  background: 'var(--fc-success, #4caf50)',
                  color: 'var(--fc-bg)',
                  borderRadius: 8,
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {passes.length} passed
              </span>
            )}
          </span>
        </span>
        <span style={{ fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div
          style={{
            overflowY: 'auto',
            padding: '0 12px 8px',
          }}
        >
          {/* Spec groups first */}
          {groupOrder.map((groupName) => (
            <SpecGroup key={groupName} name={groupName} results={groups.get(groupName)!} onNavigate={requestEditorNavigate} />
          ))}

          {/* Separator between groups and ungrouped */}
          {groupOrder.length > 0 && ungrouped.length > 0 && <div style={{ borderTop: '1px solid var(--fc-border)', margin: '6px 0' }} />}

          {/* Ungrouped results (backward-compatible flat list) */}
          {ungroupedFailures.map((v) => (
            <VerificationRow key={v.id} result={v} onNavigate={requestEditorNavigate} />
          ))}
          {ungroupedPasses.length > 0 && ungroupedFailures.length > 0 && (
            <div style={{ borderTop: '1px solid var(--fc-border)', margin: '4px 0' }} />
          )}
          {ungroupedPasses.map((v) => (
            <VerificationRow key={v.id} result={v} />
          ))}
        </div>
      )}
    </div>
  );
}
