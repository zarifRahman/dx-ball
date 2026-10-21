// lib/game/constants.ts

// Canvas dimensions
export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 640;

// Paddle properties
export const PADDLE_WIDTH = 80;
export const PADDLE_HEIGHT = 12;
export const PADDLE_Y = CANVAS_HEIGHT - 48;
export const PADDLE_SPEED = 60;

// Ball properties
export const BALL_RADIUS = 8;
export const INITIAL_BALL_SPEED = 8;
export const MAX_BALL_SPEED = 22;

// Brick properties
export const BRICK_COLS = 10;
export const BRICK_ROWS = 6;
export const BRICK_WIDTH = 42;
export const BRICK_HEIGHT = 18;
export const BRICK_PADDING = 3;
export const BRICK_OFFSET_X =
  (CANVAS_WIDTH -
    (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) /
  2;
export const BRICK_OFFSET_Y = 48;

// Brick colour tiers (rows) and hit points
export const BRICK_TIERS = [
  { fill: "#ff2d55", stroke: "#ff6b8a", hits: 3 },
  { fill: "#ff9500", stroke: "#ffbe55", hits: 2 },
  { fill: "#ffd60a", stroke: "#ffe566", hits: 2 },
  { fill: "#30d158", stroke: "#7deba0", hits: 1 },
  { fill: "#0a84ff", stroke: "#5db3ff", hits: 1 },
  { fill: "#bf5af2", stroke: "#d98bff", hits: 1 },
];

// Game states
export const GAME_PHASES = {
  WAITING: "waiting",
  PLAYING: "playing",
  PAUSED: "paused",
  WON: "won",
  LOST: "lost",
} as const;

export type GamePhase = (typeof GAME_PHASES)[keyof typeof GAME_PHASES];

// Particle properties
export const PARTICLE_BASE_SPEED = 1.5;
export const PARTICLE_MAX_SPEED = 2.5;
export const PARTICLE_DECAY_RATE = 0.04;
export const PARTICLE_DECAY_RANDOM = 0.03;
export const PARTICLE_COUNT = 8;
export const PARTICLE_SIZE_MIN = 2;
export const PARTICLE_SIZE_MAX = 2;
export const PARTICLE_GRAVITY = 0.08;

// Scoring
export const SCORE_PER_HIT_ALIVE = 5;
export const SCORE_PER_BRICK_DESTROYED = 10;

// Combo system
export const COMBO_WINDOW_MS = 500;  // ms between hits to chain combo
export const COMBO_MAX = 4;

// Powerup properties
export const POWERUP_WIDTH = 26;
export const POWERUP_HEIGHT = 14;
export const POWERUP_FALL_SPEED = 2;
export const POWERUP_BASE_CHANCE = 0.20; // 20% chance per destroyed brick

// Powerup durations (in frames at ~60fps)
export const POWERUP_WIDEN_FRAMES = 900;    // 15 seconds
export const POWERUP_SLOW_FRAMES = 600;     // 10 seconds
export const POWERUP_STICKY_FRAMES = 900;   // 15 seconds
export const POWERUP_FIREBALL_FRAMES = 540; // 9 seconds — ponytail: authentic DX-Ball fireball is brief; tune if too strong

// Widen paddle multiplier
export const POWERUP_WIDEN_MULTIPLIER = 1.5;

// Slow ball multiplier
export const POWERUP_SLOW_MULTIPLIER = 0.5;

// Laser properties
export const LASER_WIDTH = 3;
export const LASER_HEIGHT = 12;
export const LASER_SPEED = 10;

// Level transition overlay duration (frames)
export const LEVEL_TRANSITION_FRAMES = 90;

// Ball speed scaling per level (+3.5% per level)
export const BALL_SPEED_PER_LEVEL = 0.035;

// Screen shake
export const SHAKE_FRAMES = 6;        // frames shake lasts on brick destroy
export const SHAKE_MAGNITUDE = 3;     // max pixel offset
