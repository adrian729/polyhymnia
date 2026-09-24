// Template-literal token grammars (interface.md). The types live in `model/` so that
// `NotationOptions` can reference `DurationToken` without the options type depending on
// the builder layer; the parsers that consume them live in `build/`.

export type PitchLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type AccidentalToken = '' | '#' | '##' | 'b' | 'bb';
export type DurationBaseToken = 'b' | 'w' | 'h' | 'q' | '8' | '16' | '32' | '64';
export type DotsToken = '' | '.' | '..';

/** "C4" "F#5" "Bb3" */
export type PitchToken = `${PitchLetter}${AccidentalToken}${number}`;

/** "q" "q." "8.." */
export type DurationToken = `${DurationBaseToken}${DotsToken}`;
