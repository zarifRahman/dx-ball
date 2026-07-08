// lib/game/types.ts

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Paddle extends Rect {}

export interface Ball extends Circle {
  vx: number;
  vy: number;
  stuck: boolean; // true = sitting on sticky paddle, waiting for launch
}

export interface Brick extends Rect {
  alive: boolean;
  hits: number;
  maxHits: number;
  fill: string;
  stroke: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  r: number;
}

export interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  vy: number;
}

export type PowerupType =
  | "widen"
  | "multiball"
  | "sticky"
  | "laser"
  | "slow"
  | "extralife";

export interface Powerup extends Rect {
  vy: number;
  type: PowerupType;
  active: boolean; // false = already collected
}

export interface Laser extends Rect {
  vy: number;
}

// Tracks a currently active timed powerup
export interface ActivePowerup {
  type: PowerupType;
  framesLeft: number;
}

export interface GameState {
  paddle: Paddle;
  balls: Ball[];           // always use balls[] — primary store
  bricks: Brick[];
  score: number;
  lives: number;
  phase: 'menu' | 'waiting' | 'playing' | 'paused' | 'won' | 'lost' | 'levelTransition';
  particles: Particle[];
  popups: ScorePopup[];
  powerups: Powerup[];
  lasers: Laser[];
  activePowerups: ActivePowerup[];
  level: number;                    // 1-based current level
  levelTransitionFrames: number;    // countdown for transition overlay
  lastHitTime: number;              // Date.now() of last brick hit
  comboCount: number;               // current combo multiplier (1 = no combo)
  baseSpeed: number;                // current ball base speed (scales with level + speedMultiplier)
  speedMultiplier: number;          // user-selected global speed scaler (slow/normal/fast)
  stickyActive: boolean;            // whether sticky paddle is currently active
  shake: number;                    // frames of screen shake remaining (decays to 0)
}

// High score entry stored in localStorage
export interface HighScoreEntry {
  score: number;
  date: string; // ISO date string
}

export interface GameContext {
  state: GameState;
  setState: React.Dispatch<React.SetStateAction<GameState>>;
  keys: Record<string, boolean>;
  setKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  rafRef: React.RefObject<number | null>;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
}
