import { CharacterStats } from './types';

// World Settings
export const TILE_SIZE = 50;
export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 1500; // Slightly smaller height for better aspect
export const FPS = 60;

// Gameplay Settings
export const MAX_AMMO = 3;
export const RELOAD_SPEED_BASE = 60; // Frames per ammo tick (approx 1s)
export const GEM_SPAWN_RATE = 300; // Frames (5s)
export const RESPAWN_TIME = 180; // Frames (3s)
export const WIN_GEM_COUNT = 10;
export const WIN_GOAL_COUNT = 3;
export const SUPER_CHARGE_MAX = 100;

// Ball Settings
export const BALL_FRICTION = 0.96;
export const BALL_THROW_SPEED = 22;
export const BALL_PICKUP_COOLDOWN = 30;

// Characters
export const CHARACTERS: CharacterStats[] = [
  {
    id: 'neon-ninja',
    name: 'Cyber Ken',
    role: 'Skirmisher',
    hp: 3600,
    maxHp: 3600,
    speed: 7.0,
    damage: 900,
    reloadTime: 40,
    range: 350,
    projectileSpeed: 18,
    projectileSize: 20,
    projectileCount: 1,
    spread: 0,
    color: '#00f3ff',
    description: 'Agile fighter. Super: Dashes forward, slashing enemies.',
    superChargeRate: 25,
    superType: 'DASH'
  },
  {
    id: 'tank-top',
    name: 'Chrome Dome',
    role: 'Tank',
    hp: 6000,
    maxHp: 6000,
    speed: 5.0,
    damage: 350,
    reloadTime: 55,
    range: 350,
    projectileSpeed: 14,
    projectileSize: 12,
    projectileCount: 5,
    spread: 0.4, // Shotgun spread
    color: '#ff00ff',
    description: 'Heavy shotgunner. Super: Ground Slam stuns enemies.',
    superChargeRate: 15,
    superType: 'SLAM'
  },
  {
    id: 'viper',
    name: 'Viper',
    role: 'Sniper',
    hp: 2600,
    maxHp: 2600,
    speed: 5.5,
    damage: 1800,
    reloadTime: 90,
    range: 1000,
    projectileSpeed: 32,
    projectileSize: 15,
    projectileCount: 1,
    spread: 0,
    color: '#fcee0a',
    description: 'Sniper. Super: Fires a massive explosive rocket.',
    superChargeRate: 35,
    superType: 'GRENADE'
  },
  {
    id: 'glitch',
    name: 'Glitch',
    role: 'Support',
    hp: 3600,
    maxHp: 3600,
    speed: 6.0,
    damage: 700,
    reloadTime: 30,
    range: 550,
    projectileSpeed: 14,
    projectileSize: 25,
    projectileCount: 1,
    spread: 0.1,
    color: '#00ff99',
    description: 'Erratic attacks. Super: Teleports a short distance.',
    superChargeRate: 25,
    superType: 'TELEPORT'
  },
  {
    id: 'inferno',
    name: 'Inferno',
    role: 'Skirmisher',
    hp: 4200,
    maxHp: 4200,
    speed: 6.0,
    damage: 250,
    reloadTime: 6, // Continuous fire feel
    range: 280,
    projectileSpeed: 12,
    projectileSize: 28,
    projectileCount: 1,
    spread: 0.25,
    color: '#ff4500',
    description: 'Flamethrower. Super: Rapid Fire burst.',
    superChargeRate: 5,
    superType: 'RAPID_FIRE'
  },
  {
    id: 'doc-drone',
    name: 'Doc Drone',
    role: 'Support',
    hp: 3200,
    maxHp: 3200,
    speed: 5.8,
    damage: 550,
    reloadTime: 45,
    range: 650,
    projectileSpeed: 16,
    projectileSize: 15,
    projectileCount: 1,
    spread: 0,
    color: '#ffffff',
    description: 'Healer. Super: Creates a healing area.',
    superChargeRate: 20,
    superType: 'HEAL_AREA'
  },
  {
    id: 'knuckles',
    name: 'Knuckles',
    role: 'Tank',
    hp: 6500,
    maxHp: 6500,
    speed: 6.2, 
    damage: 1400,
    reloadTime: 35,
    range: 120, 
    projectileSpeed: 0, 
    projectileSize: 60,
    projectileCount: 1,
    spread: 0,
    color: '#8b0000',
    description: 'Melee brawler. Super: Dash punch.',
    superChargeRate: 25,
    superType: 'DASH'
  },
  {
    id: 'ghost',
    name: 'Ghost',
    role: 'Assassin',
    hp: 3000,
    maxHp: 3000,
    speed: 7.5,
    damage: 1100,
    reloadTime: 40,
    range: 200,
    projectileSpeed: 20,
    projectileSize: 10,
    projectileCount: 1,
    spread: 0,
    color: '#4b0082',
    description: 'Assassin. Super: Becomes invisible briefly.',
    superChargeRate: 30,
    superType: 'STEALTH'
  },
  {
    id: 'boombox',
    name: 'Boombox',
    role: 'Skirmisher',
    hp: 4000,
    maxHp: 4000,
    speed: 5.5,
    damage: 950,
    reloadTime: 60,
    range: 650,
    projectileSpeed: 14,
    projectileSize: 18,
    projectileCount: 2, // Throws 2 bombs
    spread: 0.2,
    color: '#ff69b4',
    description: 'Sonic attacks. Super: Giant Shockwave slam.',
    superChargeRate: 20,
    superType: 'SLAM'
  },
  {
    id: 'architect',
    name: 'Architect',
    role: 'Support',
    hp: 3500,
    maxHp: 3500,
    speed: 5.2,
    damage: 450,
    reloadTime: 25,
    range: 750,
    projectileSpeed: 22,
    projectileSize: 12,
    projectileCount: 1,
    spread: 0,
    color: '#daa520',
    description: 'Builder. Super: Creates a temporary wall.',
    superChargeRate: 20,
    superType: 'WALL'
  },
];