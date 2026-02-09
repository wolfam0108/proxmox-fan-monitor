import React, { useMemo } from 'react';

interface SparklineProps {
    data: number[];
    color?: string; // e.g. "text-green-500" or hex if handled
    width?: number;
    height?: number;
    strokeWidth?: number;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    color = "currentColor",
    width = 100,
    height = 30,
    strokeWidth = 2
}) => {
    const path = useMemo(() => {
        if (!data || data.length < 2) return "";

        const max = Math.max(...data);
        const min = Math.min(...data);
        const range = max - min || 1;

        // Add logic to keep zero baseline if range is small or values are near zero?
        // For temp, we usually want to see variations.

        // Scale points
        const points = data.map((val, i) => {
            const x = (i / (data.length - 1)) * width;
            // Invert Y because SVG 0 is top
            // Add padding
            const padding = strokeWidth;
            const availableHeight = height - (padding * 2);

            const normalized = (val - min) / range;
            const y = height - padding - (normalized * availableHeight);

            return `${x},${y}`;
        });

        return `M ${points.join(" L ")}`;
    }, [data, width, height, strokeWidth]);

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};
