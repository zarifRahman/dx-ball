// lib/game/engine.ts
import {
  BALL_RADIUS, BRICK_COLS, BRICK_ROWS, BRICK_TIERS, CANVAS_HEIGHT, CANVAS_WIDTH, INITIAL_BALL_SPEED, MAX_BALL_SPEED, PADDLE_HEIGHT, PADDLE_SPEED, PADDLE_WIDTH, PADDLE_Y, PARTICLE_BASE_SPEED, PARTICLE_COUNT, PARTICLE_DECAY_RANDOM, PARTICLE_DECAY_RATE, PARTICLE_GRAVITY, PARTICLE_MAX_SPEED, PARTICLE_SIZE_MAX, PARTICLE_SIZE_MIN, SCORE_PER_BRICK_DESTROYED, SCORE_PER_HIT_ALIVE,
  BRICK_WIDTH, BRICK_HEIGHT, BRICK_PADDING, BRICK_OFFSET_X, BRICK_OFFSET_Y,
} from './constants';
import { Ball, Brick, GamePhase, GameState, Paddle, Particle } from './types';

// --- Initial State Builders ---

function buildBricks(width: number): Brick[] {
  const bricks: Brick[] = [];
  const totalBricksWidth = BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING;
  const offsetX = (width - totalBricksWidth) / 2;
  
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const tier = BRICK_TIERS[row];
      bricks.push({
        x: offsetX + col * (BRICK_WIDTH + BRICK_PADDING),
        y: BRICK_OFFSET_Y + row * (BRICK_HEIGHT + BRICK_PADDING),
        w: BRICK_WIDTH,
        h: BRICK_HEIGHT,
        alive: true,
        hits: tier.hits,
        maxHits: tier.hits,
        fill: tier.fill,
        stroke: tier.stroke,
      });
    }
  }
  return bricks;
}

export function buildInitialState(width: number, height: number): GameState {
  const paddleY = height - 48;
  return {
    paddle: { x: width / 2 - PADDLE_WIDTH / 2, y: paddleY, w: PADDLE_WIDTH, h: PADDLE_HEIGHT },
    ball: { x: width / 2, y: paddleY - BALL_RADIUS - 2, vx: 2.5, vy: -INITIAL_BALL_SPEED, r: BALL_RADIUS },
    bricks: buildBricks(width),
    score: 0,
    lives: 3,
    phase: 'waiting',
    particles: [],
  };
}

// --- Game Logic Update ---

export function updateGame(state: GameState, keys: Record<string, boolean>, width: number, height: number): GameState {
  if (state.phase !== 'playing') return state;

  let { paddle, ball, bricks, score, lives, particles } = state;

  // --- Paddle movement ---
  let px = paddle.x;
  if (keys['ArrowLeft']) px -= PADDLE_SPEED;
  if (keys['ArrowRight']) px += PADDLE_SPEED;
  px = Math.max(0, Math.min(width - paddle.w, px));
  paddle = { ...paddle, x: px };

  // --- Ball movement ---
  let { x, y, vx, vy, r } = ball;
  x += vx;
  y += vy;

  // Wall bounces
  if (x - r < 0) { x = r; vx = Math.abs(vx); }
  if (x + r > width) { x = width - r; vx = -Math.abs(vx); }
  if (y - r < 0) { y = r; vy = Math.abs(vy); }

  // Ball lost
  if (y - r > height + 20) {
    const newLives = lives - 1;
    if (newLives <= 0) {
      return { ...state, lives: 0, phase: 'lost' };
    }
    // Reset ball and paddle, stay in waiting phase
    const paddleY = height - 48;
    return {
      ...state,
      lives: newLives,
      phase: 'waiting',
      ball: { x: width / 2, y: paddleY - BALL_RADIUS - 2, vx: 2.5, vy: -INITIAL_BALL_SPEED, r: BALL_RADIUS },
      paddle: { ...paddle, x: width / 2 - PADDLE_WIDTH / 2, y: paddleY },
    };
  }

  // Paddle collision
  if (
    vy > 0 && // Only collide if ball is moving downwards
    x > paddle.x - r && x < paddle.x + paddle.w + r &&
    y + r >= paddle.y && y - r < paddle.y + paddle.h
  ) {
    y = paddle.y - r; // Position ball just above the paddle

    // Calculate angle based on hit position
    const hitRatio = (x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    vx = hitRatio * INITIAL_BALL_SPEED * 1.2; // Adjust velocity based on hit point, slight exaggeration
    // Maintain speed, calculate new vy
    vy = -Math.sqrt(Math.max(INITIAL_BALL_SPEED * INITIAL_BALL_SPEED - vx * vx, 4));

    // Clamp speed to MAX_BALL_SPEED
    const currentSpeed = Math.hypot(vx, vy);
    if (currentSpeed > MAX_BALL_SPEED) {
      vx *= MAX_BALL_SPEED / currentSpeed;
      vy *= MAX_BALL_SPEED / currentSpeed;
    }
  }

  // Brick collisions & Particle generation
  let newBricks = bricks;
  let newScore = score;
  let newParticles = [...particles];

  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    if (!b.alive) continue;

    // Find the closest point to the brick face within the ball's radius
    const closestX = Math.max(b.x, Math.min(x, b.x + b.w));
    const closestY = Math.max(b.y, Math.min(y, b.y + b.h));

    // Calculate the distance between the ball center and this closest point
    const dx = x - closestX;
    const dy = y - closestY;
    const distanceSquared = dx * dx + dy * dy;

    // If the distance is less than the square of the ball's radius, an overlap occurs
    if (distanceSquared <= r * r) {
      // --- Collision detected ---
      const newHits = b.hits - 1;
      const stillAlive = newHits > 0;

      // Spawn particles on hit
      for (let p = 0; p < PARTICLE_COUNT; p++) {
        const angle = (Math.PI * 2 * p) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5; // Randomize angle slightly
        const spd = PARTICLE_BASE_SPEED + Math.random() * (PARTICLE_MAX_SPEED - PARTICLE_BASE_SPEED);
        newParticles.push({
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 1,
          decay: PARTICLE_DECAY_RATE + Math.random() * PARTICLE_DECAY_RANDOM,
          color: b.fill,
          r: PARTICLE_SIZE_MIN + Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN),
        });
      }

      // Update score and bricks array if modified
      if (newBricks === bricks) newBricks = [...bricks]; // Create new array only if mutation occurs
      newBricks[i] = stillAlive ? { ...b, hits: newHits } : { ...b, alive: false };
      newScore += stillAlive ? SCORE_PER_HIT_ALIVE : SCORE_PER_BRICK_DESTROYED;

      // Resolve bounce direction: determine if it was a horizontal or vertical collision
      // Check which axis has the smaller overlap distance
      const overlapX = Math.abs(dx);
      const overlapY = Math.abs(dy);

      if (overlapX < overlapY) { // Horizontal collision (hit left or right side)
        vx = -vx;
      } else { // Vertical collision (hit top or bottom side)
        vy = -vy;
      }
      break; // Only process one brick collision per frame
    }
  }

  // Update particles
  const updatedParticles = newParticles
    .map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy + PARTICLE_GRAVITY, // Apply gravity
      life: p.life - p.decay,
    }))
    .filter(p => p.life > 0);

  // Check for win condition
  const activeBricks = newBricks.filter(b => b.alive).length;
  const phase = activeBricks === 0 ? 'won' : 'playing';

  return {
    ...state,
    paddle,
    ball: { ...ball, x, y, vx, vy },
    bricks: newBricks,
    score: newScore,
    lives,
    phase,
    particles: updatedParticles,
  };
}

// --- Helper Functions ---

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getBallAngle(ball: Ball, paddle: Paddle): number {
  return Math.atan2(ball.vy, ball.vx);
}

export function getHitRatio(ballX: number, paddle: Paddle): number {
  return (ballX - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
}

export function calculateNewBallVelocity(vx: number, vy: number, hitRatio: number): { vx: number; vy: number } {
  const newVx = hitRatio * INITIAL_BALL_SPEED * 1.2;
  let newVy = -Math.sqrt(Math.max(INITIAL_BALL_SPEED * INITIAL_BALL_SPEED - newVx * newVx, 4));

  const currentSpeed = Math.hypot(newVx, newVy);
  if (currentSpeed > MAX_BALL_SPEED) {
    const scale = MAX_BALL_SPEED / currentSpeed;
    return { vx: newVx * scale, vy: newVy * scale };
  }
  return { vx: newVx, vy: newVy };
}
