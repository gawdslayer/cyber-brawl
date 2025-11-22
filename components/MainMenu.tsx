import React, { useState } from 'react';
import { CHARACTERS } from '../constants';
import { CharacterStats } from '../types';
import { Users, Info, Zap, Shield, Crosshair } from 'lucide-react';

interface MainMenuProps {
  onStart: (characterId: string) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart }) => {
  const [selectedId, setSelectedId] = useState<string>(CHARACTERS[0].id);
  
  const selectedChar = CHARACTERS.find(c => c.id === selectedId)!;

  const getRoleIcon = (role: string) => {
      switch(role) {
          case 'Tank': return <Shield className="w-4 h-4" />;
          case 'Sniper': return <Crosshair className="w-4 h-4" />;
          case 'Skirmisher': return <Zap className="w-4 h-4" />;
          default: return <Users className="w-4 h-4" />;
      }
  };

  return (
    <div className="w-full h-full flex flex-col bg-cyber-black text-white relative overflow-y-auto md:overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-cyber-grid flex justify-between items-center bg-cyber-dark/90 z-10 sticky top-0">
        <div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-cyber-neonBlue to-cyber-neonPink drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]">
            CYBER BRAWL
            </h1>
            <p className="text-cyber-neonBlue text-xs tracking-widest uppercase opacity-80">Neon Arena Protocol // v1.0</p>
        </div>
        <div className="hidden md:block text-right">
            <div className="text-sm text-gray-400">User ID: GUEST_90210</div>
            <div className="text-xs text-green-500">ONLINE</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Character List */}
        <div className="w-full md:w-1/3 lg:w-1/4 border-r border-cyber-grid bg-cyber-dark/50 overflow-y-auto p-4 space-y-3">
            <h2 className="text-gray-400 uppercase text-xs font-bold mb-2">Select Fighter</h2>
            {CHARACTERS.map(char => (
                <button
                    key={char.id}
                    onClick={() => setSelectedId(char.id)}
                    className={`w-full p-3 flex items-center gap-3 rounded-lg border transition-all duration-200 group relative overflow-hidden
                    ${selectedId === char.id 
                        ? 'bg-cyber-neonBlue/10 border-cyber-neonBlue shadow-[0_0_15px_rgba(0,243,255,0.2)]' 
                        : 'bg-gray-900/50 border-gray-700 hover:border-gray-500 hover:bg-gray-800'}`}
                >
                    <div 
                        className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center text-2xl border border-white/10 relative z-10"
                        style={{ backgroundColor: selectedId === char.id ? char.color : undefined, color: selectedId === char.id ? 'black' : 'white' }}
                    >
                        {char.name.charAt(0)}
                    </div>
                    <div className="text-left flex-1 relative z-10">
                        <div className={`font-bold uppercase text-sm ${selectedId === char.id ? 'text-white' : 'text-gray-300'}`}>{char.name}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                           {getRoleIcon(char.role)} {char.role}
                        </div>
                    </div>
                    {/* Hover glint */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-in-out pointer-events-none" />
                </button>
            ))}
        </div>

        {/* Character Preview */}
        <div className="flex-1 relative flex flex-col bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 to-black">
            {/* Background Grid */}
            <div className="absolute inset-0 opacity-20" style={{ 
                backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
                backgroundSize: '40px 40px' 
            }}></div>

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
                {/* 3D Model Placeholder */}
                <div className="w-64 h-64 md:w-96 md:h-96 relative mb-8 group">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-t from-cyber-neonBlue/20 to-transparent blur-2xl animate-pulse" />
                    <div className="w-full h-full rounded-full border-4 border-dashed border-white/20 animate-[spin_10s_linear_infinite] flex items-center justify-center relative">
                        <div 
                            className="w-48 h-48 md:w-64 md:h-64 rounded-full shadow-2xl flex items-center justify-center text-6xl md:text-8xl font-black transform transition-transform duration-300 group-hover:scale-110"
                            style={{ backgroundColor: selectedChar.color, color: '#000' }}
                        >
                            {selectedChar.name.substring(0, 2)}
                        </div>
                    </div>
                </div>

                {/* Stats Panel */}
                <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-1">{selectedChar.name}</h3>
                        <p className="text-cyber-neonBlue text-sm mb-4">{selectedChar.description}</p>
                        <div className="space-y-2">
                            <StatBar label="Health" value={selectedChar.hp} max={6000} color="bg-green-500" />
                            <StatBar label="Damage" value={selectedChar.damage} max={2000} color="bg-red-500" />
                            <StatBar label="Range" value={selectedChar.range} max={1000} color="bg-yellow-500" />
                            <StatBar label="Speed" value={selectedChar.speed} max={8} color="bg-blue-500" />
                        </div>
                    </div>

                    <div className="flex flex-col justify-end gap-4">
                         <div className="bg-cyber-dark/80 p-4 rounded-xl border border-cyber-neonPink/30">
                             <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Special Ability</div>
                             <div className="text-cyber-neonPink font-bold">MEGA CHARGE</div>
                             <p className="text-xs text-gray-300 mt-1">Deals splash damage upon impact. (Auto-charge on hit)</p>
                         </div>
                         
                         <button 
                            onClick={() => onStart(selectedId)}
                            className="w-full py-4 bg-gradient-to-r from-cyber-neonBlue to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black font-black text-xl uppercase tracking-widest rounded shadow-[0_0_20px_rgba(0,243,255,0.4)] transition-all active:scale-95"
                        >
                            BRAWL!
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const StatBar = ({ label, value, max, color }: { label: string, value: number, max: number, color: string }) => (
    <div className="flex items-center gap-3 text-xs">
        <span className="w-12 text-gray-400 font-mono uppercase">{label}</span>
        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        </div>
        <span className="w-8 text-right text-white">{value}</span>
    </div>
);