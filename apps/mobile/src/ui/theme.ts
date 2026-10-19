/**
 * Placeholder look: the grey low-fidelity wireframes (docs/design/wireframes.md). Colours and
 * fonts are not decided yet; change them here only after the author picks a visual style.
 */
export const colors = {
  background: "#FFFFFF",
  surface: "#F2F2F2",
  border: "#C8C8C8",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  primary: "#333333",
  onPrimary: "#FFFFFF",
  danger: "#8A1C1C",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Every tappable thing is at least 48 dp high (NFR-07, D-24). */
export const MIN_TOUCH = 48;

export const type = {
  title: { fontSize: 24, fontWeight: "700" },
  heading: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 16 },
  small: { fontSize: 14 },
  amount: { fontSize: 32, fontWeight: "700" },
} as const;
