// ═══════════════════════════════════════════
//  Pixel Perfect Camera — Design System
// ═══════════════════════════════════════════

export const COLORS = {
  bg: '#0a0e1a',
  bgCard: '#0d1526',
  bgSecondary: '#111a2e',
  border: '#1a2540',
  accent: '#00d4ff',
  green: '#00e676',
  red: '#ff3d71',
  orange: '#ffab00',
  yellow: '#f5e642',
  text: '#e8edf5',
  textSecondary: '#8899aa',
  textMuted: '#556677',
  white: '#ffffff',
  black: '#000000',
};

export const FONTS = {
  regular: 'System',
  mono: 'monospace',
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  glow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  }),
};
