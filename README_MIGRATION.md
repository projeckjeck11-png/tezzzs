# Migration README

## Source Repository
- **URL**: https://github.com/ffkr/project-z.git
- **Branch**: main

## Stack Detection
- **Frontend**: Vite + React 18 + TypeScript
- **Styling**: Tailwind CSS + shadcn-ui
- **State Management**: React useState + TanStack Query
- **Routing**: React Router DOM v6
- **Build Tool**: Vite 5.x

## How to Install & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test
```

## Environment Variables

**No environment variables required.** This application uses localStorage for data persistence and doesn't require any external API keys or secrets.

### .env.example
```env
# No environment variables needed for this project
# All data is stored locally in the browser (localStorage)
```

---

## Migration Notes (MIGRATION_NOTES)

### PHASE 0 — Intake & Audit
✅ Stack detected: Vite + React + TypeScript + Tailwind CSS + shadcn-ui
✅ Package manager: npm (also has bun.lockb)
✅ Entry point: `src/main.tsx`
✅ ENV variables: None required

### PHASE 1 — 1:1 Transfer
✅ Core pages transferred:
  - `src/pages/Index.tsx` — Main stopwatch page
  - `src/pages/NotFound.tsx` — 404 page

✅ Core components transferred:
  - `src/components/HeadChannelCard.tsx`
  - `src/components/SubChannelCard.tsx`
  - `src/components/TimelineChart.tsx`
  - `src/components/ActionBar.tsx`
  - `src/components/NotesDisplay.tsx`
  - `src/components/ImportTimeline.tsx`
  - `src/components/ImportTimelineOClock.tsx`
  - `src/components/NavLink.tsx`

✅ Core hooks transferred:
  - `src/hooks/useStopwatch.ts` — Main timing logic
  - `src/hooks/use-mobile.tsx`
  - `src/hooks/use-toast.ts`

✅ Types transferred:
  - `src/types/index.ts` — All TypeScript interfaces

✅ Dependencies added:
  - `html2canvas@^1.4.1` — For PNG export functionality
  - `@tailwindcss/typography@^0.5.16` — Typography plugin

### PHASE 2 — Wiring & Compatibility Fix
✅ All import paths verified (using `@/` alias)
✅ shadcn-ui components working
✅ Tailwind CSS configuration intact
✅ Routing configured correctly

### Minimal Changes Made
1. **Added dependency**: `html2canvas` — Required for timeline PNG export feature
2. **Added dependency**: `@tailwindcss/typography` — Required by Tailwind config

---

## UI & Feature Parity Checklist

### Pages
- [x] Index page (Main stopwatch interface)
- [x] NotFound page (404)

### Core Features
- [x] Head Channel creation and management
- [x] Sub Channel creation and management (linked to head channels)
- [x] Timer display with HH:MM:SS:CC format
- [x] Start/Pause/Reset controls
- [x] Timeline visualization
- [x] Marks recording (start/pause relative to head channel)
- [x] LocalStorage persistence
- [x] Snapshot saving (notes)
- [x] Notes display and deletion
- [x] Copy to clipboard functionality

### Import Timeline Features
- [x] Import Timeline builder (minute-based)
- [x] Import Timeline O'Clock builder (time-based HH:MM)
- [x] Cutoff timer support
- [x] PNG export functionality
- [x] Visualization preview

### UI Components
- [x] HeadChannelCard — Main timer card
- [x] SubChannelCard — Sub timer cards
- [x] TimelineChart — Visual timeline representation
- [x] ActionBar — Save/Reset/Close actions
- [x] NotesDisplay — Saved snapshots display

### Styling
- [x] Tailwind CSS design tokens
- [x] Light/dark mode support (CSS variables)
- [x] Responsive design
- [x] shadcn-ui components integration

### Technical
- [x] TypeScript types integrity
- [x] React Router v6 routing
- [x] TanStack Query setup
- [x] Toast notifications (shadcn)
- [x] Performance timing with `performance.now()`
- [x] LocalStorage recovery on page reload

---

## File Structure (Migrated)

```
src/
├── components/
│   ├── ui/                 # shadcn-ui components
│   ├── ActionBar.tsx
│   ├── HeadChannelCard.tsx
│   ├── ImportTimeline.tsx
│   ├── ImportTimelineOClock.tsx
│   ├── NavLink.tsx
│   ├── NotesDisplay.tsx
│   ├── SubChannelCard.tsx
│   └── TimelineChart.tsx
├── hooks/
│   ├── use-mobile.tsx
│   ├── use-toast.ts
│   └── useStopwatch.ts     # Core timing logic
├── lib/
│   └── utils.ts            # cn() helper
├── pages/
│   ├── Index.tsx           # Main page
│   └── NotFound.tsx
├── types/
│   └── index.ts            # TypeScript interfaces
├── App.tsx
├── App.css
├── index.css               # Tailwind + CSS variables
├── main.tsx
└── vite-env.d.ts
```

---

## Verification Results

| Test | Status |
|------|--------|
| Build successful | ✅ |
| Dev server runs | ✅ |
| Main page renders | ✅ |
| Add Head Channel works | ✅ |
| Timer display works | ✅ |
| Import Timeline UI | ✅ |
| Import Timeline O'Clock UI | ✅ |
| No TypeScript errors | ✅ |
| No console errors | ✅ |

---

## Notes

This migration maintains 1:1 parity with the source repository. All core functionality has been preserved:

1. **Multi-Channel Stopwatch** — Create multiple head channels (main timers) with linked sub-channels
2. **Timeline Tracking** — Sub-channels record marks relative to their parent head channel
3. **Persistence** — All data saved to localStorage, survives page refresh
4. **Export** — Timeline builders can export visualizations as PNG images
5. **Copy Support** — Click on timelines/notes to copy formatted text to clipboard

No redesign or major refactoring was performed. The migration followed the minimal-change principle.
