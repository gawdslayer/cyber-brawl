import React, { useEffect, useRef, useState } from 'react';
import { GameMode, GameWorld, PlayerEntity, Team, Projectile, Obstacle } from '../types';
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
  
  // Input State
  const movementInput = useRef({ x: 0, y: 0, active: false });
  const attackInput = useRef({ x: 0, y: 0, angle: 0, active: false, fired: false });
  const superInput = useRef({ active: false, fired: false });
  
  // Keyboard State
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mousePos = useRef({ x: 0, y: 0 });

  // Game State Ref (Mutable for performance)
  const worldRef = useRef<GameWorld>({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    mode: gameMode,
    players: [],
    projectiles: [],
    gems: [],
    obstacles: [],
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

  // --- KEYBOARD & MOUSE HANDLERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      if (e.code === 'Space') superInput.current.active = true;
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
      // Store raw client coordinates, convert in loop relative to player camera
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseDown = (e: MouseEvent) => {
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
    };
  }, []);

  // --- INITIALIZATION ---
  const initWorld = () => {
      const w = worldRef.current;
      w.mode = gameMode;
      w.gems = [];
      w.projectiles = [];
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
          // Goals
          walls.push({ id: 'goal_blue', x: 0, y: WORLD_HEIGHT/2 - 150, width: 80, height: 300, type: 'GOAL_BLUE', radius: 0 });
          walls.push({ id: 'goal_red', x: WORLD_WIDTH - 80, y: WORLD_HEIGHT/2 - 150, width: 80, height: 300, type: 'GOAL_RED', radius: 0 });
          
          // Midfield barriers
          walls.push({ id: 'mid_1', x: WORLD_WIDTH/2 - 25, y: 300, width: 50, height: 200, type: 'WALL', radius: 0 });
          walls.push({ id: 'mid_2', x: WORLD_WIDTH/2 - 25, y: WORLD_HEIGHT - 500, width: 50, height: 200, type: 'WALL', radius: 0 });
          
          // Defensive barriers
          walls.push({ id: 'def_b_1', x: 400, y: 400, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_b_2', x: 400, y: WORLD_HEIGHT - 450, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_r_1', x: WORLD_WIDTH - 450, y: 400, width: 50, height: 50, type: 'WALL', radius: 0 });
          walls.push({ id: 'def_r_2', x: WORLD_WIDTH - 450, y: WORLD_HEIGHT - 450, width: 50, height: 50, type: 'WALL', radius: 0 });

          // Spawn Ball
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
      // Clear Players
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

      // Positions based on mode
      const blueX = gameMode === 'GEM_GRAB' ? 200 : 200;
      const redX = gameMode === 'GEM_GRAB' ? WORLD_WIDTH - 200 : WORLD_WIDTH - 200;
      const centerY = WORLD_HEIGHT / 2;

      // Player (Blue)
      w.players.push(createPlayer('player', selectedCharacterId, Team.BLUE, false, blueX, centerY));
      // Bots (Blue)
      w.players.push(createPlayer('bot_ally_1', 'viper', Team.BLUE, true, blueX, centerY - 200));
      w.players.push(createPlayer('bot_ally_2', 'tank-top', Team.BLUE, true, blueX, centerY + 200));
      // Bots (Red)
      const enemyChars = ['neon-ninja', 'tank-top', 'glitch', 'viper', 'knuckles', 'boombox'];
      w.players.push(createPlayer('bot_enemy_1', enemyChars[Math.floor(Math.random()*6)], Team.RED, true, redX, centerY));
      w.players.push(createPlayer('bot_enemy_2', enemyChars[Math.floor(Math.random()*6)], Team.RED, true, redX, centerY - 200));
      w.players.push(createPlayer('bot_enemy_3', enemyChars[Math.floor(Math.random()*6)], Team.RED, true, redX, centerY + 200));
      
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
    const w = worldRef.current;

    // Pause for goal reset
    if (w.goalResetTimer && w.goalResetTimer > 0) {
        w.goalResetTimer--;
        if (w.goalResetTimer <= 0) {
            resetPositions();
        }
        return; // Stop updating logic during reset
    }

    // 1. Mode Specific Logic
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
        // Gem Scoring Logic
        let blueGems = 0;
        let redGems = 0;
        w.players.forEach(p => { if(p.team === Team.BLUE) blueGems += p.gemCount; else redGems += p.gemCount; });
        w.scoreBlue = blueGems;
        w.scoreRed = redGems;
        
        if (w.scoreBlue >= WIN_GEM_COUNT || w.scoreRed >= WIN_GEM_COUNT) {
            if (w.countDownTimer === null) w.countDownTimer = 15 * 60; 
            else {
                w.countDownTimer--;
                if (w.countDownTimer <= 0) {
                    onGameOver(w.scoreBlue >= WIN_GEM_COUNT ? 'VICTORY' : 'DEFEAT');
                }
            }
        } else {
            w.countDownTimer = null;
        }
    } else if (w.mode === 'CYBER_BALL') {
        // Ball Physics
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
                    ball.carrierId = null; // Drop if carrier dead/gone
                }
            } else {
                // Friction
                ball.x += ball.vx;
                ball.y += ball.vy;
                ball.vx *= BALL_FRICTION;
                ball.vy *= BALL_FRICTION;
                
                // Wall Bounce
                w.obstacles.forEach(obs => {
                    if (obs.type === 'WALL') {
                        if (checkCircleRect({x: ball.x + ball.vx, y: ball.y, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) ball.vx *= -1;
                        if (checkCircleRect({x: ball.x, y: ball.y + ball.vy, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) ball.vy *= -1;
                    }
                });
                // Border Bounce
                if (ball.x < 0 || ball.x > WORLD_WIDTH) ball.vx *= -1;
                if (ball.y < 0 || ball.y > WORLD_HEIGHT) ball.vy *= -1;

                // Pickup Logic
                if (ball.cooldown === 0) {
                    for (const p of w.players) {
                        if (p.respawnTimer === 0 && dist(p, ball) < p.radius + ball.radius) {
                            ball.carrierId = p.id;
                            break;
                        }
                    }
                }
                
                // Goal Check
                w.obstacles.forEach(obs => {
                   if ((obs.type === 'GOAL_BLUE' || obs.type === 'GOAL_RED') && 
                       checkCircleRect({x: ball.x, y: ball.y, r: ball.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) {
                       
                       if (obs.type === 'GOAL_BLUE') w.scoreRed++; // Scored in blue goal = Red point
                       else w.scoreBlue++;
                       
                       w.goalResetTimer = 180; // 3 sec pause
                       w.ball!.vx = 0; w.ball!.vy = 0; w.ball!.x = -1000; // Hide ball
                   } 
                });
            }
            
            // Time Limit
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
        const stats = CHARACTERS.find(c => c.id === p.characterId)!;

        // Dead state
        if (p.respawnTimer > 0) {
            p.respawnTimer--;
            if (p.respawnTimer === 0) {
                p.hp = p.maxHp;
                p.ammo = p.maxAmmo;
                p.x = p.team === Team.BLUE ? 200 : WORLD_WIDTH - 200;
                p.y = p.team === Team.BLUE ? WORLD_HEIGHT / 2 + (Math.random() * 200 - 100) : WORLD_HEIGHT / 2 + (Math.random() * 200 - 100);
                // Invulnerable visual? (Skip for now)
            }
            return;
        }

        // Dash Physics
        if (p.dashFrames && p.dashFrames > 0) {
            p.dashFrames--;
            if (p.dashVector) {
                p.x += p.dashVector.x;
                p.y += p.dashVector.y;
            }
            // Dash collision with players (Damage)
            if (stats.superType === 'DASH' || stats.superType === 'SLAM') {
                w.players.forEach(target => {
                    if (target.team !== p.team && target.respawnTimer === 0 && dist(p, target) < p.radius + target.radius) {
                        target.hp -= 50; // Dash graze damage
                    }
                });
            }
            // Wall collision (Stop dash)
             w.obstacles.forEach(obs => {
                if (obs.type === 'WALL' && checkCircleRect({x: p.x, y: p.y, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) {
                    p.dashFrames = 0;
                }
             });
            
            p.x = Math.max(0, Math.min(WORLD_WIDTH, p.x));
            p.y = Math.max(0, Math.min(WORLD_HEIGHT, p.y));
            return; // Skip normal movement/shooting while dashing
        }

        // Reload
        if (p.ammo < p.maxAmmo) {
            p.reloadTimer++;
            if (p.reloadTimer >= stats.reloadTime) {
                p.ammo++;
                p.reloadTimer = 0;
            }
        }

        // Input Processing
        let dx = 0, dy = 0;
        let moveSpeed = stats.speed;
        let firing = false;
        let superFiring = false;
        let fireAngle = p.angle;

        // Has Ball?
        const hasBall = w.ball?.carrierId === p.id;
        if (hasBall) moveSpeed *= 0.85; // Slower with ball

        if (!p.isBot) {
            // Keyboard Input Integration
            let kx = 0, ky = 0;
            if (keysPressed.current['w'] || keysPressed.current['arrowup']) ky -= 1;
            if (keysPressed.current['s'] || keysPressed.current['arrowdown']) ky += 1;
            if (keysPressed.current['a'] || keysPressed.current['arrowleft']) kx -= 1;
            if (keysPressed.current['d'] || keysPressed.current['arrowright']) kx += 1;

            // Normalize keyboard
            if (kx !== 0 || ky !== 0) {
                const len = Math.sqrt(kx*kx + ky*ky);
                dx = (kx / len) * moveSpeed;
                dy = (ky / len) * moveSpeed;
            } else if (movementInput.current.active) {
                dx = movementInput.current.x * moveSpeed;
                dy = movementInput.current.y * moveSpeed;
            }

            // Facing Angle (Mouse has priority if active, else movement)
            if (canvasRef.current) {
                // Calculate angle based on mouse pos relative to center of screen
                const cx = window.innerWidth / 2;
                const cy = window.innerHeight / 2;
                p.angle = Math.atan2(mousePos.current.y - cy, mousePos.current.x - cx);
            } else if (movementInput.current.active) {
                p.angle = Math.atan2(dy, dx);
            }

            // Attack / Super Trigger
            if (attackInput.current.fired) {
                firing = true;
                fireAngle = p.angle; // Aim where looking
                attackInput.current.fired = false;
            }
            if (superInput.current.fired) {
                superFiring = true;
                fireAngle = p.angle;
                superInput.current.fired = false;
            }
        } else {
            // AI LOGIC
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
            } else {
                // Ball Mode AI
                if (w.ball) {
                    if (w.ball.carrierId === p.id) {
                        // I have ball, go to goal
                        targetX = p.team === Team.BLUE ? WORLD_WIDTH : 0; // Enemy goal
                        targetY = WORLD_HEIGHT/2;
                        if (dist(p, {x: targetX, y: targetY}) < 400) firing = true; // Shoot at goal
                    } else if (w.ball.carrierId === null) {
                        // Go to ball
                        targetX = w.ball.x; targetY = w.ball.y;
                    } else {
                         // Chase carrier
                         const carrier = w.players.find(pl => pl.id === w.ball!.carrierId);
                         if (carrier && carrier.team !== p.team) { targetX = carrier.x; targetY = carrier.y; }
                         else if (carrier) { 
                             // Escort ally
                             targetX = carrier.x + 100; targetY = carrier.y; 
                         }
                    }
                }
            }

            const angleToTarget = Math.atan2(targetY - p.y, targetX - p.x);
            dx = Math.cos(angleToTarget) * moveSpeed;
            dy = Math.sin(angleToTarget) * moveSpeed;
            p.angle = angleToTarget;

            // Bot Shooting
            if (target && minDist < stats.range && p.ammo > 0 && Math.random() < 0.02) {
                firing = true;
                fireAngle = Math.atan2(target.y - p.y, target.x - p.x);
            }
            // Bot Super
            if (p.superCharge >= SUPER_CHARGE_MAX && target && minDist < 300) {
                superFiring = true;
                fireAngle = p.angle;
            }
        }

        // Move
        let nextX = p.x + dx;
        let nextY = p.y + dy;
        let collidesX = false, collidesY = false;
        w.obstacles.forEach(obs => {
            if (obs.type === 'WALL') {
                if (checkCircleRect({x: nextX, y: p.y, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesX = true;
                if (checkCircleRect({x: p.x, y: nextY, r: p.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) collidesY = true;
            }
        });
        if (!collidesX) p.x = nextX;
        if (!collidesY) p.y = nextY;
        p.x = Math.max(0, Math.min(WORLD_WIDTH, p.x));
        p.y = Math.max(0, Math.min(WORLD_HEIGHT, p.y));

        // --- ACTIONS ---
        
        // If carrying ball, shooting throws ball
        if (hasBall && (firing || superFiring)) {
            if (w.ball) {
                w.ball.carrierId = null;
                w.ball.cooldown = BALL_PICKUP_COOLDOWN;
                const throwPower = superFiring ? BALL_THROW_SPEED * 1.5 : BALL_THROW_SPEED;
                w.ball.vx = Math.cos(fireAngle) * throwPower;
                w.ball.vy = Math.sin(fireAngle) * throwPower;
                // Consume ammo if shooting ball? Let's say yes for standard shot
                if (!superFiring && p.ammo > 0) p.ammo--;
                if (superFiring && p.superCharge >= SUPER_CHARGE_MAX) p.superCharge = 0;
            }
        } 
        // Normal Super Execution
        else if (superFiring && p.superCharge >= SUPER_CHARGE_MAX) {
            p.superCharge = 0;
            
            switch (stats.superType) {
                case 'DASH':
                case 'SLAM':
                    p.dashFrames = 10;
                    p.dashVector = { x: Math.cos(fireAngle) * 25, y: Math.sin(fireAngle) * 25 };
                    break;
                case 'TELEPORT':
                    p.x += Math.cos(fireAngle) * 250;
                    p.y += Math.sin(fireAngle) * 250;
                    break;
                case 'GRENADE':
                     w.projectiles.push({
                        id: `super_${p.id}_${Date.now()}`,
                        ownerId: p.id, team: p.team,
                        x: p.x, y: p.y,
                        vx: Math.cos(fireAngle) * 25, vy: Math.sin(fireAngle) * 25,
                        radius: 40, damage: 2000, rangeRemaining: 800,
                        color: '#fff', isSuper: true
                    });
                    break;
                case 'RAPID_FIRE':
                    p.ammo = 10; // Temporary ammo boost
                    p.maxAmmo = 10; // visual hack
                    break;
                case 'WALL':
                    w.obstacles.push({
                        id: `wall_${Date.now()}`, x: p.x + Math.cos(fireAngle)*100, y: p.y + Math.sin(fireAngle)*100,
                        width: 60, height: 60, type: 'WALL', radius: 0
                    });
                    break;
                case 'HEAL_AREA':
                    // Simply heal self for now
                    p.hp = Math.min(p.maxHp, p.hp + 2000);
                    break;
                default:
                    break;
            }
        }
        // Normal Shooting
        else if (firing && p.ammo > 0) {
            p.ammo--;
            p.reloadTimer = 0;
            for (let i = 0; i < stats.projectileCount; i++) {
                const spreadAngle = (Math.random() - 0.5) * stats.spread;
                const finalAngle = fireAngle + spreadAngle;
                w.projectiles.push({
                    id: `proj_${p.id}_${Date.now()}_${i}`,
                    ownerId: p.id, team: p.team,
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
        if (w.mode === 'GEM_GRAB') {
            for (let i = w.gems.length - 1; i >= 0; i--) {
                const g = w.gems[i];
                if (dist(p, g) < p.radius + g.radius) {
                    p.gemCount++;
                    w.gems.splice(i, 1);
                }
            }
        }
    });

    // 3. Projectiles
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const proj = w.projectiles[i];
      proj.x += proj.vx;
      proj.y += proj.vy;
      proj.rangeRemaining -= Math.sqrt(proj.vx*proj.vx + proj.vy*proj.vy);
      let hit = false;

      w.obstacles.forEach(obs => {
          if (obs.type === 'WALL' && checkCircleRect({x: proj.x, y: proj.y, r: proj.radius}, {x: obs.x, y: obs.y, w: obs.width, h: obs.height})) hit = true;
      });

      if (!hit) {
          for(const p of w.players) {
              if (p.team !== proj.team && p.respawnTimer === 0 && dist(p, proj) < p.radius + proj.radius) {
                  hit = true;
                  p.hp -= proj.damage;
                  // Charge Super
                  const owner = w.players.find(pl => pl.id === proj.ownerId);
                  if (owner) {
                      const ownerStats = CHARACTERS.find(c => c.id === owner.characterId);
                      if (ownerStats) owner.superCharge = Math.min(SUPER_CHARGE_MAX, owner.superCharge + ownerStats.superChargeRate);
                  }

                  if (p.hp <= 0) {
                      p.respawnTimer = RESPAWN_TIME;
                      if (owner) owner.killCount++;
                      // Drop Gems
                      if (w.mode === 'GEM_GRAB') {
                          const gemsToDrop = Math.min(p.gemCount, 5);
                          p.gemCount = 0;
                          for(let g=0; g<gemsToDrop; g++) {
                              w.gems.push({
                                  id: `drop_${Date.now()}_${g}`,
                                  x: p.x + (Math.random()*40 - 20), y: p.y + (Math.random()*40 - 20),
                                  radius: 12, spawnTimer: 0
                              });
                          }
                      } else if (w.mode === 'CYBER_BALL' && w.ball?.carrierId === p.id) {
                           w.ball.carrierId = null;
                           w.ball.cooldown = 30;
                      }
                  }
                  break;
              }
          }
      }
      if (hit || proj.rangeRemaining <= 0) w.projectiles.splice(i, 1);
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = worldRef.current;
    const player = w.players.find(p => p.id === 'player');
    if (!player) return;

    // Camera
    ctx.save();
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const camX = Math.min(0, Math.max(-player.x + canvas.width / 2, canvas.width - WORLD_WIDTH));
    const camY = Math.min(0, Math.max(-player.y + canvas.height / 2, canvas.height - WORLD_HEIGHT));
    ctx.translate(camX, camY);

    // Grid
    ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2;
    for(let x=0; x<=WORLD_WIDTH; x+=TILE_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_HEIGHT); ctx.stroke(); }
    for(let y=0; y<=WORLD_HEIGHT; y+=TILE_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_WIDTH, y); ctx.stroke(); }

    // Objects
    ctx.shadowBlur = 0;
    w.obstacles.forEach(obs => {
        if (obs.type === 'GOAL_BLUE') {
            ctx.fillStyle = 'rgba(0,0,255,0.2)'; ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = '#00f'; ctx.lineWidth = 2; ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'GOAL_RED') {
            ctx.fillStyle = 'rgba(255,0,0,0.2)'; ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = '#f00'; ctx.lineWidth = 2; ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else {
            ctx.fillStyle = '#222233'; ctx.strokeStyle = '#4444cc'; ctx.lineWidth = 1;
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height); ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        }
    });

    // Decals (Center)
    if (gameMode === 'GEM_GRAB') {
         ctx.fillStyle = 'rgba(0, 255, 153, 0.1)';
         ctx.beginPath(); ctx.arc(WORLD_WIDTH/2, WORLD_HEIGHT/2, 60, 0, Math.PI*2); ctx.fill();
    } else {
         ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.globalAlpha = 0.2;
         ctx.beginPath(); ctx.arc(WORLD_WIDTH/2, WORLD_HEIGHT/2, 80, 0, Math.PI*2); ctx.stroke();
         ctx.beginPath(); ctx.moveTo(WORLD_WIDTH/2, 0); ctx.lineTo(WORLD_WIDTH/2, WORLD_HEIGHT); ctx.stroke();
         ctx.globalAlpha = 1.0;
    }

    // Gems
    w.gems.forEach(gem => {
        ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 15; ctx.fillStyle = '#ff00ff';
        ctx.beginPath(); ctx.moveTo(gem.x, gem.y-8); ctx.lineTo(gem.x+8, gem.y); ctx.lineTo(gem.x, gem.y+8); ctx.lineTo(gem.x-8, gem.y); ctx.fill();
    });

    // Ball
    if (w.ball && w.ball.x > -500) { // Visible check
        ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(w.ball.x, w.ball.y, w.ball.radius, 0, Math.PI*2); ctx.fill();
        // Stripe
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(w.ball.x - w.ball.radius, w.ball.y); ctx.lineTo(w.ball.x + w.ball.radius, w.ball.y); ctx.stroke();
    }

    // Projectiles
    w.projectiles.forEach(proj => {
        ctx.fillStyle = proj.color; ctx.shadowColor = proj.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI*2); ctx.fill();
    });

    // Players
    w.players.forEach(p => {
        if (p.respawnTimer > 0) return;
        ctx.save(); ctx.translate(p.x, p.y);
        const teamColor = p.team === Team.BLUE ? '#00f3ff' : '#ff3333';
        
        // Ring
        if (p.superCharge >= SUPER_CHARGE_MAX) {
             ctx.beginPath(); ctx.arc(0,0,p.radius+5,0,Math.PI*2); 
             ctx.strokeStyle = 'yellow'; ctx.lineWidth = 2; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]);
        }

        // Body
        ctx.shadowBlur = 10; ctx.shadowColor = teamColor; ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = teamColor; ctx.lineWidth = 3; ctx.stroke();
        
        // Direction
        ctx.rotate(p.angle); ctx.fillStyle = teamColor;
        ctx.beginPath(); ctx.moveTo(p.radius + 5, 0); ctx.lineTo(p.radius - 5, 5); ctx.lineTo(p.radius - 5, -5); ctx.fill();
        ctx.restore();

        // HP Bar
        ctx.shadowBlur = 0; const hpPct = p.hp / p.maxHp;
        ctx.fillStyle = '#333'; ctx.fillRect(p.x - 20, p.y - 40, 40, 6);
        ctx.fillStyle = hpPct > 0.5 ? '#00ff00' : '#ff0000'; ctx.fillRect(p.x - 20, p.y - 40, 40 * hpPct, 6);
        
        // Info
        ctx.fillStyle = '#fff'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
        if (w.mode === 'GEM_GRAB' && p.gemCount > 0) ctx.fillText(`💎 ${p.gemCount}`, p.x, p.y - 45);
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
    <div className="relative w-full h-full bg-black overflow-hidden cursor-crosshair">
      <canvas ref={canvasRef} className="block" />
      
      {/* HUD Top */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none select-none">
          <div className="flex flex-col items-start">
              <div className="text-cyber-neonBlue font-bold text-2xl drop-shadow-[0_0_5px_#00f3ff]">{hudState.blueScore}</div>
          </div>
          <div className="flex flex-col items-center">
               {hudState.timer && <div className="text-3xl font-black text-white">{Math.floor(hudState.timer / 60)}:{String(Math.floor((hudState.timer % 60))).padStart(2, '0')}</div>}
               {gameMode === 'CYBER_BALL' && <div className="text-xs text-gray-400 uppercase tracking-widest">First to 3</div>}
          </div>
          <div className="flex flex-col items-end">
              <div className="text-red-500 font-bold text-2xl drop-shadow-[0_0_5px_#f00]">{hudState.redScore}</div>
          </div>
      </div>

      {/* Respawn Screen */}
      {hudState.isDead && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
              <div className="text-4xl font-black text-red-500 animate-pulse">RESPAWN IN {hudState.respawnTime}</div>
          </div>
      )}

      {/* HUD Bottom (PC friendly) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none">
           {/* Ammo */}
           <div className="flex gap-1 mb-2">
              {[...Array(MAX_AMMO)].map((_, i) => (
                  <div key={i} className={`w-12 h-3 border border-white/50 skew-x-12 ${i < hudState.ammo ? 'bg-orange-500 shadow-[0_0_10px_orange]' : 'bg-gray-800'}`} />
              ))}
           </div>
           {/* HP */}
           <div className="w-64 h-6 bg-gray-900 border border-white/30 rounded relative overflow-hidden">
               <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${(hudState.hp / hudState.maxHp) * 100}%` }} />
               <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">{Math.ceil(hudState.hp)} / {hudState.maxHp}</div>
           </div>
           {/* Super Button */}
           <div className="mt-4 relative">
               <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all duration-300
                   ${hudState.superCharge >= SUPER_CHARGE_MAX ? 'border-yellow-400 bg-yellow-500/20 shadow-[0_0_30px_yellow] animate-pulse scale-110' : 'border-gray-600 bg-gray-800'}`}>
                   <div className="text-center">
                       <div className="font-black text-white text-xl">SUPER</div>
                       <div className="text-xs text-white">{hudState.superCharge >= SUPER_CHARGE_MAX ? 'SPACE' : `${Math.floor(hudState.superCharge)}%`}</div>
                   </div>
               </div>
           </div>
      </div>

      {/* Mobile Controls (Only show if touch detected logic, but showing always for hybrid support) */}
      <div className="absolute bottom-10 left-10 z-10 md:opacity-20 hover:opacity-100 transition-opacity">
        <Joystick identifier="move" onMove={handleMoveJoy} color="cyan" />
      </div>
      <div className="absolute bottom-10 right-10 z-10 md:opacity-20 hover:opacity-100 transition-opacity">
         <Joystick identifier="shoot" onMove={handleAttackJoy} color="red" />
      </div>
      
      <button onClick={onBack} className="absolute top-4 right-4 bg-red-900/80 text-white text-xs px-4 py-2 rounded border border-red-500 hover:bg-red-700 z-20 pointer-events-auto font-bold">
        EXIT
      </button>
      
      <div className="absolute top-20 left-4 text-xs text-white/30 pointer-events-none hidden md:block">
          WASD to Move<br/>MOUSE to Aim/Shoot<br/>SPACE for Super
      </div>
    </div>
  );
};