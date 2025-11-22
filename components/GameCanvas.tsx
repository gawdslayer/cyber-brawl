
import React, { useEffect, useRef, useState } from 'react';
import { GameMode, GameWorld, PlayerEntity, Team, Projectile, Obstacle, VisualEffect } from '../types';
import { CHARACTERS, GEM_SPAWN_RATE, MAX_AMMO, RESPAWN_TIME, TILE_SIZE, WIN_GEM_COUNT, WIN_GOAL_COUNT, WORLD_HEIGHT, WORLD_WIDTH, BALL_FRICTION, BALL_THROW_SPEED, BALL_PICKUP_COOLDOWN, SUPER_CHARGE_MAX } from '../constants';
import { Joystick } from './Joystick';

interface GameCanvasProps {
  selectedCharacterId: string;
  gameMode: GameMode;
  onGameOver: (result: 'VICTORY' | 'DEFEAT' | 'DRAW') => void;
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

export const GameCanvas: React.FC<GameCanvasProps> = ({ selectedCharacterId, gameMode, onGameOver, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const framesRef = useRef<number>(0);
  
  // Input State
  const movementInput = useRef({ x: 0, y: 0, active: false });
  const attackInput = useRef({ x: 0, y: 0, angle: 0, active: false, fired: false });
  const superInput = useRef({ active: false, fired: false });
  
  // Keyboard State
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mousePos = useRef({ x: 0, y: 0 });

  // Visual FX State
  const shakeRef = useRef<number>(0);

  // Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Game State Ref (Mutable for performance)
  const worldRef = useRef<GameWorld>({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    mode: gameMode,
    players: [],
    projectiles: [],
    gems: [],
    obstacles: [],
    effects: [],
    gemSpawnerTimer: 0,
    scoreBlue: 0,
    scoreRed: 0,
    countDownTimer: null,
    goalResetTimer: 0
  });

  // React State for HUD
  const [hudState, setHudState] = useState({
    hp: 100, maxHp: 100, ammo: 3, blueScore: 0, redScore: 0, timer: null as number | null, superCharge: 0,
    isDead: false, respawnTime: 0
  });

  // --- AUDIO SYSTEM ---
  const initAudio = () => {
      if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
      }
  };

  const playSound = (type: 'SHOOT' | 'HIT' | 'KILL' | 'SUPER' | 'GOAL') => {
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'SHOOT') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
      } else if (type === 'HIT') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.linearRampToValueAtTime(50, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
          osc.start(now);
          osc.stop(now + 0.1);
      } else if (type === 'KILL') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(50, now + 0.4);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
          osc.start(now);
          osc.stop(now + 0.4);
      } else if (type === 'SUPER') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.linearRampToValueAtTime(800, now + 0.5);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.linearRampToValueAtTime(0, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
      } else if (type === 'GOAL') {
           osc.type = 'triangle';
           osc.frequency.setValueAtTime(400, now);
           osc.frequency.setValueAtTime(600, now + 0.1);
           osc.frequency.setValueAtTime(800, now + 0.2);
           gain.gain.setValueAtTime(0.2, now);
           gain.gain.linearRampToValueAtTime(0, now + 0.5);
           osc.start(now);
           osc.stop(now + 0.5);
      }
  };

  // --- KEYBOARD & MOUSE HANDLERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space') superInput.current.active = true;
      initAudio(); // Try to init audio on key press
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
      if (e.code === 'Space') {
          superInput.current.active = false;
          superInput.current.fired = true;
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseDown = (e: MouseEvent) => {
      initAudio(); // Try to init audio on click
      if (e.button === 0) { // Left Click
         attackInput.current.active = true;
      } else if (e.button === 2) { // Right Click
         superInput.current.active = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
         attackInput.current.active = false;
         attackInput.current.fired = true;
      } else if (e.button === 2) {
         superInput.current.active = false;
         superInput.current.fired = true;
      }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('contextmenu', handleContextMenu);
        if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  // --- INITIALIZATION ---
  const initWorld = () => {
      const w = worldRef.current;
      w.mode = gameMode;
      w.gems = [];
      w.projectiles = [];
      w.effects = [];
      w.scoreBlue = 0;
      w.scoreRed = 0;
      w.countDownTimer = gameMode === 'CYBER_BALL' ? 180 * 60 : null; // 3 min limit for ball

      // Obstacles
      const walls: Obstacle[] = [];
      // Borders
      walls.push({ id: 'w_t', x: -50, y: -50, width: WORLD_WIDTH+100, height: 50, type: 'WALL', radius: 0 });
      walls.push({ id: 'w_b', x: -50, y: WORLD_HEIGHT, width: WORLD_WIDTH+100, height: 50, type: 'WALL', radius: 0 });
      walls.push({ id: 'w_l', x: -50, y: 0, width: 50, height: WORLD_HEIGHT, type: 'WALL', radius: 0 });
      walls.push({ id: 'w_r', x: WORLD_WIDTH, y: 0, width: 50, height: WORLD_HEIGHT, type: 'WALL', radius: 0 });

      if (gameMode === 'GEM_GRAB') {
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
      } else {
          // CyberBall Map
          walls.push({ id: 'goal_blue', x: 0, y: WORLD_HEIGHT/2 - 150, width: 80, height: 300, type: 'GOAL_BLUE', radius: 0 });
          walls.push({ id: 'goal_red', x: WORLD_WIDTH - 80, y: WORLD_HEIGHT/2 - 150, width: 80, height: 300, type: 'GOAL_RED', radius: 0 });
          walls.push({ id: 'mid_1', x: WORLD_WIDTH/2 - 25, y: 300, width: 50, height: 200, type: 'WALL', radius: 0 });
          walls.push({ id: 'mid_2', x: WORLD_WIDTH/2 - 25, y: WORLD_HEIGHT - 500, width: 50, height: 200, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_b_1', x: 400, y: 400, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_b_2', x: 400, y: WORLD_HEIGHT - 450, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_r_1', x: WORLD_WIDTH - 450, y: 400, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_r_2', x: WORLD_WIDTH - 450, y: WORLD_HEIGHT - 450, width: 50, height: 50, type: 'WALL', radius: 0 });

          w.ball = {
              id: 'ball', x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2, radius: 15,
              vx: 0, vy: 0, carrierId: null, cooldown: 0
          };
      }
      w.obstacles = walls;
      resetPositions();
  };

  const resetPositions = () => {
      const w = worldRef.current;
      w.players = [];
      const createPlayer = (id: string, charId: string, team: Team, isBot: boolean, x: number, y: number): PlayerEntity => {
        const stats = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
        return {
          id, characterId: charId, team, isBot, x, y, radius: 24,
          hp: stats.hp, maxHp: stats.hp, angle: 0, isMoving: false,
          ammo: MAX_AMMO, maxAmmo: MAX_AMMO, reloadTimer: 0, respawnTimer: 0,
          gemCount: 0, superCharge: 0, killCount: 0,
          lastAttackTime: 0, lastSuperTime: 0, hitFlashTimer: 0
        };
      };

      const blueX = 200;
      const redX = WORLD_WIDTH - 200;
      const centerY = WORLD_HEIGHT / 2;

      w.players.push(createPlayer('player', selectedCharacterId, Team.BLUE, false, blueX, centerY));
      w.players.push(createPlayer('bot_ally_1', 'viper', Team.BLUE, true, blueX, centerY - 200));
      w.players.push(createPlayer('bot_ally_2', 'tank-top', Team.BLUE, true, blueX, centerY + 200));
      
      const enemyChars = ['neon-ninja', 'tank-top', 'glitch', 'viper', 'knuckles', 'boombox', 'inferno', 'architect', 'doc-drone', 'ghost'];
      w.players.push(createPlayer('bot_enemy_1', enemyChars[Math.floor(Math.random()*enemyChars.length)], Team.RED, true, redX, centerY));
      w.players.push(createPlayer('bot_enemy_2', enemyChars[Math.floor(Math.random()*enemyChars.length)], Team.RED, true, redX, centerY - 200));
      w.players.push(createPlayer('bot_enemy_3', enemyChars[Math.floor(Math.random()*enemyChars.length)], Team.RED, true, redX, centerY + 200));
      
      if (w.ball) {
          w.ball.x = WORLD_WIDTH/2;
          w.ball.y = WORLD_HEIGHT/2;
          w.ball.vx = 0;
          w.ball.vy = 0;
          w.ball.carrierId = null;
          w.ball.cooldown = 60;
      }
  };

  useEffect(() => {
    initWorld();
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [selectedCharacterId, gameMode]);

  // --- CORE UPDATE ---
  const update = () => {
    framesRef.current++;
    const w = worldRef.current;

    // Shake decay
    if (shakeRef.current > 0) shakeRef.current *= 0.9;
    if (shakeRef.current < 0.5) shakeRef.current = 0;

    if (w.goalResetTimer && w.goalResetTimer > 0) {
        w.goalResetTimer--;
        if (w.goalResetTimer <= 0) resetPositions();
        return;
    }

    // Update Effects
    for (let i = w.effects.length - 1; i >= 0; i--) {
        const e = w.effects[i];
        e.life--;
        if (e.vx) e.x += e.vx;
        if (e.vy) e.y += e.vy;
        if (e.life <= 0) w.effects.splice(i, 1);
    }

    // 1. Mode Logic
    if (w.mode === 'GEM_GRAB') {
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
        let blueGems = 0;
        let redGems = 0;
        w.players.forEach(p => { if(p.team === Team.BLUE) blueGems += p.gemCount; else redGems += p.gemCount; });
        w.scoreBlue = blueGems;
        w.scoreRed = redGems;
        
        if (w.scoreBlue >= WIN_GEM_COUNT || w.scoreRed >= WIN_GEM_COUNT) {
            if (w.countDownTimer === null) w.countDownTimer = 15 * 60; 
            else {
                w.countDownTimer--;
                if (w.countDownTimer <= 0) onGameOver(w.scoreBlue >= WIN_GEM_COUNT ? 'VICTORY' : 'DEFEAT');
            }
        } else {
            w.countDownTimer = null;
        }
    } else if (w.mode === 'CYBER_BALL') {
        if (w.ball) {
            const ball = w.ball;
            if (ball.cooldown > 0) ball.cooldown--;

            if (ball.carrierId) {
                const carrier = w.players.find(p => p.id === ball.carrierId);
                if (carrier && carrier.respawnTimer === 0) {
                    ball.x = carrier.x + Math.cos(carrier.angle) * 20;
                    ball.y = carrier.y + Math.sin(carrier.angle) * 20;
                    ball.vx = 0; ball.vy = 0;
                } else {
                    ball.carrierId = null;
                }
            } else {
                ball.x += ball.vx;
                ball.y += ball.vy;
                ball.vx *= BALL_FRICTION;
                ball.vy *= BALL_FRICTION;
                
                w.obstacles.forEach(obs => {
                    if (obs.type === 'WALL') {
                        if (checkCircleRect({x: ball.x + ball.vx, y: ball.y, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) ball.vx *= -1;
                        if (checkCircleRect({x: ball.x, y: ball.y + ball.vy, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) ball.vy *= -1;
                    }
                });
                if (ball.x < 0 || ball.x > WORLD_WIDTH) ball.vx *= -1;
                if (ball.y < 0 || ball.y > WORLD_HEIGHT) ball.vy *= -1;

                if (ball.cooldown === 0) {
                    for (const p of w.players) {
                        if (p.respawnTimer === 0 && dist(p, ball) < p.radius + ball.radius) {
                            ball.carrierId = p.id;
                            break;
                        }
                    }
                }
                
                w.obstacles.forEach(obs => {
                   if ((obs.type === 'GOAL_BLUE' || obs.type === 'GOAL_RED') && 
                       checkCircleRect({x: ball.x, y: ball.y, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) {
                       if (obs.type === 'GOAL_BLUE') w.scoreRed++;
                       else w.scoreBlue++;
                       playSound('GOAL');
                       shakeRef.current = 20; // Big shake on goal
                       w.goalResetTimer = 180;
                       w.ball!.vx = 0; w.ball!.vy = 0; w.ball!.x = -1000;
                   } 
                });
            }
            
            if (w.countDownTimer !== null) {
                w.countDownTimer--;
                if (w.countDownTimer <= 0 || w.scoreBlue >= WIN_GOAL_COUNT || w.scoreRed >= WIN_GOAL_COUNT) {
                    if (w.scoreBlue === w.scoreRed && w.countDownTimer <= 0) onGameOver('DRAW');
                    else onGameOver(w.scoreBlue > w.scoreRed ? 'VICTORY' : 'DEFEAT');
                }
            }
        }
    }

    // 2. Player Logic
    w.players.forEach(p => {
        if (p.hitFlashTimer > 0) p.hitFlashTimer--;

        const stats = CHARACTERS.find(c => c.id === p.characterId)!;
        if (p.respawnTimer > 0) {
            p.respawnTimer--;
            if (p.respawnTimer === 0) {
                p.hp = p.maxHp;
                p.ammo = p.maxAmmo;
                p.x = p.team === Team.BLUE ? 200 : WORLD_WIDTH - 200;
                p.y = p.team === Team.BLUE ? WORLD_HEIGHT / 2 + (Math.random() * 200 - 100) : WORLD_HEIGHT / 2 + (Math.random() * 200 - 100);
                p.hitFlashTimer = 0;
            }
            return;
        }

        // Movement Logic & AI (Same as before for stability)
        if (p.dashFrames && p.dashFrames > 0) {
            p.dashFrames--;
            // Trail effect
            if (p.dashFrames % 3 === 0) {
                 w.effects.push({ id: `trail_${p.id}_${Date.now()}`, type: 'SMOKE', x: p.x, y: p.y, color: p.team === Team.BLUE ? '#00f3ff' : '#ff0055', life: 15, maxLife: 15, size: 15, vx: 0, vy: 0 });
            }

            if (p.dashVector) { p.x += p.dashVector.x; p.y += p.dashVector.y; }
             w.obstacles.forEach(obs => {
                if (obs.type === 'WALL' && checkCircleRect({x: p.x, y: p.y, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) p.dashFrames = 0;
             });
             // Dash Collision
             if (stats.superType === 'DASH' || stats.superType === 'SLAM') {
                w.players.forEach(target => {
                    if (target.team !== p.team && target.respawnTimer === 0 && dist(p, target) < p.radius + target.radius) {
                         target.hp -= 50;
                         target.hitFlashTimer = 5;
                         playSound('HIT');
                    }
                });
            }
            p.x = Math.max(0, Math.min(WORLD_WIDTH, p.x));
            p.y = Math.max(0, Math.min(WORLD_HEIGHT, p.y));
            return;
        }

        if (p.ammo < p.maxAmmo) {
            p.reloadTimer++;
            if (p.reloadTimer >= stats.reloadTime) { p.ammo++; p.reloadTimer = 0; }
        }

        let dx = 0, dy = 0;
        let moveSpeed = stats.speed;
        let firing = false, superFiring = false, fireAngle = p.angle;
        const hasBall = w.ball?.carrierId === p.id;
        if (hasBall) moveSpeed *= 0.85;

        if (!p.isBot) {
            let kx = 0, ky = 0;
            if (keysPressed.current['w'] || keysPressed.current['arrowup']) ky -= 1;
            if (keysPressed.current['s'] || keysPressed.current['arrowdown']) ky += 1;
            if (keysPressed.current['a'] || keysPressed.current['arrowleft']) kx -= 1;
            if (keysPressed.current['d'] || keysPressed.current['arrowright']) kx += 1;
            if (kx !== 0 || ky !== 0) {
                const len = Math.sqrt(kx*kx + ky*ky);
                dx = (kx / len) * moveSpeed; dy = (ky / len) * moveSpeed;
                p.isMoving = true;
            } else if (movementInput.current.active) {
                dx = movementInput.current.x * moveSpeed; dy = movementInput.current.y * moveSpeed;
                p.isMoving = true;
            } else { p.isMoving = false; }

            if (canvasRef.current) {
                const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
                p.angle = Math.atan2(mousePos.current.y - cy, mousePos.current.x - cx);
            } else if (movementInput.current.active) {
                p.angle = Math.atan2(dy, dx);
            }

            if (attackInput.current.fired) { firing = true; fireAngle = p.angle; attackInput.current.fired = false; }
            if (superInput.current.fired) { superFiring = true; fireAngle = p.angle; superInput.current.fired = false; }
        } else {
            // Simple AI
            let target: PlayerEntity | null = null;
            let minDist = 10000;
            w.players.forEach(other => {
                if (other.team !== p.team && other.respawnTimer === 0) {
                    const d = dist(p, other);
                    if (d < minDist) { minDist = d; target = other; }
                }
            });
            let targetX = p.team === Team.BLUE ? WORLD_WIDTH - 200 : 200;
            let targetY = WORLD_HEIGHT / 2;
            if (w.mode === 'GEM_GRAB') {
                const centerGem = w.gems[0];
                if (centerGem && p.gemCount < 3) { targetX = centerGem.x; targetY = centerGem.y; }
                else if (target) {
                     if (p.hp > p.maxHp * 0.3) { targetX = target.x; targetY = target.y; }
                     else { targetX = p.team === Team.BLUE ? 100 : WORLD_WIDTH - 100; }
                }
            } else if (w.ball) {
                if (w.ball.carrierId === p.id) { targetX = p.team === Team.BLUE ? WORLD_WIDTH : 0; targetY = WORLD_HEIGHT/2; if (dist(p, {x: targetX, y: targetY}) < 400) firing = true; }
                else if (w.ball.carrierId === null) { targetX = w.ball.x; targetY = w.ball.y; }
                else { const carrier = w.players.find(pl => pl.id === w.ball!.carrierId); if (carrier) { targetX = carrier.x; targetY = carrier.y; } }
            }
            const angleToTarget = Math.atan2(targetY - p.y, targetX - p.x);
            dx = Math.cos(angleToTarget) * moveSpeed; dy = Math.sin(angleToTarget) * moveSpeed;
            p.angle = angleToTarget;
            p.isMoving = true;
            if (target && minDist < stats.range && p.ammo > 0 && Math.random() < 0.02) { firing = true; fireAngle = Math.atan2(target.y - p.y, target.x - p.x); }
            if (p.superCharge >= SUPER_CHARGE_MAX && target && minDist < 300) { superFiring = true; fireAngle = p.angle; }
        }

        let nextX = p.x + dx; let nextY = p.y + dy;
        let collidesX = false, collidesY = false;
        w.obstacles.forEach(obs => {
            if (obs.type === 'WALL') {
                if (checkCircleRect({x: nextX, y: p.y, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesX = true;
                if (checkCircleRect({x: p.x, y: nextY, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesY = true;
            }
        });
        if (!collidesX) p.x = nextX; if (!collidesY) p.y = nextY;
        p.x = Math.max(0, Math.min(WORLD_WIDTH, p.x)); p.y = Math.max(0, Math.min(WORLD_HEIGHT, p.y));

        // Action Execution
        if (hasBall && (firing || superFiring)) {
            if (w.ball) {
                w.ball.carrierId = null; w.ball.cooldown = BALL_PICKUP_COOLDOWN;
                const throwPower = superFiring ? BALL_THROW_SPEED * 1.5 : BALL_THROW_SPEED;
                w.ball.vx = Math.cos(fireAngle) * throwPower; w.ball.vy = Math.sin(fireAngle) * throwPower;
                if (!superFiring && p.ammo > 0) p.ammo--;
                if (superFiring && p.superCharge >= SUPER_CHARGE_MAX) {
                     p.superCharge = 0;
                     p.lastSuperTime = Date.now();
                     playSound('SUPER');
                }
                playSound('SHOOT');
            }
        } else if (superFiring && p.superCharge >= SUPER_CHARGE_MAX) {
            p.superCharge = 0;
            p.lastSuperTime = Date.now();
            playSound('SUPER');

            // Super Visuals
            switch (stats.superType) {
                case 'DASH':
                   w.effects.push({ id: `fx_${Date.now()}`, type: 'SHOCKWAVE', x: p.x, y: p.y, color: stats.color, life: 20, maxLife: 20, size: 60 });
                   w.effects.push({ id: `fx_b_${Date.now()}`, type: 'BURST', x: p.x, y: p.y, color: '#fff', life: 10, maxLife: 10, size: 40 });
                   break;
                case 'SLAM':
                   w.effects.push({ id: `fx_${Date.now()}`, type: 'SHOCKWAVE', x: p.x, y: p.y, color: stats.color, life: 30, maxLife: 30, size: 200 });
                   w.effects.push({ id: `fx_r_${Date.now()}`, type: 'RING', x: p.x, y: p.y, color: '#fff', life: 20, maxLife: 20, size: 150 });
                   shakeRef.current = 15;
                   break;
                case 'TELEPORT':
                    w.effects.push({ id: `fx_out_${Date.now()}`, type: 'RING', x: p.x, y: p.y, color: stats.color, life: 15, maxLife: 15, size: 60 });
                    const tx = p.x + Math.cos(fireAngle) * 250;
                    const ty = p.y + Math.sin(fireAngle) * 250;
                    w.effects.push({ id: `fx_in_${Date.now()}`, type: 'BURST', x: tx, y: ty, color: stats.color, life: 20, maxLife: 20, size: 80 });
                    break;
                case 'GRENADE':
                    w.effects.push({ id: `fx_${Date.now()}`, type: 'SPARK', x: p.x + Math.cos(fireAngle)*30, y: p.y + Math.sin(fireAngle)*30, color: '#fff', life: 10, maxLife: 10, size: 30 });
                    break;
                case 'RAPID_FIRE':
                    w.effects.push({ id: `fx_${Date.now()}`, type: 'GLOW', x: p.x, y: p.y, color: '#ff4500', life: 40, maxLife: 40, size: 60 });
                    break;
                case 'HEAL_AREA':
                    w.effects.push({ id: `fx_${Date.now()}`, type: 'RING', x: p.x, y: p.y, color: '#00ff99', life: 40, maxLife: 40, size: 150 });
                    break;
                case 'STEALTH':
                    for(let i=0; i<8; i++) w.effects.push({ id: `fx_s_${Date.now()}_${i}`, type: 'SMOKE', x: p.x, y: p.y, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, color: '#aaa', life: 30+Math.random()*20, maxLife: 50, size: 20 });
                    break;
                case 'WALL':
                    w.effects.push({ id: `fx_${Date.now()}`, type: 'SMOKE', x: p.x + Math.cos(fireAngle)*100, y: p.y + Math.sin(fireAngle)*100, color: '#DAA520', life: 30, maxLife: 30, size: 80 });
                    break;
            }

            // Super Logic
            switch (stats.superType) {
                case 'DASH':
                case 'SLAM': p.dashFrames = 10; p.dashVector = { x: Math.cos(fireAngle) * 25, y: Math.sin(fireAngle) * 25 }; break;
                case 'TELEPORT': p.x += Math.cos(fireAngle) * 250; p.y += Math.sin(fireAngle) * 250; break;
                case 'GRENADE': w.projectiles.push({ id: `super_${p.id}_${Date.now()}`, ownerId: p.id, team: p.team, x: p.x, y: p.y, vx: Math.cos(fireAngle) * 25, vy: Math.sin(fireAngle) * 25, radius: 40, damage: 2000, rangeRemaining: 800, color: '#fff', isSuper: true }); break;
                case 'RAPID_FIRE': p.ammo = 10; p.maxAmmo = 10; break;
                case 'WALL': w.obstacles.push({ id: `wall_${Date.now()}`, x: p.x + Math.cos(fireAngle)*100, y: p.y + Math.sin(fireAngle)*100, width: 60, height: 60, type: 'WALL', radius: 0 }); break;
                case 'HEAL_AREA': p.hp = Math.min(p.maxHp, p.hp + 2000); break;
                case 'STEALTH': /* handled in draw */ break;
            }
        } else if (firing && p.ammo > 0) {
            p.ammo--; p.reloadTimer = 0;
            p.lastAttackTime = Date.now();
            // Only play shoot sound for local player to avoid cacophony
            if (p.id === 'player' || dist(p, w.players.find(pl => pl.id === 'player')!) < 500) {
                playSound('SHOOT');
            }
            for (let i = 0; i < stats.projectileCount; i++) {
                const spreadAngle = (Math.random() - 0.5) * stats.spread; const finalAngle = fireAngle + spreadAngle;
                w.projectiles.push({
                    id: `proj_${p.id}_${Date.now()}_${i}`, ownerId: p.id, team: p.team,
                    x: p.x + Math.cos(finalAngle) * 30, y: p.y + Math.sin(finalAngle) * 30,
                    vx: Math.cos(finalAngle) * stats.projectileSpeed, vy: Math.sin(finalAngle) * stats.projectileSpeed,
                    radius: stats.projectileSize / 2, damage: stats.damage, rangeRemaining: stats.range, color: stats.color
                });
            }
        }

        // Gem Collection
        if (w.mode === 'GEM_GRAB') {
            for (let i = w.gems.length - 1; i >= 0; i--) {
                const g = w.gems[i];
                if (dist(p, g) < p.radius + g.radius) { p.gemCount++; w.gems.splice(i, 1); }
            }
        }
    });

    // 3. Projectiles
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const proj = w.projectiles[i];
      proj.x += proj.vx; proj.y += proj.vy;
      proj.rangeRemaining -= Math.sqrt(proj.vx*proj.vx + proj.vy*proj.vy);
      let hit = false;
      w.obstacles.forEach(obs => { if (obs.type === 'WALL' && checkCircleRect({x: proj.x, y: proj.y, r: proj.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) hit = true; });
      if (!hit) {
          for(const p of w.players) {
              if (p.team !== proj.team && p.respawnTimer === 0 && dist(p, proj) < p.radius + proj.radius) {
                  hit = true; 
                  p.hp -= proj.damage;
                  p.hitFlashTimer = 4; // Flash white for 4 frames
                  
                  // Feedback for local player
                  const owner = w.players.find(pl => pl.id === proj.ownerId);
                  
                  // Screen shake & Audio if local player involved
                  if (p.id === 'player') {
                      shakeRef.current += 4; // Shake when hit
                      playSound('HIT');
                  } else if (owner?.id === 'player') {
                      shakeRef.current += 2; // Small shake when hitting others
                      playSound('HIT');
                  }

                  if (owner) { const ownerStats = CHARACTERS.find(c => c.id === owner.characterId); if (ownerStats) owner.superCharge = Math.min(SUPER_CHARGE_MAX, owner.superCharge + ownerStats.superChargeRate); }
                  if (p.hp <= 0) {
                      p.respawnTimer = RESPAWN_TIME;
                      playSound('KILL');
                      if (p.id === 'player' || owner?.id === 'player') shakeRef.current += 10; // Big shake on kill

                      if (owner) owner.killCount++;
                      if (w.mode === 'GEM_GRAB') {
                          const gemsToDrop = Math.min(p.gemCount, 5); p.gemCount = 0;
                          for(let g=0; g<gemsToDrop; g++) w.gems.push({ id: `drop_${Date.now()}_${g}`, x: p.x + (Math.random()*40 - 20), y: p.y + (Math.random()*40 - 20), radius: 12, spawnTimer: 0 });
                      } else if (w.mode === 'CYBER_BALL' && w.ball?.carrierId === p.id) { w.ball.carrierId = null; w.ball.cooldown = 30; }
                  }
                  break;
              }
          }
      }
      if (hit || proj.rangeRemaining <= 0) w.projectiles.splice(i, 1);
    }
  };

  // --- RENDERING ---

  const drawStar = (ctx: CanvasRenderingContext2D, x: number, y: number, spikes: number, outerRadius: number, innerRadius: number, color: string) => {
      let rot = Math.PI / 2 * 3;
      let x_val = x;
      let y_val = y;
      let step = Math.PI / spikes;

      ctx.beginPath();
      ctx.moveTo(x, y - outerRadius);
      for (let i = 0; i < spikes; i++) {
          x_val = x + Math.cos(rot) * outerRadius;
          y_val = y + Math.sin(rot) * outerRadius;
          ctx.lineTo(x_val, y_val);
          rot += step;
          x_val = x + Math.cos(rot) * innerRadius;
          y_val = y + Math.sin(rot) * innerRadius;
          ctx.lineTo(x_val, y_val);
          rot += step;
      }
      ctx.lineTo(x, y - outerRadius);
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  }

  const drawEffects = (ctx: CanvasRenderingContext2D) => {
    worldRef.current.effects.forEach(e => {
        ctx.save();
        const progress = 1 - (e.life / e.maxLife);
        ctx.globalAlpha = Math.max(0, e.life / e.maxLife);
        ctx.translate(e.x, e.y);
        
        if (e.type === 'SHOCKWAVE') {
            const r = e.size * progress;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = (1-progress) * 8 + 1;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
        } else if (e.type === 'BURST') {
            const r = e.size * (1 + progress * 0.5);
            ctx.fillStyle = e.color;
            drawStar(ctx, 0, 0, 8, r, r*0.4, e.color);
        } else if (e.type === 'RING') {
            const r = e.size * progress;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, r*0.7, 0, Math.PI*2); ctx.stroke();
        } else if (e.type === 'SMOKE') {
            const r = e.size * (0.5 + progress);
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
        } else if (e.type === 'GLOW') {
             ctx.shadowBlur = 30; ctx.shadowColor = e.color;
             ctx.fillStyle = e.color;
             ctx.globalAlpha = (e.life / e.maxLife) * 0.5;
             ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI*2); ctx.fill();
        } else if (e.type === 'SPARK') {
            ctx.fillStyle = e.color;
            ctx.rotate(Math.random() * Math.PI);
            ctx.fillRect(-e.size/2, -e.size/2, e.size, e.size);
        }
        
        ctx.restore();
    });
  };

  const drawStyledProjectile = (ctx: CanvasRenderingContext2D, proj: Projectile) => {
      // Determine style based on owner/color
      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.shadowBlur = 10; ctx.shadowColor = proj.color;

      const owner = worldRef.current.players.find(p => p.id === proj.ownerId);
      const charId = owner?.characterId;

      if (charId === 'neon-ninja') {
          // Shuriken
          ctx.rotate(framesRef.current * 0.5);
          drawStar(ctx, 0, 0, 4, proj.radius * 1.5, proj.radius * 0.5, proj.color);
      } else if (charId === 'tank-top') {
          // Buckshot
          ctx.fillStyle = '#333';
          ctx.beginPath(); ctx.arc(0, 0, proj.radius, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = proj.color; ctx.lineWidth = 2; ctx.stroke();
      } else if (charId === 'viper') {
          // Needle Beam
          const angle = Math.atan2(proj.vy, proj.vx);
          ctx.rotate(angle);
          ctx.fillStyle = proj.color;
          ctx.fillRect(-proj.radius * 2, -proj.radius/2, proj.radius * 4, proj.radius);
      } else if (charId === 'inferno') {
          // Fire particle
          ctx.rotate(Math.random() * Math.PI);
          drawStar(ctx, 0, 0, 5, proj.radius, proj.radius * 0.4, '#ffaa00');
      } else if (proj.isSuper && charId === 'viper') {
          // Rocket
          const angle = Math.atan2(proj.vy, proj.vx);
          ctx.rotate(angle);
          ctx.fillStyle = '#333';
          ctx.fillRect(-15, -8, 30, 16);
          ctx.fillStyle = 'red';
          ctx.fillRect(10, -8, 5, 16); // Warhead
      } else {
          // Default
          ctx.fillStyle = proj.color;
          ctx.beginPath(); ctx.arc(0, 0, proj.radius, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
  }

  const drawStyledCharacter = (ctx: CanvasRenderingContext2D, p: PlayerEntity) => {
      const charStats = CHARACTERS.find(c => c.id === p.characterId);
      if (!charStats) return;

      const now = Date.now();
      const isMoving = p.isMoving;
      
      // Animation calculations
      const timeSinceAttack = now - p.lastAttackTime;
      const isAttacking = timeSinceAttack < 200;
      const recoil = isAttacking ? Math.max(0, 8 - (timeSinceAttack / 12)) : 0;
      
      const moveTime = now / 150; // Adjust for walk speed
      const bounce = isMoving ? Math.abs(Math.sin(moveTime * 2)) * 3 : Math.sin(now / 500) * 1.5;
      
      ctx.save();
      ctx.translate(p.x, p.y);
      
      // Hit Flash Effect
      if (p.hitFlashTimer > 0) {
          ctx.filter = 'brightness(500%)';
      }

      // 1. Shadow (Scales with bounce to ground the character)
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      const shadowScale = 1 - (bounce / 30);
      ctx.beginPath(); ctx.ellipse(0, 25, p.radius * shadowScale, p.radius * 0.5 * shadowScale, 0, 0, Math.PI*2); ctx.fill();

      // 2. Super Activation Effect
      const timeSinceSuper = now - p.lastSuperTime;
      if (timeSinceSuper < 400) {
          const progress = timeSinceSuper / 400;
          ctx.save();
          ctx.globalAlpha = 1 - progress;
          ctx.strokeStyle = charStats.color;
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, p.radius + (progress * 50), 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = charStats.color;
          ctx.globalAlpha = (1 - progress) * 0.5;
          ctx.fill();
          ctx.restore();
      }

      // 3. Rotation & Feet (Before Body)
      ctx.rotate(p.angle);
      
      // Feet Animation
      const footOffset = 8;
      let lFootX = 0, rFootX = 0;
      if (isMoving) {
          // Natural gait: opposite phases
          lFootX = Math.sin(moveTime) * 10;
          rFootX = Math.sin(moveTime + Math.PI) * 10;
      }
      
      ctx.fillStyle = '#1a1a1a'; // Boots
      ctx.beginPath(); ctx.ellipse(lFootX, -12, 8, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(rFootX, 12, 8, 5, 0, 0, Math.PI*2); ctx.fill();

      // 4. Body Translate (Bounce & Recoil)
      // Apply recoil backward relative to facing angle
      ctx.translate(-recoil, 0);
      
      const bodyColor = charStats.color;
      const skinColor = '#F5D0A9';

      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1a1a1a';

      // --- CHARACTER ART ---
      if (p.characterId === 'neon-ninja') {
          // Arms (Naruto Run)
          if (isMoving) {
              // Swept back
              ctx.fillStyle = bodyColor;
              ctx.beginPath(); ctx.ellipse(-15, -18, 10, 4, Math.PI/4, 0, Math.PI*2); ctx.fill(); ctx.stroke(); // Left
              ctx.beginPath(); ctx.ellipse(-15, 18, 10, 4, -Math.PI/4, 0, Math.PI*2); ctx.fill(); ctx.stroke(); // Right
          } else if (isAttacking) {
              // Throwing arm
               ctx.fillStyle = bodyColor;
               ctx.beginPath(); ctx.ellipse(15, 18, 12, 5, Math.PI/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          }

          // Body
          ctx.fillStyle = '#1a1a2e'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          // Head
          ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          // Headband
          ctx.fillStyle = bodyColor; ctx.fillRect(-12, -10, 24, 6); ctx.strokeRect(-12, -10, 24, 6);
          // Tails
          ctx.save();
          // Local wind effect
          const wind = Math.sin(now/100) * 5;
          ctx.beginPath(); ctx.moveTo(-12, -7); 
          ctx.quadraticCurveTo(-35, -10 + wind, -45, -5 + wind);
          ctx.strokeStyle = bodyColor; ctx.lineWidth = 4; ctx.stroke();
          ctx.restore();

      } else if (p.characterId === 'tank-top' || p.characterId === 'knuckles') {
          // Bulky Body
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.rect(-25, -20, 50, 40); ctx.fill(); ctx.stroke();
          // Shoulders
          ctx.fillStyle = '#444';
          ctx.beginPath(); ctx.arc(-25, -15, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(25, -15, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          // Head
          ctx.fillStyle = skinColor; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      
      } else if (p.characterId === 'viper') {
          // Sniper
          ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          // Long Rifle
          ctx.fillStyle = '#444'; 
          ctx.fillRect(0, 4, 50, 8); // Barrel
          ctx.strokeRect(0, 4, 50, 8);
          // Hood
          ctx.fillStyle = bodyColor; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      
      } else {
          // Generic
          ctx.fillStyle = bodyColor;
          ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.ellipse(8, -5, 4, 6, 0, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(8, 5, 4, 6, 0, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#000';
          ctx.beginPath(); ctx.arc(10, -5, 2, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(10, 5, 2, 0, Math.PI*2); ctx.fill();
      }

      // 5. Muzzle Flash
      if (isAttacking && timeSinceAttack < 80) {
          ctx.save();
          // Position flash based on general "front" of character
          ctx.translate(p.radius + 10, 5); 
          const flashScale = (80 - timeSinceAttack) / 80;
          ctx.scale(flashScale, flashScale);
          ctx.fillStyle = '#FFFF00';
          ctx.beginPath();
          drawStar(ctx, 0, 0, 5, 15, 5, '#FFFF00');
          ctx.fill();
          ctx.restore();
      }

      // Super Aura (Ready State)
      if (p.superCharge >= SUPER_CHARGE_MAX) {
          ctx.rotate(-p.angle); // Detach rotation for aura
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 2;
          const dashOffset = (now / 20) % 20;
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -dashOffset;
          ctx.beginPath(); ctx.arc(0, 0, p.radius + 8, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
      }

      ctx.restore();
  }

  const drawFloorPattern = (ctx: CanvasRenderingContext2D, camX: number, camY: number, width: number, height: number) => {
      // Draw Tiled Floor
      ctx.fillStyle = '#2F4F4F'; // Dark Slate Gray
      ctx.fillRect(0, 0, width, height);
      
      // Grid/Tiles
      ctx.strokeStyle = 'rgba(0, 255, 153, 0.1)';
      ctx.lineWidth = 2;
      const startX = Math.floor(-camX / TILE_SIZE) * TILE_SIZE;
      const startY = Math.floor(-camY / TILE_SIZE) * TILE_SIZE;

      for (let x = startX; x < startX + width + TILE_SIZE; x += TILE_SIZE) {
          for (let y = startY; y < startY + height + TILE_SIZE; y += TILE_SIZE) {
             // Add some organic variation to tiles
             if ((Math.abs(x) + Math.abs(y)) % 300 === 0) {
                 ctx.fillStyle = 'rgba(0, 200, 100, 0.15)';
                 ctx.fillRect(x + camX, y + camY, TILE_SIZE - 2, TILE_SIZE - 2);
             }
             ctx.strokeRect(x + camX, y + camY, TILE_SIZE, TILE_SIZE);
          }
      }

      // Cloud Shadows (Ghibli effect)
      const time = Date.now() / 10000;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let i=0; i<5; i++) {
         const cx = ((time * 50 + i * 400) % (WORLD_WIDTH + 500)) - 250 + camX;
         const cy = ((i * 300) % WORLD_HEIGHT) + camY;
         ctx.beginPath();
         ctx.arc(cx, cy, 150 + i * 20, 0, Math.PI * 2);
         ctx.fill();
      }
  }

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = worldRef.current;
    const player = w.players.find(p => p.id === 'player');
    if (!player) return;

    // Camera with Shake
    const shakeX = (Math.random() - 0.5) * shakeRef.current;
    const shakeY = (Math.random() - 0.5) * shakeRef.current;

    const camX = Math.min(0, Math.max(-player.x + canvas.width / 2, canvas.width - WORLD_WIDTH)) + shakeX;
    const camY = Math.min(0, Math.max(-player.y + canvas.height / 2, canvas.height - WORLD_HEIGHT)) + shakeY;

    // 1. Draw World Floor
    drawFloorPattern(ctx, camX, camY, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(camX, camY);

    // 2. Obstacles
    w.obstacles.forEach(obs => {
        ctx.save();
        ctx.shadowBlur = 0;
        if (obs.type.startsWith('GOAL')) {
            ctx.fillStyle = obs.type === 'GOAL_BLUE' ? 'rgba(0,100,255,0.3)' : 'rgba(255,50,50,0.3)';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = obs.type === 'GOAL_BLUE' ? '#00f' : '#f00';
            ctx.lineWidth = 3;
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
            // Goal lines
            ctx.beginPath(); ctx.moveTo(obs.x, obs.y); ctx.lineTo(obs.x + obs.width, obs.y + obs.height); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(obs.x + obs.width, obs.y); ctx.lineTo(obs.x, obs.y + obs.height); ctx.stroke();
        } else {
            // Stone/Tech Walls
            ctx.fillStyle = '#343a40'; // Dark stone
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            
            // Top Highlight (3D effect)
            ctx.fillStyle = '#495057'; 
            ctx.fillRect(obs.x, obs.y, obs.width, 10);
            
            // Mossy/Neon Vines
            ctx.strokeStyle = '#00ff99';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(obs.x + 5, obs.y + obs.height);
            ctx.lineTo(obs.x + 5, obs.y + 10);
            ctx.stroke();

            // Border
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        }
        ctx.restore();
    });

    // 3. Decals (Center)
    if (gameMode === 'GEM_GRAB') {
         // Center Spawner Hole
         ctx.fillStyle = '#000';
         ctx.beginPath(); ctx.arc(WORLD_WIDTH/2, WORLD_HEIGHT/2, 40, 0, Math.PI*2); ctx.fill();
         ctx.strokeStyle = '#8800ff'; ctx.lineWidth = 4; ctx.stroke();
    } else {
         // Midfield Circle
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; ctx.lineWidth = 5; 
         ctx.beginPath(); ctx.arc(WORLD_WIDTH/2, WORLD_HEIGHT/2, 80, 0, Math.PI*2); ctx.stroke();
         ctx.beginPath(); ctx.moveTo(WORLD_WIDTH/2, 0); ctx.lineTo(WORLD_WIDTH/2, WORLD_HEIGHT); ctx.stroke();
    }

    // 4. Gems
    w.gems.forEach(gem => {
        const floatY = Math.sin(Date.now() / 200) * 5;
        ctx.save(); ctx.translate(gem.x, gem.y + floatY);
        ctx.shadowColor = '#d0f'; ctx.shadowBlur = 15; ctx.fillStyle = '#d0f';
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
    });

    // 5. Ball
    if (w.ball && w.ball.x > -500) { 
        ctx.save(); ctx.translate(w.ball.x, w.ball.y);
        ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, w.ball.radius, 0, Math.PI*2); ctx.fill();
        // Soccer/Tech Pattern
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-w.ball.radius, 0); ctx.lineTo(w.ball.radius, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, w.ball.radius/2, 0, Math.PI*2); ctx.stroke();
        ctx.restore();
    }

    // 6. Projectiles
    w.projectiles.forEach(proj => drawStyledProjectile(ctx, proj));

    // 7. Effects (Particles, Shockwaves)
    drawEffects(ctx);

    // 8. Players
    w.players.forEach(p => {
        if (p.respawnTimer > 0) return;
        drawStyledCharacter(ctx, p);

        // HP Bar
        const hpPct = p.hp / p.maxHp;
        ctx.fillStyle = '#000'; ctx.fillRect(p.x - 20, p.y - 45, 40, 6);
        ctx.fillStyle = hpPct > 0.5 ? '#00ff00' : '#ff0000'; ctx.fillRect(p.x - 20, p.y - 45, 40 * hpPct, 6);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(p.x - 20, p.y - 45, 40, 6);
        
        // Info
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        if (w.mode === 'GEM_GRAB' && p.gemCount > 0) ctx.fillText(`💎 ${p.gemCount}`, p.x, p.y - 55);
    });

    ctx.restore();

    // HUD Sync
    if (player) {
        setHudState({
            hp: player.hp, maxHp: player.maxHp, ammo: player.ammo,
            blueScore: w.scoreBlue, redScore: w.scoreRed, timer: w.countDownTimer,
            superCharge: player.superCharge, isDead: player.respawnTimer > 0, respawnTime: Math.ceil(player.respawnTimer/60)
        });
    }
  };

  const gameLoop = () => { update(); draw(); requestRef.current = requestAnimationFrame(gameLoop); };

  useEffect(() => {
      const handleResize = () => { if (canvasRef.current) { canvasRef.current.width = window.innerWidth; canvasRef.current.height = window.innerHeight; } };
      window.addEventListener('resize', handleResize); handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMoveJoy = (data: any) => { movementInput.current = data; };
  const handleAttackJoy = (data: any) => {
      const wasActive = attackInput.current.active;
      if (wasActive && !data.active) attackInput.current.fired = true;
      attackInput.current = { ...data, fired: attackInput.current.fired };
  };

  return (
    <div className="relative w-full h-full bg-[#2F4F4F] overflow-hidden cursor-crosshair">
      <canvas ref={canvasRef} className="block" />
      
      {/* HUD Top */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none select-none">
          <div className="flex flex-col items-start">
              <div className="text-cyber-neonBlue font-bold text-3xl drop-shadow-md font-orbitron">{hudState.blueScore}</div>
          </div>
          <div className="flex flex-col items-center bg-black/40 px-6 py-2 rounded-full border border-white/10 backdrop-blur-sm">
               {hudState.timer && <div className="text-3xl font-black text-white">{Math.floor(hudState.timer / 60)}:{String(Math.floor((hudState.timer % 60))).padStart(2, '0')}</div>}
               {gameMode === 'CYBER_BALL' && <div className="text-xs text-gray-300 uppercase tracking-widest">First to 3</div>}
          </div>
          <div className="flex flex-col items-end">
              <div className="text-red-500 font-bold text-3xl drop-shadow-md font-orbitron">{hudState.redScore}</div>
          </div>
      </div>

      {/* Respawn Screen */}
      {hudState.isDead && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none z-40">
              <div className="text-5xl font-black text-white drop-shadow-[0_2px_0_#000] animate-bounce">RESPAWN IN {hudState.respawnTime}</div>
          </div>
      )}

      {/* HUD Bottom (PC friendly) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none">
           {/* Ammo */}
           <div className="flex gap-1 mb-2">
              {[...Array(MAX_AMMO)].map((_, i) => (
                  <div key={i} className={`w-12 h-3 border-2 border-black rounded-sm transform -skew-x-12 ${i < hudState.ammo ? 'bg-orange-400' : 'bg-gray-700'}`} />
              ))}
           </div>
           {/* HP */}
           <div className="w-72 h-8 bg-gray-900 border-2 border-black rounded-lg relative overflow-hidden shadow-lg">
               <div className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-200" style={{ width: `${(hudState.hp / hudState.maxHp) * 100}%` }} />
               <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{Math.ceil(hudState.hp)} / {hudState.maxHp}</div>
           </div>
           {/* Super Button */}
           <div className="mt-4 relative group">
               <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300 shadow-xl
                   ${hudState.superCharge >= SUPER_CHARGE_MAX ? 'border-yellow-400 bg-yellow-500 animate-pulse scale-110' : 'border-gray-600 bg-gray-800'}`}>
                   <div className="text-center">
                       {hudState.superCharge >= SUPER_CHARGE_MAX ? (
                           <div className="text-black font-black text-2xl">SUPER!</div>
                       ) : (
                           <div className="text-white font-bold text-lg">{Math.floor(hudState.superCharge)}%</div>
                       )}
                   </div>
               </div>
               <div className="absolute -bottom-6 w-full text-center text-xs font-bold text-white/50">SPACE</div>
           </div>
      </div>

      {/* Mobile Controls */}
      <div className="absolute bottom-12 left-12 z-10 md:opacity-20 hover:opacity-100 transition-opacity">
        <Joystick identifier="move" onMove={handleMoveJoy} color="cyan" />
      </div>
      <div className="absolute bottom-12 right-12 z-10 md:opacity-20 hover:opacity-100 transition-opacity">
         <Joystick identifier="shoot" onMove={handleAttackJoy} color="red" />
      </div>
      
      <button onClick={onBack} className="absolute top-4 right-4 bg-red-600 text-white text-xs px-4 py-2 rounded-full border-2 border-red-800 hover:bg-red-500 z-20 pointer-events-auto font-bold shadow-lg">
        EXIT
      </button>
    </div>
  );
};
