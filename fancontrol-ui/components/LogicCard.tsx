import React, { useState, useEffect } from 'react';
import { LogicState, FanConfig, FanProfile } from '../types';
import { setOverride, fetchConfig } from '../services/apiService';

interface LogicCardProps {
  title: string;
  data: LogicState;
  type: 'SYS' | 'GPU';
}

const Spinner = () => (
  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
);

export const LogicCard: React.FC<LogicCardProps> = ({ title, data, type }) => {
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<FanProfile[]>([]);
  const [pendingAction, setPendingAction] = useState<{ type: 'toggle' | 'mode'; expectedManual?: boolean; expectedMode?: number } | null>(null);

  useEffect(() => {
    // Fetch config to get dynamic profiles
    fetchConfig().then(config => {
      if (type === 'SYS' && config?.system?.profiles) {
        setProfiles(config.system.profiles);
      } else if (type === 'GPU' && config?.gpu?.profiles) {
        setProfiles(config.gpu.profiles);
      }
    }).catch(() => {
      // Fallback to default modes if config fetch fails
      if (type === 'SYS') {
        setProfiles([
          { name: 'Тихий', target: 1200, thresholds: {} },
          { name: 'Стандарт', target: 1600, thresholds: {} },
          { name: 'Критический', target: 2000, thresholds: {} },
        ]);
      } else {
        setProfiles([
          { name: 'Авто', target: 0, thresholds: {} },
          { name: 'Режим 1', target: 45, thresholds: {} },
          { name: 'Режим 2', target: 50, thresholds: {} },
          { name: 'Режим 3', target: 60, thresholds: {} },
          { name: 'Максимум', target: 100, thresholds: {} },
        ]);
      }
    });
  }, [type]);

  // Watch for data changes to clear loading state
  useEffect(() => {
    if (pendingAction && loading) {
      const currentMode = parseInt(data.mode, 10) || 0;
      const isManual = data.isManual || false;

      let shouldClear = false;
      if (pendingAction.type === 'toggle' && isManual === pendingAction.expectedManual) {
        shouldClear = true;
      } else if (pendingAction.type === 'mode' && currentMode === pendingAction.expectedMode) {
        shouldClear = true;
      }

      if (shouldClear) {
        setLoading(false);
        setPendingAction(null);
      }
    }
  }, [data, pendingAction, loading]);

  // Timeout fallback to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => {
        setLoading(false);
        setPendingAction(null);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [loading]);

  const modes = (profiles || []).map((p, i) => ({ index: i, name: p.name }));
  const overrideType = type === 'SYS' ? 'system' : 'gpu';
  const isManual = data.isManual || false;

  // Get current mode index
  const currentModeIndex = parseInt(data.mode, 10) || 0;

  // Determine status color and label
  let statusColor = "text-green-400";
  let statusLabel = data.status;

  if (data.status === "Stable") statusLabel = "Стабильно";
  if (data.status === "Init") statusLabel = "Инициализация";
  if (data.status === "MANUAL") { statusLabel = "РУЧНОЙ"; statusColor = "text-purple-400"; }
  if (data.status.includes("Pending")) { statusLabel = data.status.replace("Pending", "Ожидание"); statusColor = "text-yellow-400"; }
  if (data.status.includes("Escalated")) { statusLabel = "Повышен"; statusColor = "text-orange-400"; }
  if (data.status.includes("Locked")) { statusLabel = data.status.replace("Locked", "Блокировка"); statusColor = "text-blue-400"; }

  const handleToggle = async () => {
    const expectedManual = !isManual;
    setLoading(true);
    setPendingAction({ type: 'toggle', expectedManual });
    await setOverride(overrideType, expectedManual, data.mode, true);
  };

  const handleModeChange = async (modeIndex: number) => {
    if (!isManual || loading) return;
    setLoading(true);
    setPendingAction({ type: 'mode', expectedMode: modeIndex });
    await setOverride(overrideType, true, String(modeIndex), true);
  };

  const titleRu = type === 'SYS' ? 'Система' : 'GPU';

  // Get current profile name
  const currentProfileName = profiles[currentModeIndex]?.name || `Режим ${currentModeIndex}`;

  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col justify-between relative overflow-hidden">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center" style={{ zIndex: 50 }}>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-cyan-400 text-sm">Применение...</span>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-400 font-semibold text-sm uppercase tracking-wider">{titleRu}</h3>

          {/* Auto/Manual Toggle */}
          <button
            onClick={handleToggle}
            disabled={loading}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex items-center gap-2 ${isManual
              ? 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-500/20'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              } ${loading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {loading ? <Spinner /> : null}
            {isManual ? 'РУЧНОЙ' : 'АВТО'}
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl font-bold text-white">{currentProfileName}</span>
          <span className="px-2 py-1 rounded text-xs font-mono bg-slate-700 text-slate-300 border border-slate-600">
            Цель: {data.target}
          </span>
        </div>

        {/* Mode Selection Buttons (visible when manual) */}
        {isManual && modes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {modes.map(mode => (
              <button
                key={mode.index}
                onClick={() => handleModeChange(mode.index)}
                disabled={loading}
                className={`px-3 py-2 rounded text-sm font-medium transition-all ${currentModeIndex === mode.index
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  } ${loading ? 'opacity-50 cursor-wait' : ''}`}
              >
                {mode.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor.replace('text', 'bg')} ${data.status === 'MANUAL' ? 'animate-pulse' : ''}`}></div>
          <span className={`font-mono text-sm ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
};