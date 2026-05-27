import { Platform } from 'react-native';

// Warm, kitchen-inspired palette
const palette = {
  // Primary — warm green (herb/fresh produce feel)
  green50: '#F0F7F0',
  green100: '#D4ECDB',
  green200: '#A8D5B8',
  green500: '#3A8F5C',
  green600: '#2D7A4A',
  green700: '#1F6438',

  // Accent — warm amber/terracotta
  amber50: '#FFF8F0',
  amber100: '#FFECD4',
  amber500: '#D4851F',
  amber600: '#B8711A',

  // Neutrals — warmer grays
  cream: '#FDF6EC',
  warmWhite: '#FAFAF8',
  warmGray50: '#F5F0E8',
  warmGray100: '#ECEAE6',
  warmGray200: '#D8D5CF',
  warmGray400: '#A8A29E',
  warmGray500: '#78716C',
  warmGray600: '#57534E',
  warmGray800: '#292524',
  warmGray900: '#1C1917',
  warmBlack: '#0F0E0D',

  // Status
  red500: '#DC2626',
  red600: '#B91C1C',
  orange500: '#D97706',
  emerald500: '#16A34A',
};

export const Colors = {
  light: {
    text: palette.warmGray800,
    background: palette.cream,
    tint: palette.green600,
    icon: palette.warmGray500,
    tabIconDefault: palette.warmGray400,
    tabIconSelected: palette.green600,
    // Extended palette
    card: '#FFFFFF',
    cardBorder: palette.warmGray100,
    subtleBackground: palette.warmGray50,
    tabBarBackground: palette.cream,
    tabBarBorder: palette.warmGray100,
    accent: palette.amber500,
  },
  dark: {
    text: '#ECEDEE',
    background: palette.warmGray900,
    tint: palette.green200,
    icon: palette.warmGray400,
    tabIconDefault: palette.warmGray500,
    tabIconSelected: palette.green200,
    // Extended palette
    card: palette.warmGray800,
    cardBorder: '#352F2B',
    subtleBackground: '#231F1C',
    tabBarBackground: '#1C1917',
    tabBarBorder: '#352F2B',
    accent: palette.amber500,
  },
};

export const Palette = palette;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
