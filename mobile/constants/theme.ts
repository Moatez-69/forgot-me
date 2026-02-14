// MindVault Design System — single source of truth for colors, spacing, typography

export const colors = {
  // Core palette
  primary: '#6c63ff',
  primaryMuted: '#6c63ff33',
  background: '#0f0f1a',
  card: '#1a1a2e',
  border: '#2d2d44',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#a0a0b0',
  textMuted: '#666',
  textDark: '#555',

  // Status
  success: '#2ecc71',
  warning: '#f39c12',
  danger: '#e74c3c',
  info: '#4a9eff',

  // Category badges
  categoryWork: '#4a9eff',
  categoryStudy: '#ff9f43',
  categoryPersonal: '#54a0ff',
  categoryMedical: '#ee5a24',
  categoryFinance: '#2ecc71',
  categoryOther: '#a0a0a0',

  // Urgency
  urgencyToday: '#e74c3c',
  urgencyTomorrow: '#f39c12',
  urgencyThisWeek: '#f1c40f',
  urgencyDefault: '#444',

  // Modality icon tints
  modalityPdf: '#e74c3c',
  modalityImage: '#3498db',
  modalityAudio: '#9b59b6',
  modalityText: '#2ecc71',
  modalityCalendar: '#f39c12',
  modalityEmail: '#1abc9c',
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
  xl: 14,
  pill: 20,
} as const;

export const typography = {
  hero: { fontSize: 36, fontWeight: '800' as const },
  title: { fontSize: 28, fontWeight: '800' as const },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 22 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 11 },
  label: {
    fontSize: 14,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
} as const;
