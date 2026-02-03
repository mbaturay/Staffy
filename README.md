# Staffy

A note-reading reflex game built with Phaser 3 + TypeScript + Vite.

## Run

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

## Controls

- Click/tap the piano keys
- Or use the keyboard mapping below

## Keyboard Mapping (Naturals Only)

Two octaves from C4 to B5:

```
C4  D4  E4  F4  G4  A4  B4  C5  D5  E5  F5  G5  A5  B5
 A   S   D   F   G   H   J   K   L   ;   '   Z   X   C
```

## Notes & Ranges

- Notes: C4 through B5 (naturals only)
- Treble staff rendering with ledger lines

## TODO: Accidentals

Accidentals (black keys) are shown but inactive. To enable later:
- Add accidental notes to `src/game/notes.ts`
- Add input mapping and allow black keys to be interactive
- Update note spawning to include accidentals
