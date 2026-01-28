import React, { useEffect, useState, useRef } from 'react';
import { fetchHistory } from '../services/apiService';
import { FanData } from '../types';

interface BackgroundChartProps {
    fans: FanData[];
    accentColor: string;
}

const colorPresets: Record<string, { r: number, g: number, b: number }> = {
    cyan: { r: 6, g: 182, b: 212 },
    green: { r: 34, g: 197, b: 94 },
    yellow: { r: 234, g: 179, b: 8 },
    red: { r: 239, g: 68, b: 68 },
    orange: { r: 249, g: 115, b: 22 },
    purple: { r: 168, g: 85, b: 247 }, // Purple
    blue: { r: 59, g: 130, b: 246 }    // Blue
};

export const BackgroundChart: React.FC<BackgroundChartProps> = ({ fans = [], accentColor }) => {
    // Map of fanId -> array of raw values
    const [rawData, setRawData] = useState<Record<string, number[]>>({});
    // Map of fanId -> array of normalized display values (0-1)
    const [displayData, setDisplayData] = useState<Record<string, number[]>>({});

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();
    const targetDataRef = useRef<Record<string, number[]>>({});

    // Stable key to prevent constant reloading on new array references
    const fansKey = (fans || []).map(f => f.id).sort().join(',');

    // Load data
    useEffect(() => {
        const loadData = async () => {
            try {
                const history = await fetchHistory('30m');
                // Downsample to avoid overloading browser
                const step = Math.max(1, Math.floor(history.length / 60));
                const sampled = history.filter((_, i) => i % step === 0).slice(-60);

                // Extract data for each fan
                const newRawData: Record<string, number[]> = {};

                // Initialize requested fans
                fans.forEach(f => newRawData[f.id] = []);

                sampled.forEach(h => {
                    const fansMap = h.fans || {};
                    // If specific fans requested, use them + check validity
                    // Otherwise try to plot keys (fallback)
                    const idsToPlot = fans.length > 0 ? fans.map(f => f.id) : Object.keys(fansMap);

                    idsToPlot.forEach(id => {
                        if (!newRawData[id]) newRawData[id] = [];
                        const val = fansMap[id] ?? 0;
                        newRawData[id].push(val);
                    });
                });

                setRawData(newRawData);
            } catch (e) {
                // Silent fail
            }
        };
        loadData();
        const interval = setInterval(loadData, 10000);
        return () => clearInterval(interval);
    }, [fansKey]); // Reload only if set of monitored fans changes

    // Normalize and prepare animation targets
    useEffect(() => {
        const newTargets: Record<string, number[]> = {};

        Object.entries(rawData).forEach(([id, values]: [string, number[]]) => {
            if (values.length < 2) return;

            // Determine max value based on fan type
            const fan = fans.find(f => f.id === id);
            // Default to 255 (Sys) if unknown, but check if type is explicitly GPU/nvidia
            const isGpu = fan?.type === 'GPU' || (fan as any)?.type === 'nvidia';
            const maxVal = isGpu ? 100 : 255;

            // Normalize to 0-1 range
            newTargets[id] = values.map(v => Math.min(1, Math.max(0, v / maxVal)));
        });

        targetDataRef.current = newTargets;

        // Initialize display if empty
        if (Object.keys(displayData).length === 0) {
            setDisplayData(newTargets);
        }
    }, [rawData, fansKey]);

    // Animate
    useEffect(() => {
        const animate = () => {
            setDisplayData(prev => {
                const targets = targetDataRef.current;
                const next: Record<string, number[]> = {};
                let hasChanges = false;
                let maxDiffTotal = 0;

                const allIds = new Set([...Object.keys(prev), ...Object.keys(targets)]);

                allIds.forEach(id => {
                    const prevVals = prev[id] || [];
                    const targetVals = targets[id] || [];

                    if (prevVals.length === 0) {
                        next[id] = targetVals;
                        hasChanges = true;
                        return;
                    }

                    if (targetVals.length === 0) {
                        next[id] = prevVals;
                        return;
                    }

                    // Interpolate
                    const nextVals = prevVals.map((val, i) => {
                        const t = targetVals[i] ?? val;
                        const diff = t - val;
                        return val + diff * 0.15; // Smooth factor
                    });

                    const maxDiff = Math.max(...nextVals.map((v, i) => Math.abs(v - (targetVals[i] ?? v))));
                    if (maxDiff > 0.001) {
                        hasChanges = true;
                        maxDiffTotal = Math.max(maxDiffTotal, maxDiff);
                    }

                    next[id] = nextVals;
                });

                if (!hasChanges) {
                    return targets;
                }

                animationRef.current = requestAnimationFrame(animate);
                return next;
            });
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [rawData]);

    // Draw
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        ctx.clearRect(0, 0, width, height);

        const c = colorPresets[accentColor] || colorPresets.cyan;
        // Gradient for fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`);
        gradient.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0.0)`);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        // Draw each line
        Object.values(displayData).forEach((series: number[], idx) => {
            if (series.length < 2) return;

            const stepX = width / (series.length - 1);

            // Build Path for Fill
            ctx.beginPath();

            for (let i = 0; i < series.length; i++) {
                const x = i * stepX;
                const val = series[i];
                // 15% padding bottom, 5% top
                const y = height - (val * height * 0.8) - (height * 0.05);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    const prevX = (i - 1) * stepX;
                    const prevVal = series[i - 1];
                    const prevY = height - (prevVal * height * 0.8) - (height * 0.05);
                    const cpX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);

                    if (i === series.length - 1) {
                        ctx.lineTo(x, y);
                    }
                }
            }

            // Draw Fill
            ctx.lineTo(width, height);
            ctx.lineTo(0, height);
            ctx.closePath();

            ctx.fillStyle = gradient;
            ctx.fill();

            // Stroke line again on top
            ctx.beginPath();
            for (let i = 0; i < series.length; i++) {
                const x = i * stepX;
                const val = series[i];
                const y = height - (val * height * 0.8) - (height * 0.05);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    const prevX = (i - 1) * stepX;
                    const prevVal = series[i - 1];
                    const prevY = height - (prevVal * height * 0.8) - (height * 0.05);
                    const cpX = (prevX + x) / 2;
                    ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + y) / 2);

                    if (i === series.length - 1) {
                        ctx.lineTo(x, y);
                    }
                }
            }

            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.5)`;
            ctx.stroke();
        });

    }, [displayData, accentColor]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
        />
    );
};
