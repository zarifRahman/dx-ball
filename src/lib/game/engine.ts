// lib/game/engine.ts
import {
  BALL_RADIUS,
  BRICK_TIERS,
  INITIAL_BALL_SPEED,
  MAX_BALL_SPEED,
  PADDLE_HEIGHT,
  PADDLE_SPEED,
  PADDLE_WIDTH,
  PARTICLE_BASE_SPEED,
  PARTICLE_COUNT,
  PARTICLE_DECAY_RANDOM,
  PARTICLE_DECAY_RATE,
  PARTICLE_GRAVITY,
  PARTICLE_MAX_SPEED,
  PARTICLE_SIZE_MAX,
  PARTICLE_SIZE_MIN,
  SCORE_PER_BRICK_DESTROYED,
  SCORE_PER_HIT_ALIVE,
  BRICK_WIDTH,
  BRICK_HEIGHT,
  BRICK_PADDING,
  BRICK_OFFSET_Y,
  COMBO_WINDOW_MS,
  COMBO_MAX,
  POWERUP_WIDTH,
  POWERUP_HEIGHT,
  POWERUP_FALL_SPEED,
  POWERUP_BASE_CHANCE,
  POWERUP_WIDEN_FRAMES,
  POWERUP_SLOW_FRAMES,
  POWERUP_STICKY_FRAMES,
  POWERUP_WIDEN_MULTIPLIER,
  POWERUP_SLOW_MULTIPLIER,
  LASER_WIDTH,
  LASER_HEIGHT,
  LASER_SPEED,
  LEVEL_TRANSITION_FRAMES,
  BALL_SPEED_PER_LEVEL,
  SHAKE_FRAMES,
} from "./constants";
import {
  ActivePowerup,
  Ball,
  Brick,
  GameState,
  Laser,
  Paddle,
  Particle,
  Powerup,
  PowerupType,
  ScorePopup,
} from "./types";
import { LEVELS, TOTAL_LEVELS } from "./levels";

// --- Powerup type colours & labels ---

export const POWERUP_META: Record<
  PowerupType,
  { color: string; label: string }
> = {
  widen:     { color: "#30d158", label: "W" },
  multiball: { color: "#5ac8fa", label: "M" },
  sticky:    { color: "#ffd60a", label: "S" },
  laser:     { color: "#ff3b30", label: "L" },
  slow:      { color: "#0a84ff", label: "B" },
  extralife: { color: "#ff2d55", label: "+" },
};

// --- Brick layout builder ---

function buildBricks(width: number, level: number): Brick[] {
  const bricks: Brick[] = [];
  const grid = LEVELS[(level - 1) % TOTAL_LEVELS];
  const cols = grid[0].length;
  const totalBricksWidth = cols * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING;
  const offsetX = (width - totalBricksWidth) / 2;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const tierIndex = grid[row][col];
      if (tierIndex === 0) continue; // empty cell
      const tier = BRICK_TIERS[Math.min(tierIndex - 1, BRICK_TIERS.length - 1)];
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

// --- Base speed for a given level ---

function levelBaseSpeed(level: number, speedMultiplier = 1): number {
  return (
    INITIAL_BALL_SPEED * (1 + BALL_SPEED_PER_LEVEL * (level - 1)) * speedMultiplier
  );
}

// --- Powerup drop chance for a given level ---

function powerupDropChance(level: number): number {
  // 20% at level 1, -2.5% per level, floor at 5%
  return Math.max(0.05, POWERUP_BASE_CHANCE - (level - 1) * 0.025);
}

// --- Spawn a fresh ball above the paddle for a given level ---

function freshBall(
  x: number,
  paddleY: number,
  speed: number,
  stuck: boolean,
): Ball {
  return {
    x,
    y: paddleY - BALL_RADIUS - 2,
    vx: 2.5,
    vy: -speed,
    r: BALL_RADIUS,
    stuck,
  };
}

// --- Build the full initial state ---

export function buildInitialState(
  width: number,
  height: number,
  level = 1,
  speedMultiplier = 1,
): GameState {
  const paddleY = height - 48;
  const speed = levelBaseSpeed(level, speedMultiplier);
  return {
    paddle: {
      x: width / 2 - PADDLE_WIDTH / 2,
      y: paddleY,
      w: PADDLE_WIDTH,
      h: PADDLE_HEIGHT,
    },
    balls: [freshBall(width / 2, paddleY, speed, false)],
    bricks: buildBricks(width, level),
    score: 0,
    lives: 3,
    phase: "waiting",
    particles: [],
    popups: [],
    powerups: [],
    lasers: [],
    activePowerups: [],
    level,
    levelTransitionFrames: 0,
    lastHitTime: 0,
    comboCount: 1,
    baseSpeed: speed,
    speedMultiplier,
    stickyActive: false,
    shake: 0,
  };
}

// --- Build next-level state (carry over score & lives) ---

function buildNextLevelState(
  prev: GameState,
  width: number,
  height: number,
): GameState {
  const nextLevel = prev.level + 1;
  const paddleY = height - 48;
  const speed = levelBaseSpeed(nextLevel, prev.speedMultiplier);
  return {
    paddle: {
      x: width / 2 - PADDLE_WIDTH / 2,
      y: paddleY,
      w: PADDLE_WIDTH,
      h: PADDLE_HEIGHT,
    },
    balls: [freshBall(width / 2, paddleY, speed, false)],
    bricks: buildBricks(width, nextLevel),
    score: prev.score,
    lives: prev.lives,
    phase: "levelTransition",
    particles: [],
    popups: [],
    powerups: [],
    lasers: [],
    activePowerups: [],
    level: nextLevel,
    levelTransitionFrames: LEVEL_TRANSITION_FRAMES,
    lastHitTime: 0,
    comboCount: 1,
    baseSpeed: speed,
    speedMultiplier: prev.speedMultiplier,
    stickyActive: false,
    shake: 0,
  };
}

// --- Helper: AABB overlap check ---

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// --- Helper: circle vs rect closest-point collision ---

interface CircleRectHit {
  hit: boolean;
  dx: number;
  dy: number;
}

function circleVsRect(
  cx: number, cy: number, cr: number,
  rx: number, ry: number, rw: number, rh: number,
): CircleRectHit {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return { hit: dx * dx + dy * dy <= cr * cr, dx, dy };
}

// --- Helper: spawn particles from a brick ---

function spawnBrickParticles(
  out: Particle[],
  b: Brick,
): void {
  for (let p = 0; p < PARTICLE_COUNT; p++) {
    const angle =
      (Math.PI * 2 * p) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.5;
    const spd =
      PARTICLE_BASE_SPEED +
      Math.random() * (PARTICLE_MAX_SPEED - PARTICLE_BASE_SPEED);
    out.push({
      x: b.x + b.w / 2,
      y: b.y + b.h / 2,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life: 1,
      decay: PARTICLE_DECAY_RATE + Math.random() * PARTICLE_DECAY_RANDOM,
      color: b.fill,
      r:
        PARTICLE_SIZE_MIN +
        Math.random() * (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN),
    });
  }
}

// --- Helper: maybe drop a powerup from destroyed brick ---

const POWERUP_TYPES: PowerupType[] = [
  "widen",
  "multiball",
  "sticky",
  "laser",
  "slow",
  "extralife",
];

function maybeDrop(b: Brick, level: number): Powerup | null {
  if (Math.random() > powerupDropChance(level)) return null;
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return {
    x: b.x + b.w / 2 - POWERUP_WIDTH / 2,
    y: b.y + b.h / 2,
    w: POWERUP_WIDTH,
    h: POWERUP_HEIGHT,
    vy: POWERUP_FALL_SPEED,
    type,
    active: true,
  };
}

// --- Apply powerup effect to state ---

function applyPowerup(
  state: GameState,
  type: PowerupType,
  width: number,
  height: number,
): Partial<GameState> {
  const paddleY = height - 48;
  const activePowerups = [...state.activePowerups];

  switch (type) {
    case "extralife":
      return { lives: state.lives + 1 };

    case "widen": {
      // Remove existing widen if any, then add fresh
      const filtered = activePowerups.filter((a) => a.type !== "widen");
      filtered.push({ type: "widen", framesLeft: POWERUP_WIDEN_FRAMES });
      const newW = PADDLE_WIDTH * POWERUP_WIDEN_MULTIPLIER;
      return {
        activePowerups: filtered,
        paddle: { ...state.paddle, w: newW },
      };
    }

    case "slow": {
      // Remove existing slow, add fresh
      const filtered = activePowerups.filter((a) => a.type !== "slow");
      filtered.push({ type: "slow", framesLeft: POWERUP_SLOW_FRAMES });
      const slowedBalls = state.balls.map((b) => ({
        ...b,
        vx: b.vx * POWERUP_SLOW_MULTIPLIER,
        vy: b.vy * POWERUP_SLOW_MULTIPLIER,
      }));
      return { activePowerups: filtered, balls: slowedBalls };
    }

    case "sticky": {
      const filtered = activePowerups.filter((a) => a.type !== "sticky");
      filtered.push({ type: "sticky", framesLeft: POWERUP_STICKY_FRAMES });
      return { activePowerups: filtered, stickyActive: true };
    }

    case "laser": {
      // If laser already active, refresh timer
      const filtered = activePowerups.filter((a) => a.type !== "laser");
      filtered.push({ type: "laser", framesLeft: POWERUP_STICKY_FRAMES });
      return { activePowerups: filtered };
    }

    case "multiball": {
      // Split every existing ball into 3 by spawning 2 extra at ±25° offsets
      const newBalls: Ball[] = [...state.balls];
      const extraBalls: Ball[] = [];
      for (const ball of state.balls) {
        const speed = Math.hypot(ball.vx, ball.vy);
        const baseAngle = Math.atan2(ball.vy, ball.vx);
        for (const offset of [-Math.PI / 8, Math.PI / 8]) {
          const a = baseAngle + offset;
          extraBalls.push({
            x: ball.x,
            y: ball.y,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed,
            r: BALL_RADIUS,
            stuck: false,
          });
        }
      }
      return { balls: [...newBalls, ...extraBalls] };
    }
  }
}

// --- Expire active powerups, reverting their effects ---

function tickActivePowerups(
  state: GameState,
): Partial<GameState> {
  const updated: ActivePowerup[] = [];
  const patch: Partial<GameState> = {};

  for (const ap of state.activePowerups) {
    const remaining = ap.framesLeft - 1;
    if (remaining > 0) {
      updated.push({ ...ap, framesLeft: remaining });
    } else {
      // Powerup expired — revert
      switch (ap.type) {
        case "widen":
          patch.paddle = { ...((patch.paddle ?? state.paddle) as Paddle), w: PADDLE_WIDTH };
          break;
        case "slow": {
          // Restore ball speed to base
          const balls = (patch.balls ?? state.balls) as Ball[];
          patch.balls = balls.map((b) => {
            const currentSpeed = Math.hypot(b.vx, b.vy);
            if (currentSpeed < 0.01) return b;
            const targetSpeed = state.baseSpeed;
            const scale = targetSpeed / currentSpeed;
            return { ...b, vx: b.vx * scale, vy: b.vy * scale };
          });
          break;
        }
        case "sticky":
          patch.stickyActive = false;
          // Unstick any stuck balls
          patch.balls = ((patch.balls ?? state.balls) as Ball[]).map((b) =>
            b.stuck ? { ...b, stuck: false, vy: -state.baseSpeed } : b,
          );
          break;
        case "laser":
          // No object to revert, timer just expires
          break;
      }
    }
  }

  return { ...patch, activePowerups: updated };
}

// --- Check if laser powerup is currently active ---

function isLaserActive(state: GameState): boolean {
  return state.activePowerups.some((a) => a.type === "laser" && a.framesLeft > 0);
}

// --- Main game update ---

export interface ActionFlags {
  launchBall?: boolean;
  fireLaser?: boolean;
  /**
   * Desired paddle CENTRE x in canvas coords from the active pointer
   * (touch/mouse), or null when no pointer is driving the paddle. When set,
   * the engine eases the paddle toward this target; when null, keyboard
   * movement applies. This is the single writer for paddle.x.
   */
  pointerTargetX?: number | null;
}

// One simulation step covers a 60fps frame (FIXED_STEP ms). dt is the step
// duration in ms; dtScale normalises per-frame constants so behaviour is
// identical at the fixed step regardless of display refresh rate.
const FIXED_STEP_MS = 1000 / 60;

// Pointer easing: paddle.x += (target - paddle.x) * factor. Tuned to glide
// without lag at 60fps; scaled by dtScale so it stays consistent under the
// fixed timestep.
const POINTER_EASE_FACTOR = 0.35;

export function updateGame(
  state: GameState,
  keys: Record<string, boolean>,
  width: number,
  height: number,
  actionFlags: ActionFlags = {},
  dt: number = FIXED_STEP_MS,
): GameState {
  // --- Level transition countdown ---
  if (state.phase === "levelTransition") {
    const framesLeft = state.levelTransitionFrames - 1;
    if (framesLeft <= 0) {
      return { ...state, phase: "waiting", levelTransitionFrames: 0, shake: 0 };
    }
    return { ...state, levelTransitionFrames: framesLeft };
  }

  if (state.phase !== "playing") return state;

  let { paddle, balls, bricks, score, lives, particles, popups, powerups, lasers, level, baseSpeed, comboCount, lastHitTime, stickyActive } = state;
  const { shake } = state;

  // Decay shake
  const decayedShake = shake > 0 ? shake - 1 : 0;
  let newShake = decayedShake;

  // --- Powerup timers ---
  const expiryPatch = tickActivePowerups(state);
  let activePowerups = expiryPatch.activePowerups!;
  // Apply any reverts from expiry (paddle width, ball speed, sticky)
  paddle = (expiryPatch.paddle as Paddle | undefined) ?? paddle;
  balls = (expiryPatch.balls as Ball[] | undefined) ?? balls;
  stickyActive = expiryPatch.stickyActive !== undefined ? expiryPatch.stickyActive : stickyActive;

  // --- Paddle movement (single writer) ---
  // dtScale === 1 at the fixed 60fps step; keeps per-frame constants intact.
  const dtScale = dt / FIXED_STEP_MS;
  const maxPaddleX = width - paddle.w;
  let px = paddle.x;
  if (actionFlags.pointerTargetX != null) {
    // Pointer (touch/mouse) drives the paddle: ease toward target centre so it
    // glides rather than teleports. Clamped to playfield.
    const targetX = actionFlags.pointerTargetX - paddle.w / 2;
    px += (targetX - px) * Math.min(1, POINTER_EASE_FACTOR * dtScale);
  } else {
    // Fall back to keyboard movement when no pointer is active.
    if (keys["ArrowLeft"]) px -= PADDLE_SPEED * dtScale;
    if (keys["ArrowRight"]) px += PADDLE_SPEED * dtScale;
  }
  px = Math.max(0, Math.min(maxPaddleX, px));
  paddle = { ...paddle, x: px };

  // --- Lasers: fire on actionFlag ---
  const newLasers: Laser[] = [...lasers];
  if (actionFlags.fireLaser && isLaserActive(state)) {
    // Spawn two lasers from paddle edges
    const laserY = paddle.y - LASER_HEIGHT;
    newLasers.push(
      { x: paddle.x + 4, y: laserY, w: LASER_WIDTH, h: LASER_HEIGHT, vy: -LASER_SPEED },
      { x: paddle.x + paddle.w - 4 - LASER_WIDTH, y: laserY, w: LASER_WIDTH, h: LASER_HEIGHT, vy: -LASER_SPEED },
    );
  }

  // --- Move lasers ---
  const movedLasers = newLasers
    .map((l) => ({ ...l, y: l.y + l.vy }))
    .filter((l) => l.y + l.h > 0);

  // --- Laser vs brick collisions ---
  let laserBricks = bricks;
  const newParticles: Particle[] = [...particles];
  const newPopups: ScorePopup[] = [...popups];
  let newScore = score;
  const newPowerups: Powerup[] = [...powerups];
  const survivingLasers: Laser[] = [];

  for (const laser of movedLasers) {
    let laserHit = false;
    for (let i = 0; i < laserBricks.length; i++) {
      const b = laserBricks[i];
      if (!b.alive) continue;
      if (rectsOverlap(laser.x, laser.y, laser.w, laser.h, b.x, b.y, b.w, b.h)) {
        const newHits = b.hits - 1;
        const stillAlive = newHits > 0;
        if (laserBricks === bricks) laserBricks = [...bricks];
        laserBricks[i] = stillAlive ? { ...b, hits: newHits } : { ...b, alive: false };
        const pts = stillAlive ? SCORE_PER_HIT_ALIVE : SCORE_PER_BRICK_DESTROYED;
        newScore += pts;
        newPopups.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, text: `+${pts}`, life: 1.0, vy: -1.5 });
        spawnBrickParticles(newParticles, b);
        if (!stillAlive) {
          const drop = maybeDrop(b, level);
          if (drop) newPowerups.push(drop);
        }
        laserHit = true;
        break;
      }
    }
    if (!laserHit) survivingLasers.push(laser);
  }

  // --- Move each ball, handle collisions ---
  const survivingBalls: Ball[] = [];
  let ballsLost = 0;
  let nowTime = Date.now();
  let newComboCount = comboCount;
  let newLastHitTime = lastHitTime;

  // Use the (possibly laser-hit) bricks as starting point for ball collisions
  let workingBricks = laserBricks;

  for (const ballIn of balls) {
    if (ballIn.stuck) {
      // Sticky ball — rides on paddle, waits for launch
      const stuckBall: Ball = {
        ...ballIn,
        x: paddle.x + paddle.w / 2,
        y: paddle.y - BALL_RADIUS - 2,
      };

      if (actionFlags.launchBall) {
        // Launch it upward
        survivingBalls.push({
          ...stuckBall,
          stuck: false,
          vx: 2.5,
          vy: -baseSpeed,
        });
      } else {
        survivingBalls.push(stuckBall);
      }
      continue;
    }

    let { x, y, vx, vy, r } = ballIn;
    x += vx;
    y += vy;

    // Wall bounces
    if (x - r < 0) { x = r; vx = Math.abs(vx); }
    if (x + r > width) { x = width - r; vx = -Math.abs(vx); }
    if (y - r < 0) { y = r; vy = Math.abs(vy); }

    // Ball lost
    if (y - r > height + 20) {
      ballsLost++;
      continue;
    }

    // Paddle collision
    if (
      vy > 0 &&
      x > paddle.x - r &&
      x < paddle.x + paddle.w + r &&
      y + r >= paddle.y &&
      y - r < paddle.y + paddle.h
    ) {
      y = paddle.y - r;

      if (stickyActive) {
        // Stick the ball
        survivingBalls.push({ x, y, vx: 0, vy: 0, r, stuck: true });
        continue;
      }

      const hitRatio = (x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      vx = hitRatio * baseSpeed * 1.2;
      vy = -Math.sqrt(Math.max(baseSpeed * baseSpeed - vx * vx, 4));

      const currentSpeed = Math.hypot(vx, vy);
      if (currentSpeed > MAX_BALL_SPEED) {
        vx *= MAX_BALL_SPEED / currentSpeed;
        vy *= MAX_BALL_SPEED / currentSpeed;
      }
    }

    // Brick collisions
    for (let i = 0; i < workingBricks.length; i++) {
      const b = workingBricks[i];
      if (!b.alive) continue;

      const { hit, dx, dy } = circleVsRect(x, y, r, b.x, b.y, b.w, b.h);
      if (!hit) continue;

      const newHits = b.hits - 1;
      const stillAlive = newHits > 0;

      spawnBrickParticles(newParticles, b);

      if (workingBricks === bricks || workingBricks === laserBricks) {
        workingBricks = [...workingBricks];
      }
      workingBricks[i] = stillAlive ? { ...b, hits: newHits } : { ...b, alive: false };

      // Combo calculation
      const timeSinceLastHit = nowTime - newLastHitTime;
      if (timeSinceLastHit <= COMBO_WINDOW_MS && newLastHitTime > 0) {
        newComboCount = Math.min(newComboCount + 1, COMBO_MAX);
      } else {
        newComboCount = 1;
      }
      newLastHitTime = nowTime;

      const basePoints = stillAlive ? SCORE_PER_HIT_ALIVE : SCORE_PER_BRICK_DESTROYED;
      const earnedPoints = basePoints * newComboCount;
      newScore += earnedPoints;

      const popupText =
        newComboCount > 1
          ? `+${earnedPoints} x${newComboCount}`
          : `+${earnedPoints}`;
      newPopups.push({
        x: b.x + b.w / 2,
        y: b.y + b.h / 2,
        text: popupText,
        life: 1.0,
        vy: -1.5,
      });

      if (!stillAlive) {
        const drop = maybeDrop(b, level);
        if (drop) newPowerups.push(drop);
        // Trigger screen shake on brick destruction
        newShake = SHAKE_FRAMES;
      }

      // Resolve bounce direction
      const overlapX = Math.abs(dx);
      const overlapY = Math.abs(dy);
      if (overlapX > overlapY) {
        vx = -vx;
      } else {
        vy = -vy;
      }
      break;
    }

    survivingBalls.push({ ...ballIn, x, y, vx, vy });
  }

  // --- Handle all balls lost ---
  const allBallsLost = survivingBalls.length === 0;
  if (allBallsLost) {
    const newLives = lives - 1;
    if (newLives <= 0) {
      return { ...state, lives: 0, phase: "lost", shake: 0 };
    }
    const paddleY = height - 48;
    return {
      ...state,
      lives: newLives,
      phase: "waiting",
      balls: [freshBall(width / 2, paddleY, baseSpeed, false)],
      paddle: { ...paddle, x: width / 2 - paddle.w / 2, y: paddleY },
      powerups: [],
      lasers: [],
      activePowerups: activePowerups.filter(
        (a) => a.type !== "sticky" && a.type !== "laser",
      ),
      stickyActive: false,
      shake: 0,
    };
  }

  // --- Move falling powerups & check paddle catches ---
  const survivingPowerups: Powerup[] = [];
  let stateAfterPowerup: Partial<GameState> = {};
  let currentPaddle = paddle;
  let currentBalls = survivingBalls;
  let currentActivePowerups = activePowerups;
  let currentStickyActive = stickyActive;
  let currentLives = lives;

  for (const pu of newPowerups) {
    if (!pu.active) continue;
    const moved = { ...pu, y: pu.y + pu.vy };

    // Fell off screen
    if (moved.y > height + POWERUP_HEIGHT) continue;

    // Paddle catch
    if (
      rectsOverlap(
        moved.x, moved.y, moved.w, moved.h,
        currentPaddle.x, currentPaddle.y, currentPaddle.w, currentPaddle.h,
      )
    ) {
      const effect = applyPowerup(
        {
          ...state,
          paddle: currentPaddle,
          balls: currentBalls,
          activePowerups: currentActivePowerups,
          stickyActive: currentStickyActive,
          lives: currentLives,
          baseSpeed,
        },
        pu.type,
        width,
        height,
      );
      if (effect.paddle) currentPaddle = effect.paddle as Paddle;
      if (effect.balls) currentBalls = effect.balls as Ball[];
      if (effect.activePowerups) currentActivePowerups = effect.activePowerups as ActivePowerup[];
      if (effect.stickyActive !== undefined) currentStickyActive = effect.stickyActive;
      if (effect.lives !== undefined) currentLives = effect.lives;
      stateAfterPowerup = { ...stateAfterPowerup, ...effect };
      continue; // don't keep this powerup
    }

    survivingPowerups.push(moved);
  }

  // --- Combo reset after window expires ---
  const timeSinceLast = nowTime - newLastHitTime;
  if (timeSinceLast > COMBO_WINDOW_MS && newLastHitTime > 0) {
    newComboCount = 1;
  }

  // --- Update particles ---
  const updatedParticles = newParticles
    .map((p) => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy + PARTICLE_GRAVITY,
      life: p.life - p.decay,
    }))
    .filter((p) => p.life > 0);

  // --- Update score popups ---
  const updatedPopups = newPopups
    .map((popup) => ({
      ...popup,
      y: popup.y + popup.vy,
      life: popup.life - 0.03,
    }))
    .filter((popup) => popup.life > 0);

  // --- Check win condition ---
  const activeBrickCount = workingBricks.filter((b) => b.alive).length;
  let phase: GameState["phase"] = activeBrickCount === 0 ? "won" : "playing";

  // If won and there are more levels, advance instead
  let finalLevel = level;
  let finalBricks = workingBricks;
  let finalBalls = currentBalls;
  let finalPaddle = currentPaddle;
  let finalActivePowerups = currentActivePowerups;
  let finalStickyActive = currentStickyActive;
  let finalLives = currentLives;
  let finalLaserActive = survivingLasers;
  let finalScore = newScore;
  let finalTransitionFrames = state.levelTransitionFrames;

  if (phase === "won") {
    if (level < TOTAL_LEVELS) {
      // Advance to next level
      const nextState = buildNextLevelState(
        { ...state, score: newScore, lives: currentLives },
        width,
        height,
      );
      return nextState;
    }
    // All levels complete
    return {
      ...state,
      score: newScore,
      lives: currentLives,
      phase: "won",
      particles: updatedParticles,
      popups: updatedPopups,
      bricks: workingBricks,
      balls: currentBalls,
      paddle: currentPaddle,
      powerups: survivingPowerups,
      lasers: survivingLasers,
      activePowerups: currentActivePowerups,
      comboCount: newComboCount,
      lastHitTime: newLastHitTime,
      stickyActive: currentStickyActive,
      shake: 0,
    };
  }

  return {
    ...state,
    paddle: finalPaddle,
    balls: finalBalls,
    bricks: finalBricks,
    score: finalScore,
    lives: finalLives,
    phase,
    particles: updatedParticles,
    popups: updatedPopups,
    powerups: survivingPowerups,
    lasers: finalLaserActive,
    activePowerups: finalActivePowerups,
    comboCount: newComboCount,
    lastHitTime: newLastHitTime,
    level: finalLevel,
    levelTransitionFrames: finalTransitionFrames,
    stickyActive: finalStickyActive,
    shake: newShake,
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

export function calculateNewBallVelocity(
  vx: number,
  vy: number,
  hitRatio: number,
): { vx: number; vy: number } {
  const newVx = hitRatio * INITIAL_BALL_SPEED * 1.2;
  const newVy = -Math.sqrt(
    Math.max(INITIAL_BALL_SPEED * INITIAL_BALL_SPEED - newVx * newVx, 4),
  );

  const currentSpeed = Math.hypot(newVx, newVy);
  if (currentSpeed > MAX_BALL_SPEED) {
    const scale = MAX_BALL_SPEED / currentSpeed;
    return { vx: newVx * scale, vy: newVy * scale };
  }
  return { vx: newVx, vy: newVy };
}
