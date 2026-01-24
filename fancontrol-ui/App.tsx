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
import { StatCard } from './components/StatCard';
import { LogicCard } from './components/LogicCard';
import { FanList } from './components/FanList';
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

  useEffect(() => {
    if (activeTab === 'analytics') {
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
    if (activeTab !== 'analytics') return;

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
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                label="Температура CPU"
                value={data.temps.cpu.toFixed(1)}
                unit="°C"
                icon={Cpu}
                colorClass={getTempColor(data.temps.cpu, 62)}
              />
              <StatCard
                label="Температура GPU"
                value={data.temps.gpu}
                unit="°C"
                icon={Thermometer}
                colorClass={getTempColor(data.temps.gpu, 82)}
              />
              <StatCard
                label="Макс. HDD"
                value={data.temps.hddMax}
                unit="°C"
                icon={HardDrive}
                colorClass={getTempColor(data.temps.hddMax, 45)}
                subValue={`Горячий: ${data.temps.hddList.find(h => h.temp === data.temps.hddMax)?.device || 'N/A'}`}
              />
            </div>

            {/* Logic Controllers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <LogicCard
                title="Система"
                data={data.logic.system}
                type="SYS"
              />
              <LogicCard
                title="GPU"
                data={data.logic.gpu}
                type="GPU"
              />
            </div>

            {/* Fans */}
            <FanList fans={data.fans} />

            {/* HDD Grid */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4">
              <h3 className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2">
                <HardDrive size={14} /> Дисковый массив
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {data.temps.hddList.map((hdd) => (
                  <div key={hdd.device} className="bg-slate-800 rounded p-2 text-center border border-slate-700">
                    <div className="text-xs text-slate-500 mb-1">{hdd.device}</div>
                    <div className={`font-mono font-bold ${getTempColor(Number(hdd.temp), 45)}`}>
                      {hdd.temp}°C
                    </div>
                  </div>
                ))}
              </div>
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
    </div>
  );
}