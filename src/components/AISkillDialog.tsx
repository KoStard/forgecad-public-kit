import React, { useState } from 'react';
import contextMd from '../../dist-skill/CONTEXT.md?raw';

type Tab = 'paste' | 'install';

export function AISkillDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('paste');
  const [copied, setCopied] = useState(false);

  const handleCopyContext = async () => {
    try {
      await navigator.clipboard.writeText(contextMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      alert(`Failed to copy to clipboard: ${e instanceof Error ? e.message : e}`);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    background: active ? 'var(--fc-bgSurface)' : 'transparent',
    color: active ? 'var(--fc-text)' : 'var(--fc-textMuted)',
    border: 'none',
    borderBottom: active ? '2px solid var(--fc-accent)' : '2px solid transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'inherit',
  });

  const codeStyle: React.CSSProperties = {
    display: 'block',
    padding: '8px 12px',
    background: 'var(--fc-bg)',
    border: '1px solid var(--fc-border)',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--fc-text)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    userSelect: 'all',
  };

  return (
    <div
      role="presentation"
      onMouseDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          background: 'var(--fc-bgPanel)',
          border: '1px solid var(--fc-border)',
          borderRadius: 8,
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
          padding: 0,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 0', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--fc-text)', flex: 1 }}>
            Use AI with ForgeCAD
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--fc-textMuted)',
              cursor: 'pointer',
              fontSize: 18,
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <p style={{ padding: '8px 16px 0', margin: 0, fontSize: 12, color: 'var(--fc-textMuted)', lineHeight: 1.5 }}>
          Give your AI assistant full knowledge of the ForgeCAD API so it can write models for you.
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--fc-border)', margin: '12px 0 0' }}>
          <button style={tabStyle(tab === 'paste')} onClick={() => setTab('paste')}>
            Paste into Chat
          </button>
          <button style={tabStyle(tab === 'install')} onClick={() => setTab('install')}>
            Agent Skill (CLI)
          </button>
        </div>

        {/* Tab content */}
        <div style={{ padding: 16 }}>
          {tab === 'paste' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fc-textMuted)', lineHeight: 1.5 }}>
                Copy the full ForgeCAD context (175 KB) to your clipboard, then paste it as the first message
                in Claude.ai, ChatGPT, Gemini, or any chat UI. The AI will then know every ForgeCAD API.
              </p>
              <button
                onClick={handleCopyContext}
                style={{
                  padding: '8px 16px',
                  background: copied ? 'var(--fc-success, #2ea043)' : 'var(--fc-accent)',
                  color: copied ? '#fff' : 'var(--fc-accentText)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
              >
                {copied ? 'Copied to clipboard!' : 'Copy ForgeCAD Context'}
              </button>
            </div>
          )}

          {tab === 'install' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fc-textMuted)', lineHeight: 1.5 }}>
                For AI coding agents (Claude Code, Codex, OpenCode, etc.), install the full multi-file skill
                so the agent can load docs on demand:
              </p>
              <code style={codeStyle}>npx forgecad skill install</code>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--fc-textMuted)', lineHeight: 1.5 }}>
                Or export a single context file for manual use:
              </p>
              <code style={codeStyle}>npx forgecad skill one-file ~/forgecad-context.md</code>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--fc-textDim)', lineHeight: 1.4 }}>
                Requires Node.js 20+. The skill is bundled in the{' '}
                <a
                  href="https://www.npmjs.com/package/forgecad"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--fc-accent)' }}
                >
                  forgecad
                </a>{' '}
                npm package.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
