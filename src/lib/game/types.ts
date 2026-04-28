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

export interface GameState {
  paddle: Paddle;
  ball: Ball;
  bricks: Brick[];
  score: number;
  lives: number;
  phase: 'waiting' | 'playing' | 'won' | 'lost';
  particles: Particle[];
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
