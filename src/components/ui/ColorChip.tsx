import React from 'react';

import { cn } from '@/lib/utils';

interface ColorChipProps {
  color: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const ColorChip: React.FC<ColorChipProps> = ({ color, size = 'medium', className = '' }) => {
  const lowerCaseColor = color?.toLowerCase() || 'default';
  const isWhite = lowerCaseColor === 'white' || lowerCaseColor === 'cold white';

  // Expanded color mapping using common web colors and approximations
  const colorStyles: { [key: string]: { bg: string; border?: string } } = {
    // Basic
    black: { bg: '#000000' },
    grey: { bg: '#808080' },
    white: { bg: '#FFFFFF', border: '#cccccc' },
    'cold white': { bg: '#F5F5F5', border: '#cccccc' }, // Slightly off-white

    // Blues
    'light blue': { bg: '#ADD8E6' },
    blue: { bg: '#0000FF' },
    'dark blue': { bg: '#00008B' },
    turquoise: { bg: '#40E0D0' },

    // Greens
    green: { bg: '#00FF00' }, // Bright green
    'peak green': { bg: '#008F39' }, // Darker, forest-like green
    'olive green': { bg: '#808000' },
    'pine green': { bg: '#01796F' },
    'glow in the dark': { bg: '#ADFF2F', border: '#cccccc' }, // Green-Yellow glow

    // Reds/Pinks/Purples
    red: { bg: '#FF0000' },
    'fire engine red': { bg: '#CE2029' },
    pink: { bg: '#FFC0CB' },
    'matt pink': { bg: '#FFB6C1' }, // Slightly less saturated pink
    'silk pink': { bg: '#FFD1DC' }, // Paler, possibly shinier pink - represented as light pink
    magenta: { bg: '#FF00FF' },
    purple: { bg: '#800080' },

    // Yellows/Oranges/Browns
    yellow: { bg: '#FFFF00' },
    orange: { bg: '#FFA500' },
    'matt orange': { bg: '#FF8C00' }, // Darker orange
    'silk orange': { bg: '#FFB347' }, // Lighter, possibly shinier orange
    brown: { bg: '#A52A2A' },
    beige: { bg: '#F5F5DC', border: '#cccccc' },
    skin: { bg: '#FFDAB9' }, // Peach skin tone

    // Metallics / Other
    gold: { bg: '#FFD700' },
    'rose gold': { bg: '#B76E79' }, // Mix of pink and gold
    silver: { bg: '#C0C0C0' },
    'silk silver': { bg: '#D3D3D3' }, // Lighter silver
    bronze: { bg: '#CD7F32' },

    // Default fallback
    default: { bg: '#9ca3af' },
  };

  // Prioritize exact match, then lowercase match
  const styleInfo = colorStyles[color] || colorStyles[lowerCaseColor] || colorStyles.default;

  const chipStyle: React.CSSProperties = {
    backgroundColor: styleInfo.bg,
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '9999px', // Fully rounded
    fontWeight: 500,
    lineHeight: '1',
    border: `1px solid ${styleInfo.border || 'transparent'}`,
  };

  // Size-specific styles
  if (size === 'small') {
    chipStyle.width = '14px'; // Slightly larger for better visibility
    chipStyle.height = '14px';
  } else {
    // medium or large (handle large if needed)
    chipStyle.padding = '2px 8px';
    chipStyle.fontSize = '12px';
    chipStyle.borderRadius = '12px'; // Less rounded for text
    chipStyle.whiteSpace = 'nowrap'; // Prevent wrapping
    // Simple contrast check
    chipStyle.color = [
      'white',
      'yellow',
      'light blue',
      'cold white',
      'lime',
      'pink',
      'beige',
    ].includes(lowerCaseColor)
      ? '#000000' // Black text on light background
      : '#ffffff'; // White text on dark background
  }

  if (isWhite && size === 'small') {
    // Override border for small white chips to make them visible
    chipStyle.border = `1px solid #cccccc`;
  }

  return (
    <span
      style={chipStyle}
      title={color} // Add title for hover tooltip
      className={cn(className)} // Apply external classes
    >
      {size !== 'small' ? color : ''} {/* Show text only for medium/large */}
    </span>
  );
};
