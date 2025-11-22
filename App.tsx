import React, { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { MainMenu } from './components/MainMenu';

enum AppState {
  MENU = 'MENU',
  GAME = 'GAME',
  RESULT = 'RESULT'
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.MENU);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('neon-ninja');
  const [gameResult, setGameResult] = useState<'VICTORY' | 'DEFEAT'>('VICTORY');

  const handleStartGame = (charId: string) => {
    setSelectedCharacter(charId);
    setAppState(AppState.GAME);
  };

  const handleGameOver = (result: 'VICTORY' | 'DEFEAT') => {
    setGameResult(result);
    setAppState(AppState.RESULT);
  };

  const handleBackToMenu = () => {
      setAppState(AppState.MENU);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-cyber-black font-sans select-none">
      {appState === AppState.MENU && (
        <MainMenu onStart={handleStartGame} />
      )}

      {appState === AppState.GAME && (
        <GameCanvas 
            selectedCharacterId={selectedCharacter} 
            onGameOver={handleGameOver} 
            onBack={handleBackToMenu}
        />
      )}

      {appState === AppState.RESULT && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-lg">
           <h1 className={`text-6xl md:text-9xl font-black italic tracking-tighter mb-8 ${gameResult === 'VICTORY' ? 'text-cyber-neonYellow drop-shadow-[0_0_30px_rgba(252,238,10,0.6)]' : 'text-red-600 drop-shadow-[0_0_30px_rgba(220,20,60,0.6)]'}`}>
               {gameResult}
           </h1>
           
           <div className="flex gap-4">
               <button 
                 onClick={handleBackToMenu}
                 className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded border border-white/20 uppercase tracking-widest"
               >
                 Main Menu
               </button>
               <button 
                 onClick={() => setAppState(AppState.GAME)}
                 className="px-8 py-3 bg-cyber-neonBlue hover:bg-cyan-300 text-black font-bold rounded shadow-[0_0_20px_rgba(0,243,255,0.4)] uppercase tracking-widest"
               >
                 Play Again
               </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;