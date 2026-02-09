export const THEME_COLORS = {
    system: 'blue',
    accelerator: 'green',
    storage: 'orange'
} as const;

export type ThemeVariant = keyof typeof THEME_COLORS;

// Visual Variants mapping to CSS classes and colors
export const COLOR_VARIANTS = {
    blue: {
        border: 'border-blue-600/50',
        bg: 'bg-blue-900/20', // Increased transparency for subtle look
        text: 'text-blue-400',
        btn: 'bg-blue-600',
        btnHover: 'hover:bg-blue-500',
        iconBg: 'bg-blue-500/20',
        hex: '#60a5fa' // blue-400 for charts
    },
    green: {
        border: 'border-green-600/50',
        bg: 'bg-green-900/20',
        text: 'text-green-400',
        btn: 'bg-green-600',
        btnHover: 'hover:bg-green-500',
        iconBg: 'bg-green-500/20',
        hex: '#34d399' // emerald-400
    },
    orange: {
        border: 'border-orange-600/50',
        bg: 'bg-orange-900/20',
        text: 'text-orange-400',
        btn: 'bg-amber-600', // Amber usually looks better for 'orange' UI elements than stark orange
        btnHover: 'hover:bg-amber-500',
        iconBg: 'bg-orange-500/20',
        hex: '#fbbf24' // amber-400
    }
};

// Application-wide Chart Palette
export const CHART_COLORS = [
    '#60a5fa', // blue-400
    '#34d399', // emerald-400
    '#fbbf24', // amber-400
    '#f87171', // red-400
    '#a78bfa', // violet-400
    '#22d3ee', // cyan-400
    '#f472b6', // pink-400
    '#94a3b8', // slate-400
];

/**
 * Maps any legacy or unknown color string to one of the strict theme colors.
 * @param variant - The input color string (potentially legacy 'purple', 'cyan', etc.)
 * @returns 'blue' | 'green' | 'orange'
 */
export const mapToThemeColor = (variant?: string): 'blue' | 'green' | 'orange' => {
    if (!variant) return 'blue';

    const v = variant.toLowerCase();

    // Direct matches
    if (v === 'blue' || v === 'system' || v === 'cyan') return 'blue';
    if (v === 'green' || v === 'accelerator' || v === 'nvidia') return 'green';
    if (v === 'orange' || v === 'storage' || v === 'yellow') return 'orange';

    // Legacy mappings
    if (v === 'purple' || v === 'violet') return 'green'; // User request: remove purple, map to unified. Green fits 'accelerator' typically, or Blue for system? 
    // Let's map Purple to Green if it was typically used for unique groups, or maybe standard System Blue.
    // Given usage in GPU often (neon), Green is safer. But if it was custom system group...
    // Let's stick with:
    // Purple -> Green (often alternative high perf color)

    return 'blue'; // Default fallback
};

export const getThemeStyles = (inputVariant?: string) => {
    const themeColor = mapToThemeColor(inputVariant);
    return COLOR_VARIANTS[themeColor];
};
