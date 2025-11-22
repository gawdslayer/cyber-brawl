import React, { useEffect, useRef, useState } from 'react';
import { GameState, GameWorld, PlayerEntity, Team, Projectile, Gem, Obstacle } from '../types';
import { CHARACTERS, FPS, GEM_SPAWN_RATE, MAX_AMMO, RELOAD_SPEED_BASE, RESPAWN_TIME, TILE_SIZE, WIN_GEM_COUNT, WORLD_HEIGHT, WORLD_WIDTH } from '../constants';
import { Joystick } from './Joystick';
import { Move, Crosshair, Diamond, Skull } from 'lucide-react';

interface GameCanvasProps {
  selectedCharacterId: string;
  onGameOver: (result: 'VICTORY' | 'DEFEAT') => void;
  onBack: () => void;
}

// Utility: Distance
const dist = (e1: { x: number, y: number }, e2: { x: number, y: number }) => Math.sqrt(Math.pow(e1.x - e2.x, 2) + Math.pow(e1.y - e2.y, 2));

// Utility: Collision Circle/Rect
const checkCircleRect = (circle: {x: number, y: number, r: number}, rect: {x: number, y: number, w: number, h: number}) => {
  const testX = circle.x < rect.x ? rect.x : circle.x > rect.x + rect.w ? rect.x + rect.w : circle.x;
  const testY = circle.y < rect.y ? rect.y : circle.y > rect.y + rect.h ? rect.y + rect.h : circle.y;
  const distX = circle.x - testX;
  const distY = circle.y - testY;
  return (distX * distX + distY * distY) <= (circle.r * circle.r);
};

export const GameCanvas: React.FC<GameCanvasProps> = ({ selectedCharacterId, onGameOver, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Inputs
  const movementInput = useRef({ x: 0, y: 0, active: false });
  const attackInput = useRef({ x: 0, y: 0, angle: 0, active: false, fired: false });

  // Game State Ref (Mutable for performance)
  const worldRef = useRef<GameWorld>({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    players: [],
    projectiles: [],
    gems: [],
    obstacles: [],
    gemSpawnerTimer: 0,
    scoreBlue: 0,
    scoreRed: 0,
    countDownTimer: null,
  });

  // React State for HUD (synced less frequently)
  const [hudState, setHudState] = useState({
    hp: 100, maxHp: 100, ammo: 3, gems: 0, blueScore: 0, redScore: 0, timer: null as number | null
  });

  // Initial Setup
  useEffect(() => {
    const w = worldRef.current;
    
    // Create Map Obstacles (Symmetric Arena)
    const walls: Obstacle[] = [];
    // Borders
    walls.push({ id: 'w_t', x: -50, y: -50, width: WORLD_WIDTH+100, height: 50, type: 'WALL', radius: 0 });
    walls.push({ id: 'w_b', x: -50, y: WORLD_HEIGHT, width: WORLD_WIDTH+100, height: 50, type: 'WALL', radius: 0 });
    walls.push({ id: 'w_l', x: -50, y: 0, width: 50, height: WORLD_HEIGHT, type: 'WALL', radius: 0 });
    walls.push({ id: 'w_r', x: WORLD_WIDTH, y: 0, width: 50, height: WORLD_HEIGHT, type: 'WALL', radius: 0 });
    
    // Center Box
    walls.push({ id: 'c_1', x: WORLD_WIDTH/2 - 150, y: WORLD_HEIGHT/2 - 150, width: 50, height: 100, type: 'WALL', radius: 0 });
    walls.push({ id: 'c_2', x: WORLD_WIDTH/2 + 100, y: WORLD_HEIGHT/2 + 50, width: 50, height: 100, type: 'WALL', radius: 0 });
    walls.push({ id: 'c_3', x: WORLD_WIDTH/2 - 150, y: WORLD_HEIGHT/2 + 50, width: 100, height: 50, type: 'WALL', radius: 0 });
    walls.push({ id: 'c_4', x: WORLD_WIDTH/2 + 50, y: WORLD_HEIGHT/2 - 100, width: 100, height: 50, type: 'WALL', radius: 0 });
    
    // Corner Cover
    walls.push({ id: 'co_1', x: 300, y: 300, width: 100, height: 100, type: 'WALL', radius: 0 });
    walls.push({ id: 'co_2', x: WORLD_WIDTH - 400, y: 300, width: 100, height: 100, type: 'WALL', radius: 0 });
    walls.push({ id: 'co_3', x: 300, y: WORLD_HEIGHT - 400, width: 100, height: 100, type: 'WALL', radius: 0 });
    walls.push({ id: 'co_4', x: WORLD_WIDTH - 400, y: WORLD_HEIGHT - 400, width: 100, height: 100, type: 'WALL', radius: 0 });

    w.obstacles = walls;

    // Spawn Player
    const pChar = CHARACTERS.find(c => c.id === selectedCharacterId) || CHARACTERS[0];
    w.players = [];
    
    const createPlayer = (id: string, charId: string, team: Team, isBot: boolean, x: number, y: number): PlayerEntity => {
      const stats = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
      return {
        id, characterId: charId, team, isBot, x, y, radius: 24,
        hp: stats.hp, maxHp: stats.hp, angle: 0, isMoving: false,
        ammo: MAX_AMMO, maxAmmo: MAX_AMMO, reloadTimer: 0, respawnTimer: 0,
        gemCount: 0, superCharge: 0, killCount: 0
      };
    };

    // Player (Blue)
    w.players.push(createPlayer('player', selectedCharacterId, Team.BLUE, false, 200, WORLD_HEIGHT / 2));
    
    // Bots (Blue)
    w.players.push(createPlayer('bot_ally_1', 'viper', Team.BLUE, true, 200, WORLD_HEIGHT / 2 - 200));
    w.players.push(createPlayer('bot_ally_2', 'tank-top', Team.BLUE, true, 200, WORLD_HEIGHT / 2 + 200));

    // Bots (Red)
    const enemyChars = ['neon-ninja', 'tank-top', 'glitch', 'viper'];
    w.players.push(createPlayer('bot_enemy_1', enemyChars[Math.floor(Math.random()*4)], Team.RED, true, WORLD_WIDTH - 200, WORLD_HEIGHT / 2));
    w.players.push(createPlayer('bot_enemy_2', enemyChars[Math.floor(Math.random()*4)], Team.RED, true, WORLD_WIDTH - 200, WORLD_HEIGHT / 2 - 200));
    w.players.push(createPlayer('bot_enemy_3', enemyChars[Math.floor(Math.random()*4)], Team.RED, true, WORLD_WIDTH - 200, WORLD_HEIGHT / 2 + 200));

    // Start Loop
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [selectedCharacterId]);

  // --- CORE GAME LOGIC ---
  const update = () => {
    const w = worldRef.current;
    
    // 1. Gem Spawning
    w.gemSpawnerTimer++;
    if (w.gemSpawnerTimer > GEM_SPAWN_RATE && w.gems.length < 10) {
      w.gemSpawnerTimer = 0;
      w.gems.push({
        id: `gem_${Date.now()}`,
        x: WORLD_WIDTH / 2 + (Math.random() * 40 - 20),
        y: WORLD_HEIGHT / 2 + (Math.random() * 40 - 20),
        radius: 12,
        spawnTimer: 0
      });
    }

    // 2. Players Logic
    w.players.forEach(p => {
      if (p.respawnTimer > 0) {
        p.respawnTimer--;
        if (p.respawnTimer === 0) {
            // Respawn logic
            p.hp = p.maxHp;
            p.ammo = p.maxAmmo;
            p.x = p.team === Team.BLUE ? 200 : WORLD_WIDTH - 200;
            p.y = p.team === Team.BLUE ? WORLD_HEIGHT / 2 + (Math.random() * 300 - 150) : WORLD_HEIGHT / 2 + (Math.random() * 300 - 150);
        }
        return; // Dead players don't move
      }

      const stats = CHARACTERS.find(c => c.id === p.characterId)!;

      // Reload
      if (p.ammo < p.maxAmmo) {
        p.reloadTimer++;
        if (p.reloadTimer >= stats.reloadTime) {
          p.ammo++;
          p.reloadTimer = 0;
        }
      }

      // Movement & Input Processing
      let dx = 0;
      let dy = 0;
      let firing = false;
      let fireAngle = p.angle;

      if (!p.isBot) {
        // Human Input
        if (movementInput.current.active) {
          dx = movementInput.current.x * stats.speed;
          dy = movementInput.current.y * stats.speed;
          p.angle = Math.atan2(movementInput.current.y, movementInput.current.x);
        }
        
        // Manual Shooting
        if (attackInput.current.active) {
             // If dragging, update aim angle
             p.angle = attackInput.current.angle;
        }
        // Shoot on release or if button pressed (simplified to auto-fire if dragging out of range for now, or release based on implementation)
        // Implementing "Drag to aim, Release to shoot" is tricky with just one frame check.
        // We'll use a "isShooting" flag from joystick? No, standard mobile shooter is drag aim, release fire.
        // For simplicity in this demo: If attack joystick is active (held), we aim. When it goes inactive (release), we fire.
        // But `attackInput.current.active` changes instantly. We need to track previous state or use a 'fired' trigger.
        
        // Let's implement auto-fire while holding for easier web controls, or use the `fired` flag I added to useRef
        if (attackInput.current.active) {
             // Just aiming
             fireAngle = attackInput.current.angle;
        } else if (attackInput.current.fired) {
             firing = true;
             fireAngle = attackInput.current.angle;
             attackInput.current.fired = false; // Reset
        }

      } else {
        // AI Logic
        // 1. Find Target
        let target: PlayerEntity | null = null;
        let minDist = 10000;
        w.players.forEach(other => {
          if (other.team !== p.team && other.respawnTimer === 0) {
            const d = dist(p, other);
            if (d < minDist) {
              minDist = d;
              target = other;
            }
          }
        });

        // 2. Move
        let targetX = p.team === Team.BLUE ? WORLD_WIDTH - 200 : 200; // Default: go to enemy base
        let targetY = WORLD_HEIGHT / 2;

        // If gems available and low gems, go to center
        const centerGem = w.gems[0];
        if (centerGem && p.gemCount < 3) {
            targetX = centerGem.x;
            targetY = centerGem.y;
        } else if (target) {
            // If healthy, chase. If hurt, retreat.
            if (p.hp > p.maxHp * 0.3) {
                targetX = target.x;
                targetY = target.y;
            } else {
                targetX = p.team === Team.BLUE ? 100 : WORLD_WIDTH - 100; // Retreat
            }
        }

        const angleToTarget = Math.atan2(targetY - p.y, targetX - p.x);
        
        // Simple obstacle avoidance could go here, but skipping for MVP
        dx = Math.cos(angleToTarget) * stats.speed;
        dy = Math.sin(angleToTarget) * stats.speed;
        p.angle = angleToTarget;

        // 3. Shoot
        if (target && minDist < stats.range && p.ammo > 0 && Math.random() < 0.05) { // Random fire rate
           firing = true;
           fireAngle = Math.atan2(target.y - p.y, target.x - p.x);
        }
      }

      // Apply Velocity with Wall Collision
      let nextX = p.x + dx;
      let nextY = p.y + dy;
      
      // Wall Checks
      let collidesX = false;
      let collidesY = false;
      
      w.obstacles.forEach(obs => {
        if (checkCircleRect({x: nextX, y: p.y, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesX = true;
        if (checkCircleRect({x: p.x, y: nextY, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesY = true;
      });

      if (!collidesX) p.x = nextX;
      if (!collidesY) p.y = nextY;

      // Clamp to world
      p.x = Math.max(0, Math.min(WORLD_WIDTH, p.x));
      p.y = Math.max(0, Math.min(WORLD_HEIGHT, p.y));

      // Shooting Execution
      if (firing && p.ammo > 0) {
        p.ammo--;
        p.reloadTimer = 0;
        
        // Create projectiles based on count (shotgun)
        for (let i = 0; i < stats.projectileCount; i++) {
            const spreadAngle = (Math.random() - 0.5) * stats.spread;
            const finalAngle = fireAngle + spreadAngle;
            w.projectiles.push({
                id: `proj_${p.id}_${Date.now()}_${i}`,
                ownerId: p.id,
                team: p.team,
                x: p.x + Math.cos(finalAngle) * 30,
                y: p.y + Math.sin(finalAngle) * 30,
                vx: Math.cos(finalAngle) * stats.projectileSpeed,
                vy: Math.sin(finalAngle) * stats.projectileSpeed,
                radius: stats.projectileSize / 2,
                damage: stats.damage,
                rangeRemaining: stats.range,
                color: stats.color
            });
        }
      }
      
      // Gem Collection
      for (let i = w.gems.length - 1; i >= 0; i--) {
          const g = w.gems[i];
          if (dist(p, g) < p.radius + g.radius) {
              p.gemCount++;
              w.gems.splice(i, 1);
          }
      }
    });

    // 3. Projectiles Logic
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const proj = w.projectiles[i];
      proj.x += proj.vx;
      proj.y += proj.vy;
      proj.rangeRemaining -= Math.sqrt(proj.vx*proj.vx + proj.vy*proj.vy);

      let hit = false;

      // Wall Hit
      for(const obs of w.obstacles) {
          if (checkCircleRect({x: proj.x, y: proj.y, r: proj.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) {
              hit = true;
              break;
          }
      }

      // Player Hit
      if (!hit) {
          for(const p of w.players) {
              if (p.team !== proj.team && p.respawnTimer === 0 && dist(p, proj) < p.radius + proj.radius) {
                  hit = true;
                  p.hp -= proj.damage;
                  if (p.hp <= 0) {
                      p.respawnTimer = RESPAWN_TIME;
                      const dropper = w.players.find(pl => pl.id === proj.ownerId);
                      if (dropper) dropper.killCount++;
                      
                      // Drop Gems
                      const gemsToDrop = Math.min(p.gemCount, 5); // Cap drops to avoid lag/mess
                      p.gemCount = 0;
                      for(let g=0; g<gemsToDrop; g++) {
                          w.gems.push({
                              id: `drop_${Date.now()}_${g}`,
                              x: p.x + (Math.random()*40 - 20),
                              y: p.y + (Math.random()*40 - 20),
                              radius: 12,
                              spawnTimer: 0
                          });
                      }
                  }
                  break;
              }
          }
      }

      if (hit || proj.rangeRemaining <= 0) {
        w.projectiles.splice(i, 1);
      }
    }

    // 4. Scoring & End Game
    let blueGems = 0;
    let redGems = 0;
    w.players.forEach(p => {
        if (p.team === Team.BLUE) blueGems += p.gemCount;
        else redGems += p.gemCount;
    });
    w.scoreBlue = blueGems;
    w.scoreRed = redGems;

    if (w.scoreBlue >= WIN_GEM_COUNT || w.scoreRed >= WIN_GEM_COUNT) {
        if (w.countDownTimer === null) w.countDownTimer = 15 * 60; // 15 seconds
        else {
            w.countDownTimer--;
            if (w.countDownTimer <= 0) {
                onGameOver(w.scoreBlue >= WIN_GEM_COUNT ? 'VICTORY' : 'DEFEAT');
                return;
            }
        }
    } else {
        w.countDownTimer = null;
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = worldRef.current;

    // Find Player for Camera
    const player = w.players.find(p => p.id === 'player');
    if (!player) return;

    // Camera Transform
    ctx.save();
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const camX = -player.x + canvas.width / 2;
    const camY = -player.y + canvas.height / 2;
    
    // Clamp Camera
    const clampedCamX = Math.min(0, Math.max(camX, canvas.width - WORLD_WIDTH));
    const clampedCamY = Math.min(0, Math.max(camY, canvas.height - WORLD_HEIGHT));

    ctx.translate(clampedCamX, clampedCamY);

    // Draw Grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    for(let x=0; x<=WORLD_WIDTH; x+=TILE_SIZE) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke();
    }
    for(let y=0; y<=WORLD_HEIGHT; y+=TILE_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y); ctx.stroke();
    }

    // Spawn Center
    ctx.fillStyle = 'rgba(0, 255, 153, 0.1)';
    ctx.beginPath(); ctx.arc(WORLD_WIDTH/2, WORLD_HEIGHT/2, 60, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#00ff99';
    ctx.stroke();

    // Draw Obstacles
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#222233';
    ctx.strokeStyle = '#4444cc';
    w.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
    });

    // Draw Gems
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 15;
    w.gems.forEach(gem => {
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.moveTo(gem.x, gem.y - 8);
        ctx.lineTo(gem.x + 8, gem.y);
        ctx.lineTo(gem.x, gem.y + 8);
        ctx.lineTo(gem.x - 8, gem.y);
        ctx.fill();
    });

    // Draw Projectiles
    w.projectiles.forEach(proj => {
        ctx.fillStyle = proj.color;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI*2);
        ctx.fill();
    });

    // Draw Players
    w.players.forEach(p => {
        if (p.respawnTimer > 0) return;

        ctx.save();
        ctx.translate(p.x, p.y);

        // Ring color based on team
        const teamColor = p.team === Team.BLUE ? '#00f3ff' : '#ff3333';
        
        // Body
        ctx.shadowBlur = 10;
        ctx.shadowColor = teamColor;
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = teamColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Direction Indicator (small triangle)
        ctx.rotate(p.angle);
        ctx.fillStyle = teamColor;
        ctx.beginPath();
        ctx.moveTo(p.radius + 5, 0);
        ctx.lineTo(p.radius - 5, 5);
        ctx.lineTo(p.radius - 5, -5);
        ctx.fill();

        ctx.restore();

        // Health Bar
        ctx.shadowBlur = 0;
        const hpPct = p.hp / p.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(p.x - 20, p.y - 40, 40, 6);
        ctx.fillStyle = hpPct > 0.5 ? '#00ff00' : '#ff0000';
        ctx.fillRect(p.x - 20, p.y - 40, 40 * hpPct, 6);

        // Name / Gems
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        if (p.gemCount > 0) {
            ctx.fillText(`💎 ${p.gemCount}`, p.x, p.y - 45);
        }
    });

    ctx.restore();

    // Sync HUD State
    if (player) {
        setHudState(prev => {
            // Only update if significant change to save re-renders? 
            // Actually React handles this well enough for simple HUDs if not every frame
            return {
                hp: player.hp,
                maxHp: player.maxHp,
                ammo: player.ammo,
                gems: w.scoreBlue,
                blueScore: w.scoreBlue,
                redScore: w.scoreRed,
                timer: w.countDownTimer
            };
        });
    }
  };

  const gameLoop = () => {
    update();
    draw();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  // Resize Handler
  useEffect(() => {
      const handleResize = () => {
          if (canvasRef.current) {
              canvasRef.current.width = window.innerWidth;
              canvasRef.current.height = window.innerHeight;
          }
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- CONTROLLERS ---
  const handleMoveJoy = (data: any) => {
      movementInput.current = data;
  };

  const handleAttackJoy = (data: any) => {
      const wasActive = attackInput.current.active;
      const isActive = data.active;
      
      // Detect release (Fire)
      if (wasActive && !isActive) {
          attackInput.current.fired = true;
      }
      
      attackInput.current.x = data.x;
      attackInput.current.y = data.y;
      attackInput.current.angle = data.angle;
      attackInput.current.active = isActive;
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <canvas ref={canvasRef} className="block" />
      
      {/* HUD - Top */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
          <div className="flex flex-col items-start">
              <div className="text-cyber-neonBlue font-bold text-xl bg-black/50 px-3 py-1 rounded border border-cyber-neonBlue">
                 BLUE: {hudState.blueScore}
              </div>
              <div className="h-2 w-32 bg-gray-800 mt-1 rounded overflow-hidden border border-white/20">
                   <div className="h-full bg-green-500" style={{ width: `${(hudState.hp / hudState.maxHp) * 100}%` }}></div>
              </div>
              <div className="text-xs text-white mt-1">{Math.ceil(hudState.hp)} / {hudState.maxHp}</div>
          </div>

          <div className="flex flex-col items-center">
               {hudState.timer && (
                   <div className="text-4xl font-black text-white animate-pulse drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
                       {Math.ceil(hudState.timer / 60)}
                   </div>
               )}
               <div className="text-cyber-neonPink mt-2 font-bold">
                    {hudState.blueScore >= WIN_GEM_COUNT ? "PROTECT THE GEMS!" : hudState.redScore >= WIN_GEM_COUNT ? "STOP THEM!" : "COLLECT GEMS"}
               </div>
          </div>

          <div className="flex flex-col items-end">
              <div className="text-red-500 font-bold text-xl bg-black/50 px-3 py-1 rounded border border-red-500">
                 RED: {hudState.redScore}
              </div>
          </div>
      </div>

      {/* HUD - Ammo */}
      <div className="absolute top-20 right-4 pointer-events-none flex flex-col gap-1">
          {[...Array(MAX_AMMO)].map((_, i) => (
              <div 
                key={i} 
                className={`w-8 h-2 border border-white ${i < hudState.ammo ? 'bg-orange-500 shadow-[0_0_5px_orange]' : 'bg-gray-800'}`}
              />
          ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-10 left-10 z-10">
        <Joystick identifier="move" onMove={handleMoveJoy} color="cyan" />
      </div>

      <div className="absolute bottom-10 right-10 z-10">
         <Joystick identifier="shoot" onMove={handleAttackJoy} color="red" />
      </div>
      
      {/* Quit Button */}
      <button 
        onClick={onBack}
        className="absolute top-4 right-1/2 translate-x-1/2 md:right-auto md:left-4 md:translate-x-0 mt-12 md:mt-0 bg-red-900/80 text-white text-xs px-2 py-1 rounded border border-red-500 hover:bg-red-700 z-20 pointer-events-auto"
      >
        EXIT
      </button>
    </div>
  );
};
