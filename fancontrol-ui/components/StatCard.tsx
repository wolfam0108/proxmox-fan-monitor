import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  colorClass?: string;
  subValue?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  unit, 
  icon: Icon, 
  colorClass = "text-slate-200",
  subValue 
}) => {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">{label}</p>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold font-mono ${colorClass}`}>
            {value}
          </span>
          {unit && <span className="text-slate-500 text-sm">{unit}</span>}
        </div>
        {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
      </div>
      <div className={`p-3 rounded-lg bg-slate-700/50 ${colorClass}`}>
        <Icon size={24} className="opacity-80" />
      </div>
    </div>
  );
};