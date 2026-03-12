import React from 'react';
import { useAppContext } from '../context/AppContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Clock, Target, Zap, TrendingUp } from 'lucide-react';

export function Dashboard() {
  const { state } = useAppContext();

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const totalModulesProgress = state.modules.reduce((acc, m) => acc + m.progress, 0) / state.modules.length;
  const lastScore = state.simulatorScores.length > 0 ? state.simulatorScores[state.simulatorScores.length - 1] : 0;
  const isEligible = lastScore >= 70;

  const productivityData = state.productivityData.map(d => 
    d.day === 'Dom' ? { ...d, focus: Math.floor(state.focusTime / 60) } : d
  );

  const moduleData = state.modules.map(m => ({
    name: m.id.toUpperCase(),
    progreso: m.progress,
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-100">Tablero de Salud</h2>
        <p className="text-zinc-400 mt-1">Métricas de Tiempo en Foco y ROI de Productividad</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-400">Tiempo en Foco</h3>
            <Clock className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{formatTime(state.focusTime)}</p>
          <p className="text-xs text-zinc-500 mt-2">Pomodoros: {state.pomodorosCompleted} | Flow: {state.flowtimeSessions}</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-400">Progreso Global</h3>
            <Target className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{totalModulesProgress.toFixed(0)}%</p>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${totalModulesProgress}%` }}></div>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-400">Último Simulador</h3>
            <Zap className={`w-5 h-5 ${isEligible ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <p className="text-3xl font-bold text-zinc-100">{lastScore}/100</p>
          <p className={`text-xs mt-2 font-medium ${isEligible ? 'text-emerald-500' : 'text-amber-500'}`}>
            {state.simulatorScores.length === 0 ? 'Sin intentos' : isEligible ? 'Elegible (Aprobado)' : 'Requiere Refuerzo (<70)'}
          </p>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-zinc-400">ROI Productividad</h3>
            <TrendingUp className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-zinc-100">
            {state.focusTime > 0 ? ((totalModulesProgress / (state.focusTime / 3600)) || 0).toFixed(1) : '0'}
          </p>
          <p className="text-xs text-zinc-500 mt-2">% avance por hora de estudio</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-semibold mb-6">Tiempo en Foco (Minutos)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={productivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="day" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.8)', backdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Line type="monotone" dataKey="focus" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl">
          <h3 className="text-lg font-semibold mb-6">Avance por Módulo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={moduleData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={12} tickLine={false} axisLine={false} width={40} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.8)', backdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                />
                <Bar dataKey="progreso" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
