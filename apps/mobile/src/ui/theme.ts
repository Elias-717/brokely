/**
 * Brokely's look: "vintage cartoon" in black and green (D-31), with a dark mode (D-32).
 * Screens use these names, never raw hex values, so both modes stay in step.
 * Contrast: text on background and on cards passes WCAG AA in both modes.
 */
export interface Colors {
  background: string;
  card: string;
  /** Tinted card, e.g. an essential suggestion. */
  cardTint: string;
  text: string;
  muted: string;
  /** Thick outline around cards and buttons. */
  outline: string;
  /** Hard offset "sticker" shadow. */
  shadow: string;
  /** Actions: +, Mark paid, Add, the active tab (green in both modes, no yellow). */
  primary: string;
  onPrimary: string;
  /** The "Left in plan" card. */
  hero: string;
  onHero: string;
  heroOutline: string;
  heroTrack: string;
  heroFill: string;
  /** Home budget card (D-59): the ring's arc, and the darker track under it. */
  heroRing: string;
  heroTile: string;
  /** The ring and its label once spending passes the budget (D-98); ≥ 3.4:1 on the card. */
  heroOver: string;
  tabBar: string;
  tabActive: string;
  tabInactive: string;
  /** Warnings only; over pace is never red (rule 9). */
  warning: string;
  /** A card that warns before something can't be undone, e.g. erasing this phone (S13e). */
  warningCard: string;
  /** Amounts in Records (D-80): spending in red (with −), money in and refunds in green (with +). */
  expense: string;
  income: string;
  /** The button for an action that can't be undone: mustard, never the friendly green (S13e). */
  destructive: string;
  onDestructive: string;
  /**
   * Chart slices in fixed order, then "Everything else" (FR-INS-03). Checked with the dataviz
   * validator against each mode's card colour: lightness, chroma, colour-blind separation.
   */
  chart: readonly string[];
  chartOther: string;
  /** Meals is always red in charts (author's choice, D-48), whatever its size. */
  chartMeals: string;
}

export const lightColors: Colors = {
  background: "#EEF2E2",
  card: "#FAFBF4",
  cardTint: "#DCE6C4",
  text: "#1A1D17",
  muted: "#474F42",
  outline: "#1A1D17",
  shadow: "#1A1D17",
  primary: "#5E7330",
  onPrimary: "#FAFBF4",
  hero: "#5E7330",
  onHero: "#FAFBF4",
  heroOutline: "#1A1D17",
  heroTrack: "#3F4E1F",
  heroFill: "#FAFBF4",
  heroRing: "#DCEBBE",
  heroTile: "#4A5C26",
  heroOver: "#FFC2BA",
  tabBar: "#FAFBF4",
  tabActive: "#4E6127",
  tabInactive: "#5F665A",
  warning: "#8A5A00",
  warningCard: "#F6E9CF",
  expense: "#B3261E",
  income: "#4E6127",
  destructive: "#E8B64C",
  onDestructive: "#1A1D17",
  chart: ["#2a78d6", "#eda100", "#1baf7a", "#6250d6"],
  chartOther: "#898781",
  chartMeals: "#e34948",
};

export const darkColors: Colors = {
  background: "#141614",
  card: "#1E211E",
  cardTint: "#1D2A18",
  text: "#ECEEE8",
  muted: "#B4BAB1",
  outline: "#343A33",
  shadow: "#050605",
  primary: "#9DBF5E",
  onPrimary: "#141614",
  hero: "#4B5D24",
  onHero: "#F4F6EF",
  heroOutline: "#7E9450",
  heroTrack: "#2F3B15",
  heroFill: "#ECEEE8",
  heroRing: "#D3E6AE",
  heroTile: "#36451A",
  heroOver: "#FFC2BA",
  tabBar: "#1A1C1A",
  tabActive: "#9DBF5E",
  tabInactive: "#9AA196",
  warning: "#E0B460",
  warningCard: "#2E2716",
  expense: "#F28B82",
  income: "#9DBF5E",
  destructive: "#D9A441",
  onDestructive: "#141614",
  chart: ["#3987e5", "#c98500", "#199e70", "#9085e9"],
  chartOther: "#898781",
  chartMeals: "#e66767",
};

/** Bundled fonts (loaded in app/_layout.tsx): Lilita One for headings, Nunito for text. */
export const fonts = {
  heading: "LilitaOne_400Regular",
  body: "Nunito_500Medium",
  bold: "Nunito_700Bold",
  heavy: "Nunito_800ExtraBold",
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Every tappable thing is at least 48 dp high (NFR-07, D-24). */
export const MIN_TOUCH = 48;

export const radius = { card: 16, button: 12 } as const;

export const type = {
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34 },
  heading: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  strong: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  /** Amounts line up: tabular figures (RM 289.00 above RM 111.00). */
  amount: {
    fontFamily: fonts.heading,
    fontSize: 44,
    lineHeight: 48,
    fontVariant: ["tabular-nums"],
  },
} as const;
