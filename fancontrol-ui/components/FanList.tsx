import React from 'react';
import { Wind } from './Icons';
import { Fan } from '../types';

interface FanListProps {
  fans: Fan[];
}

export const FanList: React.FC<FanListProps> = ({ fans }) => {
  const getStatusLabel = (status: string) => {
    if (status === 'OK') return 'ОК';
    if (status === 'ADJ') return 'ПОДСТРОЙКА';
    return status;
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50 flex items-center gap-2">
        <Wind className="text-slate-400" size={18} />
        <h3 className="font-semibold text-slate-200">Вентиляторы</h3>
      </div>
      <div className="divide-y divide-slate-700">
        {fans.map((fan) => (
          <div key={fan.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-700/30 transition-colors">

            <div className="flex items-center gap-3 min-w-[150px]">
              <div className={`p-2 rounded-full ${fan.rpm > 0 ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700 text-slate-500'}`}>
                <Wind size={20} className={fan.rpm > 0 ? 'animate-spin-slow' : ''} style={{ animationDuration: fan.rpm > 0 ? `${60000 / fan.rpm}s` : '0s' }} />
              </div>
              <div>
                <p className="font-medium text-slate-200">{fan.name}</p>
                <p className="text-xs text-slate-500">{fan.type === 'SYS' ? 'Системный' : 'Видеокарта'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">Обороты</span>
                <span className="font-mono text-slate-200">{fan.rpm}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">Цель</span>
                <span className="font-mono text-slate-400">{fan.target}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">{fan.type === 'SYS' ? 'PWM' : '%'}</span>
                <span className="font-mono text-cyan-300">{fan.pwmOrPct}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 uppercase">Статус</span>
                <span className={`font-mono text-xs font-bold ${fan.status === 'OK' ? 'text-green-400' : 'text-yellow-400'}`}>
                  {getStatusLabel(fan.status)}
                </span>
              </div>
            </div>

            {/* Visual Gauge Background */}
            <div className="hidden sm:block w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${fan.type === 'SYS' ? (fan.pwmOrPct / 255) * 100 : fan.pwmOrPct}%` }}
              />
            </div>

          </div>
        ))}
      </div>
    </div>
  );
};