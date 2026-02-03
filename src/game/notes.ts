export type NoteName =
  | 'C4' | 'D4' | 'E4' | 'F4' | 'G4' | 'A4' | 'B4'
  | 'C5' | 'D5' | 'E5' | 'F5' | 'G5' | 'A5' | 'B5';

export const NOTES_NATURAL: NoteName[] = [
  'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
  'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
];

const NOTE_TO_MIDI: Record<NoteName, number> = {
  C4: 60,
  D4: 62,
  E4: 64,
  F4: 65,
  G4: 67,
  A4: 69,
  B4: 71,
  C5: 72,
  D5: 74,
  E5: 76,
  F5: 77,
  G5: 79,
  A5: 81,
  B5: 83,
};

const MIDI_TO_NOTE: Record<number, NoteName> = Object.fromEntries(
  Object.entries(NOTE_TO_MIDI).map(([name, midi]) => [midi, name as NoteName]),
);

// Staff index: 0 = E4 (bottom line), 1 = F4 (space), 2 = G4 (line), ...
const NOTE_TO_STAFF_INDEX: Record<NoteName, number> = {
  C4: -2,
  D4: -1,
  E4: 0,
  F4: 1,
  G4: 2,
  A4: 3,
  B4: 4,
  C5: 5,
  D5: 6,
  E5: 7,
  F5: 8,
  G5: 9,
  A5: 10,
  B5: 11,
};

export function getRandomNote(): NoteName {
  const index = Math.floor(Math.random() * NOTES_NATURAL.length);
  return NOTES_NATURAL[index];
}

export function getMidi(note: NoteName): number {
  return NOTE_TO_MIDI[note];
}

export function noteNameToMidi(note: NoteName): number {
  return NOTE_TO_MIDI[note];
}

export function midiToNoteName(midi: number): NoteName | undefined {
  return MIDI_TO_NOTE[midi];
}

export function getNaturalNoteMidisInRange(): number[] {
  return NOTES_NATURAL.map((note) => NOTE_TO_MIDI[note]);
}

export function getStaffIndex(note: NoteName): number {
  return NOTE_TO_STAFF_INDEX[note];
}

// Keyboard mapping for 2 octaves of naturals (QWERTY).
export const KEYBOARD_NOTE_MAP: Record<string, NoteName> = {
  a: 'C4',
  s: 'D4',
  d: 'E4',
  f: 'F4',
  g: 'G4',
  h: 'A4',
  j: 'B4',
  k: 'C5',
  l: 'D5',
  ';': 'E5',
  "'": 'F5',
  z: 'G5',
  x: 'A5',
  c: 'B5',
};
