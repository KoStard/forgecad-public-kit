export type EditorSurface = 'monaco' | 'notebook';

type ShortcutEvent = Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'defaultPrevented' | 'isComposing' | 'key' | 'metaKey'>;

const SHARED_BLOCKED_SHORTCUTS = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '[',
  ']',
  'd',
  'l',
  'o',
  'p',
  'r',
  's',
  't',
  'w',
]);

const MONACO_BLOCKED_SHORTCUTS = new Set(['f', 'g', 'h', 'y', 'z']);

export function getShortcutKey(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  if (event.code.startsWith('Digit') && event.code.length === 6) {
    return event.code.slice(5);
  }

  if (event.code.startsWith('Key') && event.code.length === 4) {
    return event.code.slice(3).toLowerCase();
  }

  if (event.code === 'BracketLeft') return '[';
  if (event.code === 'BracketRight') return ']';

  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

export function hasPrimaryModifier(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.metaKey || event.ctrlKey;
}

export function isSaveShortcut(event: ShortcutEvent): boolean {
  return !event.altKey && hasPrimaryModifier(event) && getShortcutKey(event) === 's';
}

export function shouldBlockBrowserShortcut(event: ShortcutEvent, surface: EditorSurface): boolean {
  if (event.defaultPrevented || event.isComposing) return false;
  if (event.altKey || !hasPrimaryModifier(event)) return false;

  const key = getShortcutKey(event);
  if (SHARED_BLOCKED_SHORTCUTS.has(key)) return true;
  if (surface === 'monaco' && MONACO_BLOCKED_SHORTCUTS.has(key)) return true;
  return false;
}
