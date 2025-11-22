export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export enum Team {
  BLUE = 'BLUE', // Player team
  RED = 'RED',   // Enemy team
}

export type GameMode = 'GEM_GRAB' | 'CYBER_BALL';

export type SuperType = 'DASH' | 'SHIELD' | 'GRENADE' | 'TELEPORT' | 'RAPID_FIRE' | 'HEAL_AREA' | 'SLAM' | 'STEALTH' | 'WALL';

export interface Vector2 {
  x: number;
  y: number;
}

export interface CharacterStats {
  id: string;
  name: string;
  role: 'Skirmisher' | 'Tank' | 'Sniper' | 'Support' | 'Assassin';
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  reloadTime: number; // Frames or ms
  range: number;
  projectileSpeed: number;
  projectileSize: number;
  projectileCount: number; // Shotgun spread?
  spread: number; // Angle variance
  color: string;
  description: string;
  superChargeRate: number; // Points per hit
  superType: SuperType;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface PlayerEntity extends Entity {
  characterId: string;
  team: Team;
  hp: number;
  maxHp: number;
  angle: number; // Radians
  isMoving: boolean;
  ammo: number;
  maxAmmo: number;
  reloadTimer: number;
  respawnTimer: number;
  gemCount: number;
  superCharge: number;
  killCount: number;
  isBot: boolean;
  targetId?: string | null; // For AI
  dashFrames?: number; // For Dash Super
  dashVector?: {x: number, y: number};
}

export interface Projectile extends Entity {
  ownerId: string;
  team: Team;
  vx: number;
  vy: number;
  damage: number;
  rangeRemaining: number;
  color: string;
  isSuper?: boolean;
}

export interface Gem extends Entity {
  spawnTimer: number; // 0 if active
}

export interface BallEntity extends Entity {
  vx: number;
  vy: number;
  carrierId: string | null; // Player ID carrying the ball
  cooldown: number; // Frames before it can be picked up again (after throw/drop)
}

export interface Obstacle extends Entity {
  width: number;
  height: number;
  type: 'WALL' | 'WATER' | 'BUSH' | 'GOAL_BLUE' | 'GOAL_RED';
}

export interface GameWorld {
  width: number;
  height: number;
  mode: GameMode;
  players: PlayerEntity[];
  projectiles: Projectile[];
  gems: Gem[];
  ball?: BallEntity;
  obstacles: Obstacle[];
  gemSpawnerTimer: number;
  scoreBlue: number;
  scoreRed: number;
  countDownTimer: number | null; // For end game logic
  goalResetTimer?: number; // Delay after goal
}