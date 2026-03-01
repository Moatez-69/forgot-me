// Forgot Me Design System — single source of truth for colors, spacing, typography

export const colors = {
  // Core palette
  primary: "#2f7dff",
  primaryMuted: "#2f7dff20",
  accent: "#13c0b4",
  accentMuted: "#13c0b420",
  background: "#070d1a",
  card: "#101a2e",
  cardElevated: "#17253e",
  border: "#223556",

  // Text
  textPrimary: "#edf2ff",
  textSecondary: "#aab7d3",
  textMuted: "#6a7f9f",
  textDark: "#536784",

  // Status
  success: "#00d68f",
  warning: "#ffaa2c",
  danger: "#ff4d6a",
  info: "#4a9eff",

  // Category badges
  categoryWork: "#4a9eff",
  categoryStudy: "#ff9f43",
  categoryPersonal: "#54a0ff",
  categoryMedical: "#ee5a24",
  categoryFinance: "#00d68f",
  categoryOther: "#8888a0",

  // Urgency
  urgencyToday: "#ff4d6a",
  urgencyTomorrow: "#ffaa2c",
  urgencyThisWeek: "#ffd32a",
  urgencyDefault: "#3a3a50",

  // Modality icon tints
  modalityPdf: "#ff4d6a",
  modalityImage: "#4a9eff",
  modalityAudio: "#4f8cff",
  modalityText: "#00d68f",
  modalityCalendar: "#ffaa2c",
  modalityEmail: "#00d4aa",

  // Gradient helpers
  gradientStart: "#1053d6",
  gradientEnd: "#13c0b4",
} as const;

export const CATEGORY_COLORS: Record<string, string> = {
  work: colors.categoryWork,
  study: colors.categoryStudy,
  personal: colors.categoryPersonal,
  medical: colors.categoryMedical,
  finance: colors.categoryFinance,
  other: colors.categoryOther,
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
}

export const CATEGORY_ICONS: Record<string, string> = {
  work: "briefcase",
  study: "school",
  personal: "person",
  medical: "medical",
  finance: "card",
  other: "ellipsis-horizontal",
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.other;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 24,
} as const;

export const typography = {
  hero: { fontSize: 34, fontWeight: "800" as const },
  title: { fontSize: 26, fontWeight: "800" as const },
  heading: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 15, lineHeight: 22 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11 },
  label: {
    fontSize: 13,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
  },
} as const;
