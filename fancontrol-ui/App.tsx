import React, { useState, useEffect } from 'react';
import { fetchSystemData, fetchHistory } from './services/apiService';
import { SystemData, ChartDataPoint, TimeRange } from './types';
import {
  Cpu,
  Thermometer,
  HardDrive,
  Server,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Settings
} from './components/Icons';
import { SensorCard } from './components/SensorCard';
import { FanGroupCard } from './components/FanGroupCard';
import { HistoryChart } from './components/HistoryChart';
import { SettingsPanel } from './components/SettingsPanel';

const MAX_HISTORY_POINTS = 10000;

export default function App() {
  const [data, setData] = useState<SystemData | null>(null);
  const [history, setHistory] = useState<ChartDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'settings'>('dashboard');
  const [selectedRange, setSelectedRange] = useState<TimeRange>('30m');
  const [historyLoading, setHistoryLoading] = useState(false);


  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await fetchSystemData();
        setData(result);
      } catch (e) {
        console.error('Failed to fetch status:', e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load configured drives on mount


  useEffect(() => {
    // Fetch history for both analytics (chart) and dashboard (sparklines)
    if (activeTab === 'analytics' || activeTab === 'dashboard') {
      setHistoryLoading(true);
      fetchHistory(selectedRange).then(data => {
        setHistory(data);
        setHistoryLoading(false);
      }).catch(() => {
        setHistoryLoading(false);
      });
    }
  }, [activeTab, selectedRange]);

  useEffect(() => {
    if (activeTab !== 'analytics' && activeTab !== 'dashboard') return;

    const interval = setInterval(() => {
      fetchHistory(selectedRange).then(data => {
        setHistory(data);
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [activeTab, selectedRange]);

  const handleRangeChange = (range: TimeRange) => {
    setSelectedRange(range);
  };

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p>Подключение к демону...</p>
        </div>
      </div>
    );
  }

  const getTempColor = (temp: number, threshold: number) => {
    return temp >= threshold ? 'text-red-400' : temp >= threshold - 10 ? 'text-yellow-400' : 'text-slate-100';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-3">
              <Server size={28} className="text-cyan-500" />
              УПРАВЛЕНИЕ ОХЛАЖДЕНИЕМ
            </h1>
            <p className="text-slate-500 text-sm mt-1">Демон подключён • Опрос каждую секунду</p>
          </div>

          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <LayoutDashboard size={16} />
              Панель
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <LineChartIcon size={16} />
              Графики
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-cyan-400 shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Settings size={16} />
              Настройки
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Top Stats Row - Smart Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.sensors && data.sensors.map((sensor) => {
                let Icon = Cpu;
                let threshold = 60;
                let colorClass = 'text-slate-500';

                // Determine styling and layout based on visual_preset
                let spanClass = "col-span-1";
                let internalGridCols = 1;

                switch (sensor.visual_preset) {
                  case 'accelerator':
                    Icon = Thermometer;
                    threshold = 82;
                    // GPU: Single column
                    spanClass = "col-span-1";
                    internalGridCols = 1;
                    break;
                  case 'storage':
                    Icon = HardDrive;
                    threshold = 45;
                    // Storage: Full width
                    spanClass = "col-span-1 md:col-span-3 lg:col-span-4";
                    // Internal: 3 columns for extended cards
                    internalGridCols = 3;
                    break;
                  case 'system':
                  default:
                    Icon = Cpu;
                    threshold = 62;
                    // CPU: 3 columns (3/4 width)
                    spanClass = "col-span-1 md:col-span-2 lg:col-span-3";
                    // Internal: 4 columns for compact sensors
                    internalGridCols = 4;
                    break;
                }

                if (sensor.value !== null) {
                  colorClass = getTempColor(sensor.value, threshold);
                }

                return (
                  <div key={sensor.id} className={spanClass}>
                    <SensorCard
                      id={sensor.id}
                      label={sensor.name}
                      value={sensor.value}
                      unit={sensor.value !== null ? '°C' : ''}
                      icon={Icon}
                      colorClass={colorClass}
                      variant={sensor.visual_preset as 'system' | 'accelerator' | 'storage'}
                      sources={sensor.sources || []}
                      gridCols={internalGridCols}
                      history={history}
                    />
                  </div>
                );
              })}

              {/* Fallback if no sensors configured (should not happen in prod ideally) */}
              {(!data.sensors || data.sensors.length === 0) && (
                <div className="col-span-3 text-center py-4 text-slate-500 bg-slate-900/50 rounded-lg">
                  <p>Датчики не настроены</p>
                </div>
              )}
            </div>

            {/* Fan Group Cards - Full width cards for each group */}
            <div className="space-y-4">
              {Object.entries(data.logic || {}).map(([groupId, groupData]) => {
                // Filter fans belonging to this group by groupId
                const groupFans = data.fans.filter(fan => {
                  if (groupId === 'gpu') return fan.type === 'GPU';
                  return (fan as any).groupId === groupId;
                });
                // Use groupName from API if available, fallback to formatted groupId
                const displayName = (groupData as any).groupName ||
                  (groupId === 'gpu' ? 'GPU' : groupId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
                return (
                  <FanGroupCard
                    key={groupId}
                    groupId={groupId}
                    groupName={displayName}
                    logic={groupData as any}
                    fans={groupFans}
                    type={groupId === 'gpu' ? 'nvidia' : 'system'}
                  />
                );
              })}
              {Object.keys(data.logic || {}).length === 0 && (
                <div className="text-center py-12 text-slate-500 bg-slate-900/50 rounded-xl border border-slate-800">
                  <p className="text-lg">Нет настроенных групп вентиляторов</p>
                  <p className="text-sm mt-2">Откройте Настройки → Настроить для создания группы</p>
                </div>
              )}
            </div>





          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
              <h3 className="text-lg font-medium text-slate-200 mb-4">История температур и режимов</h3>
              {historyLoading ? (
                <div className="h-[350px] flex items-center justify-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  Загрузка...
                </div>
              ) : (
                <HistoryChart
                  data={history}
                  selectedRange={selectedRange}
                  onRangeChange={handleRangeChange}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in duration-500">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-200">Настройки охлаждения</h2>
              <p className="text-slate-400 text-sm mt-1">Настройка целевых оборотов и температурных порогов</p>
            </div>
            <SettingsPanel />
          </div>
        )}

      </div>
    </div >
  );
}