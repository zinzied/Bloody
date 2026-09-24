// Centralized semantic color tokens for the TUI.
// All pages/components should reference these instead of literal ANSI color names,
// so the palette stays consistent and future truecolor/dark-light support is a one-file change.
export const theme = {
  brand: 'magenta',   // app name, banner
  accent: 'cyan',     // page titles, table headers, active nav, borders, input labels
  section: 'yellow',  // section headings, form titles
  ok: 'green',        // success lines, positive badges
  err: 'red',         // error lines, negative badges
  dim: 'gray',        // secondary text, hints, inactive nav
  fg: 'white',        // default foreground
  inverse: 'black',   // badge foreground / input background
} as const;

export type ThemeRole = keyof typeof theme;