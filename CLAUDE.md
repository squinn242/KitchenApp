# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start           # Start Expo dev server
npm run ios         # Start on iOS simulator
npm run android     # Start on Android emulator
npm run web         # Start on web
npm run lint        # Run ESLint via expo lint
npm run reset-project  # Reset to blank Expo starter
```

There is no test runner configured yet.

## Architecture

This is a React Native app built with **Expo** (~54) and **TypeScript**, using **Expo Router** for file-based navigation.

### Routing & Navigation

- **Expo Router** handles all routing via the `app/` directory structure
- `app/_layout.tsx` — root layout; sets up `ThemeProvider` (light/dark) and a `Stack` navigator
- `app/(tabs)/_layout.tsx` — configures the bottom tab bar (Home + Explore tabs)
- `app/modal.tsx` — standalone modal screen pushed from the stack

### Theming

- Light/dark mode is driven by `hooks/use-color-scheme.ts` (with a web override at `use-color-scheme.web.ts`)
- Colors and font constants live in `constants/theme.ts`
- `hooks/use-theme-color.ts` resolves a color key to the correct light/dark value
- Platform-specific component variants use the `.ios.tsx` suffix (e.g., `components/ui/icon-symbol.ios.tsx`)

### Path Aliases

TypeScript is configured with `@/*` mapping to the project root (see `tsconfig.json`).
