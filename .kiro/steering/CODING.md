# ForgeCAD Coding Guidelines

## Development Workflow

### Building & Running
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### Project Structure
```
src/
├── forge/           # Core geometry kernel & API
├── components/      # React UI components
├── store/           # Zustand state management
├── examples/        # Example CAD scripts
└── App.tsx          # Main application
```

## Coding Standards

### Minimal Implementation
Write only the code needed to solve the problem. No verbose implementations, no speculative features.

### TypeScript
- Use explicit types for function parameters and return values
- Avoid `any` - use `unknown` or proper types
- Prefer interfaces for object shapes

### React Components
- Functional components only
- Inline styles for simplicity (no CSS files unless necessary)
- Extract reusable logic to custom hooks or store actions

### State Management
- All global state lives in `forgeStore.ts`
- Use Zustand selectors to prevent unnecessary re-renders
- Keep actions pure and synchronous where possible

## Git Workflow

### Commit Every Major Change
Each logical unit of work should be a separate commit:

```bash
git add <files>
git commit -m "Add file explorer panel"
```

### Commit Message Format
```
<verb> <what>

Examples:
- Add file explorer panel
- Fix measure mode toggle
- Update parameter slider styling
- Remove unused imports
```

Use present tense verbs: Add, Fix, Update, Remove, Refactor

### What Counts as "Major"
- New feature or component
- Bug fix
- Refactoring that changes structure
- Performance improvement
- Breaking API change

### What to Commit Together
- Related files for a single feature
- Tests with the code they test
- Documentation with the feature it describes

### Example Workflow
```bash
# Feature: Add file explorer
git add src/components/FileExplorer.tsx
git add src/store/forgeStore.ts
git add src/App.tsx
git commit -m "Add file explorer panel"

# Next feature: Add keyboard shortcuts
git add src/hooks/useKeyboard.ts
git add src/App.tsx
git commit -m "Add keyboard shortcuts for file operations"
```

## Testing

### Manual Testing Checklist
Before committing UI changes:
- [ ] Test in browser at localhost:5173
- [ ] Check console for errors
- [ ] Verify responsive behavior
- [ ] Test with example scripts

### Integration Testing
- Load example files and verify they render
- Test parameter sliders update geometry
- Verify STL export produces valid files
- Check measure mode calculates correctly

## Code Review

### Self-Review Before Commit
1. Remove console.logs and debug code
2. Check for unused imports
3. Verify TypeScript has no errors
4. Test the change works as intended
5. Read the diff - does it make sense?

### What to Look For
- Does this solve the problem with minimal code?
- Are there edge cases not handled?
- Is the code readable without comments?
- Does it follow existing patterns?

## Performance

### Geometry Operations
- Manifold operations are expensive - minimize boolean ops
- Cache geometry results when parameters don't change
- Use debouncing for real-time updates (already implemented)

### React Rendering
- Use Zustand selectors to prevent unnecessary re-renders
- Memoize expensive computations with `useMemo`
- Keep component tree shallow

## Common Patterns

### Adding a New Primitive
1. Add function to `forge/primitives.ts`
2. Export from `forge/index.ts`
3. Update examples if useful
4. Commit: "Add [primitive] geometry primitive"

### Adding UI State
1. Add to `forgeStore.ts` interface
2. Add initial value and actions
3. Wire up to component
4. Commit: "Add [feature] UI state"

### Adding a Component
1. Create in `components/`
2. Import and use in `App.tsx` or parent
3. Commit: "Add [Component] component"
