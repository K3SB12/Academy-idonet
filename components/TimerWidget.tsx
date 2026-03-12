import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Play, Pause, RotateCcw, Clock, BrainCircuit } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type TimerMode = 'pomodoro' | 'flowtime';

export function TimerWidget() {
  const { addFocusTime } = useAppContext();
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes
  const [isActive, setIsActive] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [flowtimeElapsed, setFlowtimeElapsed] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        if (mode === 'pomodoro') {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              handleComplete();
              return 0;
            }
            return prev - 1;
          });
        } else {
          setFlowtimeElapsed((prev) => prev + 1);
        }
      }, 1000);
    } else if (!isActive && intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, mode]);

  const handleComplete = () => {
    setIsActive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    if (mode === 'pomodoro') {
      addFocusTime(25 * 60, 'pomodoro');
      setTimeLeft(25 * 60);
      // Play sound or notification here
    }
  };

  const toggleTimer = () => {
    if (isActive && mode === 'flowtime') {
      // Stop flowtime and record
      addFocusTime(flowtimeElapsed, 'flowtime');
      setFlowtimeElapsed(0);
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    if (mode === 'pomodoro') {
      setTimeLeft(25 * 60);
    } else {
      if (flowtimeElapsed > 60) {
        addFocusTime(flowtimeElapsed, 'flowtime');
      }
      setFlowtimeElapsed(0);
    }
  };

  const switchMode = (newMode: TimerMode) => {
    if (isActive) resetTimer();
    setMode(newMode);
    if (newMode === 'pomodoro') {
      setTimeLeft(25 * 60);
    } else {
      setFlowtimeElapsed(0);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={twMerge(
      "fixed bottom-6 right-6 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden z-50",
      isExpanded ? "w-80" : "w-16 h-16 rounded-full cursor-pointer hover:scale-105"
    )}>
      {!isExpanded ? (
        <div 
          className="w-full h-full flex items-center justify-center text-emerald-500"
          onClick={() => setIsExpanded(true)}
        >
          {isActive ? <Clock className="w-6 h-6 animate-pulse" /> : <BrainCircuit className="w-6 h-6" />}
        </div>
      ) : (
        <div className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              {mode === 'pomodoro' ? 'Pomodoro (Admin)' : 'Flowtime (Casos)'}
            </h3>
            <button 
              onClick={() => setIsExpanded(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs font-medium"
            >
              Minimizar
            </button>
          </div>

          <div className="text-center mb-6">
            <div className="text-5xl font-black tracking-tighter text-emerald-500 font-mono">
              {mode === 'pomodoro' ? formatTime(timeLeft) : formatTime(flowtimeElapsed)}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button 
              onClick={toggleTimer}
              className={twMerge(
                "w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95",
                isActive ? "bg-amber-500/20 text-amber-500 border border-amber-500/50" : "bg-emerald-500 text-zinc-950"
              )}
            >
              {isActive ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
            </button>
            <button 
              onClick={resetTimer}
              className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex bg-zinc-950 rounded-lg p-1">
            <button
              onClick={() => switchMode('pomodoro')}
              className={twMerge(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === 'pomodoro' ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Pomodoro
            </button>
            <button
              onClick={() => switchMode('flowtime')}
              className={twMerge(
                "flex-1 py-1.5 text-xs font-medium rounded-md transition-colors",
                mode === 'flowtime' ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Flowtime
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
