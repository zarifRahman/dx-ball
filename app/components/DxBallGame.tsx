'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { buildInitialState, DIFFICULTY_CONFIG, updateGame } from '@/lib/game/engine';
import { drawFrame } from '@/lib/game/renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/game/constants';
import {
  Difficulty,
  GameSpeed,
  GameState,
  LeaderboardTable,
  LeaderboardEntry,
  RunStats,
  AchievementId,
} from '@/lib/game/types';
import {
  LEADERBOARD_KEY,
  scoreKey,
  loadLeaderboard,
  saveLeaderboard,
  bestScore,
  qualifies,
  insertScore,
} from '@/lib/game/leaderboard';
import {
  evaluate,
  loadUnlocked,
  saveUnlocked,
  achievementById,
} from '@/lib/game/achievements';
import { todayStr, dailyKey, dailyChallenge } from '@/lib/game/daily';
import {
  initAudio,
  playHitPaddle,
  playHitBrick,
  playDestroyBrick,
  playBallLost,
  playWin,
  playGameOver,
  playPowerupPickup,
  playLaserShoot,
  playLevelUp,
  setVolume,
} from '@/lib/game/audio';

// --- Settings localStorage helpers ---

const SETTINGS_KEY = 'dxball_settings';

const SPEED_MULTIPLIERS: Record<GameSpeed, number> = {
  '0.75': 0.75,
  '1': 1,
  '1.25': 1.25,
};

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function isGameSpeed(value: unknown): value is GameSpeed {
  return value === '0.75' || value === '1' || value === '1.25';
}

interface Settings {
  volume: number;       // 0..1
  haptics: boolean;
  speed: GameSpeed;
  difficulty: Difficulty;
}

const DEFAULT_SETTINGS: Settings = {
  volume: 0.7,
  haptics: true,
  speed: '1',
  difficulty: 'normal',
};

function normalizeSpeed(value: unknown): GameSpeed {
  if (isGameSpeed(value)) return value;
  if (value === 'slow') return '0.75';
  if (value === 'normal') return '1';
  if (value === 'fast') return '1.25';
  return DEFAULT_SETTINGS.speed;
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    const maybeSettings = parsed as Partial<Settings>;
    return {
      volume: typeof maybeSettings.volume === 'number'
        ? Math.min(1, Math.max(0, maybeSettings.volume))
        : DEFAULT_SETTINGS.volume,
      haptics: typeof maybeSettings.haptics === 'boolean'
        ? maybeSettings.haptics
        : DEFAULT_SETTINGS.haptics,
      speed: normalizeSpeed(maybeSettings.speed),
      difficulty: isDifficulty(maybeSettings.difficulty)
        ? maybeSettings.difficulty
        : DEFAULT_SETTINGS.difficulty,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(s: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // localStorage unavailable — ignore
  }
}

// --- Mobile haptics helper ---

function vibrate(ms: number, hapticsEnabled: boolean): void {
  if (!hapticsEnabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms);
  }
}

// --- Menu overlay screen views ---

type MenuView = 'main' | 'highscores' | 'settings';

// Render interpolation: the sim runs in fixed 60fps steps but we draw every rAF.
// On high-refresh (120Hz/ProMotion) displays that mismatch makes the paddle hold
// then jump. Lerp the drawn paddle/ball positions between the two latest sim
// states by `alpha` (fraction into the next step) for smooth motion. Returns a
// throwaway render state; the authoritative sim state is untouched. Skip when the
// phase changed (ball resets/level swaps teleport — interpolating would smear).
function interpolateForRender(
  prev: GameState | null,
  cur: GameState,
  alpha: number,
): GameState {
  if (!prev || alpha <= 0 || prev.phase !== cur.phase) return cur;
  const lerp = (a: number, b: number) => a + (b - a) * alpha;
  const paddle = { ...cur.paddle, x: lerp(prev.paddle.x, cur.paddle.x) };
  const balls =
    prev.balls.length === cur.balls.length
      ? cur.balls.map((b, i) => ({
          ...b,
          x: lerp(prev.balls[i].x, b.x),
          y: lerp(prev.balls[i].y, b.y),
        }))
      : cur.balls;
  return { ...cur, paddle, balls };
}

// End-screen summary captured at game end (stateRef isn't reactive).
interface EndInfo {
  won: boolean;
  score: number;
  best: number;
  isNewRecord: boolean;
  isDaily: boolean;
  difficulty: Difficulty;
  speed: GameSpeed;
  stats: RunStats;
}

// A qualifying score awaiting a name before it's saved to the leaderboard.
interface PendingScore {
  key: string;
  score: number;
}

// A transient achievement toast.
interface ToastItem {
  id: AchievementId;
  label: string;
  desc: string;
}

export default function DxBallGame() {
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number | null>(null);
  const prevPhaseRef = useRef<GameState['phase']>('menu');
  const prevScoreRef = useRef<number>(0);
  const prevLivesRef = useRef<number>(3);
  const prevLevelRef = useRef<number>(1);
  const prevActivePowerupCountRef = useRef<number>(0);
  // Action flags for the current frame — set by input handlers, consumed by loop
  const launchFlagRef = useRef<boolean>(false);
  const fireLaserFlagRef = useRef<boolean>(false);
  // Track whether high score was already saved for this game session
  const scoreSavedRef = useRef<boolean>(false);
  // Ref mirror of settings so the game loop can read haptics without stale closure
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  // Desired paddle CENTRE x (canvas coords) from the active pointer, or null
  // when no pointer is driving the paddle. Single source for touch/mouse input;
  // consumed by the engine each fixed step (no direct paddle mutation).
  const pointerTargetXRef = useRef<number | null>(null);
  // Sim state one fixed-step behind current, for render interpolation.
  const prevStepStateRef = useRef<GameState | null>(null);

  const [uiState, setUiState] = useState({
    score: 0,
    lives: 3,
    phase: 'menu' as GameState['phase'],
    level: 1,
    comboCount: 1,
  });
  // CSS display size of the canvas (logical resolution is fixed at CANVAS_WIDTH×HEIGHT).
  // `ready` flips true after the first client-side measure so SSR renders a 0-sized board.
  const [display, setDisplay] = useState({ width: 0, height: 0, ready: false });

  // Menu / overlay React state
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [highScores, setHighScores] = useState<LeaderboardTable>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // End-of-run result shown on the won/lost overlay (ref isn't reactive — capture here).
  const [endInfo, setEndInfo] = useState<EndInfo | null>(null);
  // Name-entry overlay for a qualifying score (null = not qualifying / already saved).
  const [pending, setPending] = useState<PendingScore | null>(null);
  const [nameInput, setNameInput] = useState('');
  // Transient achievement toasts.
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Load browser-only localStorage data after hydration so server/client text matches.
  useEffect(() => {
    const savedSettings = loadSettings();
    settingsRef.current = savedSettings;
    // Browser storage must load after hydration to keep SSR/client text identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(savedSettings);
    setHighScores(loadLeaderboard());
    setVolume(savedSettings.volume);
  }, []);

  // --- Initialization and Resize Handling ---
  // Logical resolution is FIXED (CANVAS_WIDTH×CANVAS_HEIGHT); the engine and
  // renderer always run at those dims. Resize only recomputes the CSS display
  // size — the largest 3:4 rectangle that fits the window — and the dark page
  // background fills any letterbox area.
  useEffect(() => {
    const ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT; // 0.75

    const handleResize = () => {
      let cssH = window.innerHeight;
      let cssW = cssH * ASPECT;
      if (cssW > window.innerWidth) {
        cssW = window.innerWidth;
        cssH = cssW / ASPECT;
      }
      setDisplay({ width: cssW, height: cssH, ready: true });

      // Build the initial state once; dims are constant so later resizes don't
      // rebuild. Start on the menu, not the waiting screen.
      if (!stateRef.current) {
        const { speed, difficulty } = settingsRef.current;
        const s = buildInitialState(
          CANVAS_WIDTH, CANVAS_HEIGHT, 1, SPEED_MULTIPLIERS[speed], difficulty,
        );
        stateRef.current = { ...s, phase: 'menu' };
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Achievement toast queue (auto-dismiss after 4s) ---
  const pushToast = useCallback((item: ToastItem) => {
    setToasts((prev) => [...prev, item]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== item.id));
    }, 4000);
  }, []);

  // --- Save score, celebrate, record achievements when a game ends ---
  const handleGameEnd = useCallback((score: number, won: boolean) => {
    if (scoreSavedRef.current) return;
    scoreSavedRef.current = true;

    const live = stateRef.current;
    if (!live) return;
    const { difficulty, speed } = settingsRef.current;
    const isDaily = live.isDaily;
    const stats = live.runStats;
    const key = isDaily ? dailyKey(todayStr()) : scoreKey(difficulty, speed);

    const table = loadLeaderboard();
    const isNewRecord = qualifies(table, key, score);

    setEndInfo({
      won,
      score,
      best: Math.max(score, bestScore(table, key)),
      isNewRecord,
      isDaily,
      difficulty,
      speed,
      stats,
    });

    // Qualifying score → prompt for a name before saving.
    if (isNewRecord) {
      setPending({ key, score });
      setNameInput('');
    }

    // Achievements: evaluate against freshly-loaded unlocked set, persist, toast.
    const unlocked = loadUnlocked();
    const earned = evaluate(stats, { score, clearedLevel: won, isDaily }, unlocked);
    if (earned.length > 0) {
      const next = new Set(unlocked);
      earned.forEach((id) => next.add(id));
      saveUnlocked(next);
      earned.forEach((id) => {
        const a = achievementById(id);
        if (a) pushToast({ id, label: a.label, desc: a.desc });
      });
    }
  }, [pushToast]);

  // --- Submit a name for the pending qualifying score ---
  const submitName = useCallback(() => {
    if (!pending) return;
    const table = insertScore(loadLeaderboard(), pending.key, nameInput, pending.score);
    saveLeaderboard(table);
    setHighScores(table);
    setPending(null);
    setNameInput('');
  }, [pending, nameInput]);

  // --- Settings update helpers ---
  const updateVolume = useCallback((v: number) => {
    setVolume(v);
    setSettings((prev) => {
      const next = { ...prev, volume: v };
      settingsRef.current = next;
      persistSettings(next);
      return next;
    });
  }, []);

  const updateHaptics = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, haptics: enabled };
      settingsRef.current = next;
      persistSettings(next);
      return next;
    });
  }, []);

  const updateSpeed = useCallback((speed: GameSpeed) => {
    setSettings((prev) => {
      const next = { ...prev, speed };
      settingsRef.current = next;
      persistSettings(next);
      return next;
    });
  }, []);

  const updateDifficulty = useCallback((difficulty: Difficulty) => {
    setSettings((prev) => {
      const next = { ...prev, difficulty };
      settingsRef.current = next;
      persistSettings(next);
      return next;
    });
  }, []);

  const resetBestScores = useCallback(() => {
    try {
      localStorage.removeItem(LEADERBOARD_KEY);
    } catch {
      // localStorage unavailable - nothing to clear.
    }
    setHighScores({});
    setEndInfo(null);
    setPending(null);
  }, []);

  // --- Start game from menu ---
  // Shared reset of the per-run refs after a fresh state is installed.
  const resetRunRefs = useCallback(() => {
    pointerTargetXRef.current = null;
    prevPhaseRef.current = 'waiting';
    prevScoreRef.current = 0;
    prevLivesRef.current = 3;
    prevLevelRef.current = 1;
  }, []);

  const startGame = useCallback(() => {
    if (!stateRef.current || !display.ready) return;
    scoreSavedRef.current = false;
    setEndInfo(null);
    setPending(null);
    const speedMultiplier = SPEED_MULTIPLIERS[settingsRef.current.speed];
    const fresh = buildInitialState(
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      1,
      speedMultiplier,
      settingsRef.current.difficulty,
    );
    stateRef.current = { ...fresh, phase: 'waiting' };
    resetRunRefs();
  }, [display.ready, resetRunRefs]);

  // --- Start the deterministic daily challenge ---
  const startDaily = useCallback(() => {
    if (!stateRef.current || !display.ready) return;
    scoreSavedRef.current = false;
    setEndInfo(null);
    setPending(null);
    const challenge = dailyChallenge();
    const speedMultiplier = SPEED_MULTIPLIERS[settingsRef.current.speed];
    const fresh = buildInitialState(
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      1,
      speedMultiplier,
      challenge.difficulty,
      { gridOverride: challenge.grid, isDaily: true },
    );
    stateRef.current = { ...fresh, phase: 'waiting' };
    resetRunRefs();
  }, [display.ready, resetRunRefs]);

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !display.ready) return;

    // Logical resolution is fixed; the engine/renderer always run at these dims.
    const width = CANVAS_WIDTH;
    const height = CANVAS_HEIGHT;
    const devicePixelRatio = window.devicePixelRatio || 1;
    // Internal buffer = logical × dpr; CSS display size letterboxes into the window.
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${display.width}px`;
    canvas.style.height = `${display.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    let lastUiScore = -1, lastUiLives = -1, lastUiPhase = '', lastUiLevel = -1, lastUiCombo = -1;

    // Fixed-timestep accumulator: makes the sim frame-rate independent so
    // 120Hz displays don't run ~2x speed. We step the engine in fixed 60fps
    // slices, capping steps/frame to avoid a spiral-of-death after a stall.
    const FIXED_STEP_MS = 1000 / 60;
    const MAX_STEPS_PER_FRAME = 5;
    let lastTime = performance.now();
    let accumulator = 0;

    function loop(now: number) {
      if (stateRef.current) {
        const prevState = stateRef.current;

        let frameTime = now - lastTime;
        lastTime = now;
        // Clamp pathological deltas (tab backgrounded, breakpoint) before they
        // flood the accumulator.
        if (frameTime > 250) frameTime = 250;
        accumulator += frameTime;

        // Skip game update while in menu (but keep the clock from accumulating
        // a huge backlog that would fast-forward on resume).
        if (stateRef.current.phase === 'menu') {
          accumulator = 0;
          prevStepStateRef.current = null;
        } else {
          let steps = 0;
          while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
            // Consume action flags on the first step only (one input per frame).
            const actionFlags = {
              launchBall: launchFlagRef.current,
              fireLaser: fireLaserFlagRef.current,
              pointerTargetX: pointerTargetXRef.current,
            };
            launchFlagRef.current = false;
            fireLaserFlagRef.current = false;

            // Keep the pre-step state as the interpolation anchor (persists
            // across frames so no-step frames still interpolate smoothly).
            prevStepStateRef.current = stateRef.current;
            stateRef.current = updateGame(
              stateRef.current,
              keysRef.current,
              width,
              height,
              actionFlags,
              FIXED_STEP_MS,
            );
            accumulator -= FIXED_STEP_MS;
            steps += 1;
          }
          // If we hit the step cap, drop the remaining backlog rather than
          // carrying it into the next frame.
          if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;
        }

        // Render once per animation frame, interpolating between the last two
        // sim states by how far we are into the next step (smooths high-refresh).
        const alpha = Math.min(1, accumulator / FIXED_STEP_MS);
        const renderState = interpolateForRender(prevStepStateRef.current, stateRef.current, alpha);
        drawFrame({ ctx: ctx!, canvasWidth: width, canvasHeight: height }, renderState);

        const { score, lives, phase, level, comboCount, activePowerups } = stateRef.current;

        // --- Audio: phase transitions ---
        const prevPhase = prevPhaseRef.current;
        if (phase !== prevPhase) {
          if (phase === 'won') { playWin(); handleGameEnd(score, true); }
          if (phase === 'lost') { playGameOver(); handleGameEnd(score, false); }
          if (phase === 'waiting' && prevPhase === 'playing') playBallLost();
          if (phase === 'levelTransition') playLevelUp();
          prevPhaseRef.current = phase;
        }

        // --- Haptics: ball lost ---
        const hapticsEnabled = settingsRef.current.haptics;
        if (phase === 'waiting' && prevPhase === 'playing') {
          vibrate(50, hapticsEnabled);
        }

        // --- Audio: level advance ---
        if (level !== prevLevelRef.current) {
          prevLevelRef.current = level;
        }

        // --- Audio: score change + haptics on brick hit ---
        if (score > prevScoreRef.current && phase === 'playing') {
          const delta = score - prevScoreRef.current;
          if (delta >= 10) {
            playDestroyBrick();
            vibrate(10, hapticsEnabled);
          } else {
            playHitBrick();
            vibrate(10, hapticsEnabled);
          }
        }
        prevScoreRef.current = score;

        // --- Audio: paddle hit (ball vy sign flip near paddle) ---
        // With multiple balls, check any ball that flipped sign
        if (phase === 'playing') {
          const prevBalls = prevState.balls;
          const currBalls = stateRef.current.balls;
          for (let bi = 0; bi < Math.min(prevBalls.length, currBalls.length); bi++) {
            if (
              prevBalls[bi].vy > 0 &&
              currBalls[bi].vy < 0 &&
              Math.abs(currBalls[bi].y - stateRef.current.paddle.y) < 20
            ) {
              playHitPaddle();
              break; // one sound per frame is enough
            }
          }
        }

        // --- Audio: powerup picked up ---
        if (activePowerups.length > prevActivePowerupCountRef.current) {
          playPowerupPickup();
        }
        prevActivePowerupCountRef.current = activePowerups.length;

        // --- UI state sync (throttled) ---
        if (
          score !== lastUiScore ||
          lives !== lastUiLives ||
          phase !== lastUiPhase ||
          level !== lastUiLevel ||
          comboCount !== lastUiCombo
        ) {
          lastUiScore = score;
          lastUiLives = lives;
          lastUiPhase = phase;
          lastUiLevel = level;
          lastUiCombo = comboCount;
          setUiState({ score, lives, phase, level, comboCount });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame((t) => {
      lastTime = t;
      loop(t);
    });
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [display.width, display.height, display.ready, handleGameEnd]);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      initAudio();
      keysRef.current[e.key] = true;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (stateRef.current) {
          const { phase } = stateRef.current;
          if (phase === 'menu') {
            startGame();
          } else if (phase === 'waiting') {
            stateRef.current = { ...stateRef.current, phase: 'playing' };
          } else if (phase === 'playing') {
            // Check if there's a sticky ball to launch
            const hasStickyBall = stateRef.current.balls.some((b) => b.stuck);
            if (hasStickyBall) {
              launchFlagRef.current = true;
            }
            // Check if laser powerup is active — fire lasers
            const laserActive = stateRef.current.activePowerups.some(
              (a) => a.type === 'laser' && a.framesLeft > 0,
            );
            if (laserActive) {
              fireLaserFlagRef.current = true;
              playLaserShoot();
            }
          } else if (phase === 'won' || phase === 'lost') {
            startGame();
          }
        }
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (stateRef.current) {
          const { phase } = stateRef.current;
          if (phase === 'playing') {
            stateRef.current = { ...stateRef.current, phase: 'paused' };
          } else if (phase === 'paused') {
            stateRef.current = { ...stateRef.current, phase: 'playing' };
          } else if (phase === 'menu') {
            // Escape from menu does nothing
          }
        }
      }

      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startGame]);

  const canDrivePaddle = useCallback(() => {
    return (
      stateRef.current?.phase === 'playing' ||
      stateRef.current?.phase === 'waiting'
    );
  }, []);

  const setPointerTargetFromClientX = useCallback((clientX: number) => {
    const gameArea = gameAreaRef.current;
    const canvas = canvasRef.current;
    if (
      !gameArea ||
      !canvas ||
      !canDrivePaddle()
    ) return;

    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right) return;

    // Remap CSS pixels → fixed logical coords; the engine eases toward this
    // CENTRE (single writer). rect.width is the CSS display width.
    pointerTargetXRef.current =
      (clientX - rect.left) * (CANVAS_WIDTH / rect.width);
  }, [canDrivePaddle]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setPointerTargetFromClientX(e.clientX);
  }, [setPointerTargetFromClientX]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!canDrivePaddle()) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPointerTargetFromClientX(e.clientX);
  }, [canDrivePaddle, setPointerTargetFromClientX]);

  const handlePointerEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (e.pointerType !== 'mouse') {
      pointerTargetXRef.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
      pointerTargetXRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    initAudio();
    if (!stateRef.current) return;
    const { phase } = stateRef.current;
    if (phase === 'menu') {
      return;
    }
    if (phase === 'waiting') {
      stateRef.current = { ...stateRef.current, phase: 'playing' };
    } else if (phase === 'playing') {
      // Launch sticky ball or fire laser on click
      const hasStickyBall = stateRef.current.balls.some((b) => b.stuck);
      if (hasStickyBall) {
        launchFlagRef.current = true;
      }
      const laserActive = stateRef.current.activePowerups.some(
        (a) => a.type === 'laser' && a.framesLeft > 0,
      );
      if (laserActive) {
        fireLaserFlagRef.current = true;
        playLaserShoot();
      }
    }
    // won/lost clicks handled by React buttons in overlay, not canvas click
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!canDrivePaddle()) return;
    const paddle = stateRef.current?.paddle;
    if (!paddle) return;

    const horizontalDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (horizontalDelta === 0) return;

    e.preventDefault();
    // pointerTargetX is in fixed logical coords — clamp against CANVAS_WIDTH.
    const currentCenter = pointerTargetXRef.current ?? paddle.x + paddle.w / 2;
    pointerTargetXRef.current = Math.max(
      0,
      Math.min(CANVAS_WIDTH, currentCenter + horizontalDelta),
    );
  }, [canDrivePaddle]);

  const phaseLabel = () => {
    switch (uiState.phase) {
      case 'playing': return 'PLAYING';
      case 'paused': return 'PAUSED';
      case 'won': return 'WINNER';
      case 'lost': return 'GAME OVER';
      case 'levelTransition': return `LEVEL ${uiState.level}`;
      case 'menu': return 'MENU';
      default: return 'READY';
    }
  };

  // Whether to show the canvas HUD (hide in menu to keep it clean)
  const showHUD = uiState.phase !== 'menu';

  // Whether the menu overlay should be visible
  const showMenu = uiState.phase === 'menu';
  const showGameOver = uiState.phase === 'won' || uiState.phase === 'lost';
  const selectedBest = bestScore(highScores, scoreKey(settings.difficulty, settings.speed));

  return (
    <div className="fixed inset-0 bg-neutral-950 flex justify-center items-center overflow-hidden touch-none select-none">
      <div
        ref={gameAreaRef}
        className="relative bg-black shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ width: display.width, height: display.height }}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-none"
        />

        {/* HUD Overlay — hidden in menu */}
        {showHUD && (
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
            <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10">
              <div className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mb-0.5">Score</div>
              <div className="text-2xl text-white font-mono leading-none">{uiState.score.toString().padStart(6, '0')}</div>
              <div className="text-[10px] text-yellow-400 font-mono mt-1">LVL {uiState.level}</div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10 flex items-center gap-3">
                <div className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Lives</div>
                <div className="flex gap-1.5">
                  {[...Array(Math.max(uiState.lives, 3))].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(10,132,255,0.6)] ${i < uiState.lives ? 'bg-blue-500' : 'bg-white/10'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="text-[10px] font-mono text-white/40 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">
                {phaseLabel()}
              </div>
              <div className="text-[10px] font-mono text-white/45 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">
                {DIFFICULTY_CONFIG[settings.difficulty].label} / {settings.speed}x
              </div>
              {/* Mobile pause button */}
              {(uiState.phase === 'playing' || uiState.phase === 'paused') && (
                <button
                  className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 text-white/60 text-[11px] font-mono uppercase tracking-widest active:bg-white/10 pointer-events-auto"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    initAudio();
                    if (!stateRef.current) return;
                    const { phase } = stateRef.current;
                    if (phase === 'playing') {
                      stateRef.current = { ...stateRef.current, phase: 'paused' };
                    } else if (phase === 'paused') {
                      stateRef.current = { ...stateRef.current, phase: 'playing' };
                    }
                  }}
                >
                  {uiState.phase === 'paused' ? 'Resume' : 'Pause'}
                </button>
              )}
              {/* Return to menu button during paused/won/lost */}
              {(uiState.phase === 'paused' || uiState.phase === 'won' || uiState.phase === 'lost') && (
                <button
                  className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 text-white/40 text-[11px] font-mono uppercase tracking-widest active:bg-white/10 pointer-events-auto"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (!stateRef.current) return;
                    stateRef.current = { ...stateRef.current, phase: 'menu' };
                    setMenuView('main');
                  }}
                >
                  Menu
                </button>
              )}
            </div>
          </div>
        )}

        {showGameOver && endInfo && (
          <GameOverPanel
            info={endInfo}
            pending={pending}
            nameInput={nameInput}
            onNameChange={setNameInput}
            onNameSubmit={submitName}
            onReplay={() => { initAudio(); startGame(); }}
            onMenu={() => {
              if (!stateRef.current) return;
              stateRef.current = { ...stateRef.current, phase: 'menu' };
              setMenuView('main');
            }}
          />
        )}

        {/* --- Achievement toasts --- */}
        {toasts.length > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center gap-2 px-4"
            role="status"
            aria-live="polite"
          >
            {toasts.map((t) => (
              <div
                key={t.id}
                className="w-full max-w-xs rounded-lg border border-yellow-300/40 bg-black/85 px-4 py-2 shadow-[0_0_24px_rgba(255,214,10,0.25)]"
              >
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-yellow-300">
                  Achievement — {t.label}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-white/60">{t.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* --- Menu Overlay --- */}
        {showMenu && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-[#0a0a1a]/90 px-4 py-6 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {menuView === 'main' && (
              <MainMenu
                bestScore={selectedBest}
                difficulty={settings.difficulty}
                speed={settings.speed}
                onDifficultyChange={updateDifficulty}
                onPlay={() => { initAudio(); startGame(); }}
                onDaily={() => { initAudio(); startDaily(); }}
                onHighScores={() => setMenuView('highscores')}
                onSettings={() => setMenuView('settings')}
              />
            )}
            {menuView === 'highscores' && (
              <HighScoresPanel
                scores={highScores}
                selectedDifficulty={settings.difficulty}
                selectedSpeed={settings.speed}
                onBack={() => setMenuView('main')}
              />
            )}
            {menuView === 'settings' && (
              <SettingsPanel
                settings={settings}
                onVolumeChange={updateVolume}
                onHapticsChange={updateHaptics}
                onSpeedChange={updateSpeed}
                onDifficultyChange={updateDifficulty}
                onResetScores={resetBestScores}
                onBack={() => setMenuView('main')}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function MainMenu({
  bestScore,
  difficulty,
  speed,
  onDifficultyChange,
  onPlay,
  onDaily,
  onHighScores,
  onSettings,
}: {
  bestScore: number;
  difficulty: Difficulty;
  speed: GameSpeed;
  onDifficultyChange: (d: Difficulty) => void;
  onPlay: () => void;
  onDaily: () => void;
  onHighScores: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 w-full max-w-xs">
      {/* Title */}
      <div className="text-center">
        <h1
          className="font-mono font-bold text-5xl tracking-widest text-white"
          style={{
            textShadow: '0 0 20px #0a84ff, 0 0 40px #0a84ff, 0 0 60px #0a84ff66',
          }}
        >
          DX-BALL
        </h1>
        <p className="text-white/30 font-mono text-xs tracking-widest mt-2 uppercase">
          Brick Breaker
        </p>
      </div>

      <div className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Best</span>
          <span className="font-mono text-[10px] text-blue-300/80 uppercase tracking-widest">
            {DIFFICULTY_CONFIG[difficulty].label} / {speed}x
          </span>
        </div>
        <div className="mt-1 font-mono font-bold text-2xl text-yellow-300 tabular-nums">
          {bestScore.toString().padStart(6, '0')}
        </div>
      </div>

      {/* Primary pre-game choice: difficulty */}
      <div className="flex w-full flex-col gap-2">
        <span
          id="menu-difficulty-label"
          className="font-mono text-[10px] text-white/50 uppercase tracking-widest"
        >
          Difficulty
        </span>
        <DifficultySegment
          value={difficulty}
          onChange={onDifficultyChange}
          labelId="menu-difficulty-label"
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full">
        <MenuButton onClick={onPlay} primary>
          Play
        </MenuButton>
        <MenuButton onClick={onDaily}>
          Daily Challenge
        </MenuButton>
        <MenuButton onClick={onHighScores}>
          High Scores
        </MenuButton>
        <MenuButton onClick={onSettings}>
          Settings
        </MenuButton>
      </div>

      <p className="text-white/20 font-mono text-[10px] tracking-widest uppercase">
        Arrow keys or mouse to move
      </p>
    </div>
  );
}

function MenuButton({
  onClick,
  primary = false,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full py-3 rounded-lg font-mono font-bold text-sm uppercase tracking-widest transition-all duration-150',
        'border active:scale-95',
        primary
          ? 'bg-blue-600/80 border-blue-400/60 text-white hover:bg-blue-500/80 shadow-[0_0_20px_rgba(10,132,255,0.4)]'
          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function GameOverPanel({
  info,
  pending,
  nameInput,
  onNameChange,
  onNameSubmit,
  onReplay,
  onMenu,
}: {
  info: EndInfo;
  pending: PendingScore | null;
  nameInput: string;
  onNameChange: (v: string) => void;
  onNameSubmit: () => void;
  onReplay: () => void;
  onMenu: () => void;
}) {
  const { won, score, best, isNewRecord, isDaily, difficulty, speed, stats } = info;
  const awaitingName = pending !== null;
  const statRows: [string, number][] = [
    ['Bricks', stats.bricksDestroyed],
    ['Best Combo', stats.bestCombo],
    ['Level', stats.levelReached],
    ['Power-ups', stats.powerupsCollected],
  ];
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[#0a0a1a]/70 backdrop-blur-[2px] px-6 py-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-xs rounded-lg border border-white/10 bg-black/70 p-5 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="text-center">
          <h2
            className="font-mono font-bold text-3xl uppercase tracking-widest"
            style={{
              color: won ? '#ffd60a' : '#ff2d55',
              textShadow: `0 0 22px ${won ? '#ffd60a' : '#ff2d55'}`,
            }}
          >
            {won ? 'You Win' : 'Game Over'}
          </h2>
          {isNewRecord && (
            <p className="dxball-flash mt-2 font-mono text-sm font-bold uppercase tracking-widest text-yellow-300">
              ★ New High Score! ★
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">Score</div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
              {score.toString().padStart(6, '0')}
            </div>
          </div>
          <div className="rounded-lg border border-yellow-300/30 bg-yellow-950/20 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-yellow-200/60">Best</div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums text-yellow-200">
              {best.toString().padStart(6, '0')}
            </div>
          </div>
        </div>

        {/* Run stats */}
        <dl className="mt-3 grid grid-cols-2 gap-2">
          {statRows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <dt className="font-mono text-[9px] uppercase tracking-widest text-white/40">{label}</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white/90">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 rounded-lg border border-blue-400/20 bg-blue-950/20 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-blue-200/80">
          {isDaily ? `Daily / ${DIFFICULTY_CONFIG[difficulty].label}` : `${DIFFICULTY_CONFIG[difficulty].label} / ${speed}x`}
        </div>

        {/* Name entry for a qualifying score */}
        {awaitingName && (
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(e) => { e.preventDefault(); onNameSubmit(); }}
          >
            <label
              htmlFor="dxball-name"
              className="font-mono text-[10px] uppercase tracking-widest text-yellow-200/70"
            >
              Enter your name for the leaderboard
            </label>
            <div className="flex gap-2">
              <input
                id="dxball-name"
                type="text"
                maxLength={12}
                autoFocus
                value={nameInput}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Player"
                className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 font-mono text-sm text-white placeholder:text-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/70"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-lg border border-yellow-300/50 bg-yellow-500/20 px-4 font-mono text-xs font-bold uppercase tracking-widest text-yellow-100 transition-all hover:bg-yellow-500/30 active:scale-95"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onMenu}
            className="min-h-[44px] rounded-lg border border-white/10 bg-white/5 font-mono text-xs font-bold uppercase tracking-widest text-white/60 transition-all hover:bg-white/10 active:scale-95"
          >
            Menu
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="min-h-[44px] rounded-lg border border-blue-400/60 bg-blue-600/80 font-mono text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(10,132,255,0.35)] transition-all hover:bg-blue-500/80 active:scale-95"
          >
            Replay
          </button>
        </div>
      </div>
    </div>
  );
}

function LeaderboardList({ rows }: { rows: LeaderboardEntry[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center font-mono text-xs text-white/30">
        No scores yet.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row, i) => (
        <li
          key={`${row.name}:${row.date}:${i}`}
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5"
        >
          <span className="w-5 shrink-0 font-mono text-[11px] font-bold tabular-nums text-blue-300/80">
            {i + 1}
          </span>
          <span className="flex-1 truncate font-mono text-xs text-white/80">{row.name}</span>
          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-yellow-200">
            {row.score.toString().padStart(6, '0')}
          </span>
          <span className="w-[72px] shrink-0 text-right font-mono text-[9px] tabular-nums text-white/30">
            {row.date.slice(0, 10)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function HighScoresPanel({
  scores,
  selectedDifficulty,
  selectedSpeed,
  onBack,
}: {
  scores: LeaderboardTable;
  selectedDifficulty: Difficulty;
  selectedSpeed: GameSpeed;
  onBack: () => void;
}) {
  const selectedKey = scoreKey(selectedDifficulty, selectedSpeed);
  const selectedRows = scores[selectedKey] ?? [];
  const dKey = dailyKey(todayStr());
  const dailyRows = scores[dKey] ?? [];

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6 px-6">
      <h2 className="font-mono text-2xl font-bold uppercase tracking-widest text-white/90">
        Leaderboard
      </h2>

      <div className="w-full">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {DIFFICULTY_CONFIG[selectedDifficulty].label} / {selectedSpeed}x
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/25">
            Top {Math.max(selectedRows.length, 0) ? selectedRows.length : 10}
          </span>
        </div>
        <LeaderboardList rows={selectedRows} />
      </div>

      {dailyRows.length > 0 && (
        <div className="w-full">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-yellow-200/60">
            Daily — {todayStr()}
          </div>
          <LeaderboardList rows={dailyRows} />
        </div>
      )}

      <MenuButton onClick={onBack}>Back</MenuButton>
    </div>
  );
}

// `normal` is surfaced to players as "Medium" (spec); the engine value stays `normal`.
const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; note: string }[] = [
  { value: 'easy', label: 'Easy', note: '4 lives' },
  { value: 'normal', label: 'Medium', note: 'balanced' },
  { value: 'hard', label: 'Hard', note: '2 lives' },
];

// Shared Easy / Medium / Hard segmented control — used on the start screen and
// in Settings, both bound to the same `settings.difficulty` via updateDifficulty.
function DifficultySegment({
  value,
  onChange,
  labelId,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  labelId: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
      {DIFFICULTY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              'min-h-[58px] px-2 py-2 rounded-lg font-mono uppercase border transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
              active
                ? 'bg-blue-600/60 border-blue-400/50 text-white shadow-[0_0_16px_rgba(10,132,255,0.3)]'
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70',
            ].join(' ')}
          >
            <span className="block text-xs font-bold tracking-widest">{opt.label}</span>
            <span className="block mt-1 text-[9px] tracking-normal normal-case text-white/45">
              {opt.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const SPEED_OPTIONS: { value: GameSpeed; label: string }[] = [
  { value: '0.75', label: '0.75x' },
  { value: '1', label: '1x' },
  { value: '1.25', label: '1.25x' },
];

function SettingsPanel({
  settings,
  onVolumeChange,
  onHapticsChange,
  onSpeedChange,
  onDifficultyChange,
  onResetScores,
  onBack,
}: {
  settings: Settings;
  onVolumeChange: (v: number) => void;
  onHapticsChange: (enabled: boolean) => void;
  onSpeedChange: (speed: GameSpeed) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onResetScores: () => void;
  onBack: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="flex flex-col items-center gap-6 px-6 w-full max-w-xs">
      <h2 className="font-mono font-bold text-2xl tracking-widest text-white/90 uppercase">
        Settings
      </h2>

      <div className="flex flex-col gap-5 w-full">
        {/* Difficulty segmented control (shared with the start screen) */}
        <div className="flex flex-col gap-2">
          <span
            id="difficulty-label"
            className="font-mono text-xs text-white/60 uppercase tracking-widest"
          >
            Difficulty
          </span>
          <DifficultySegment
            value={settings.difficulty}
            onChange={onDifficultyChange}
            labelId="difficulty-label"
          />
        </div>

        {/* Game speed segmented control */}
        <div className="flex flex-col gap-2">
          <span
            id="speed-label"
            className="font-mono text-xs text-white/60 uppercase tracking-widest"
          >
            Game Speed
          </span>
          <div
            role="radiogroup"
            aria-labelledby="speed-label"
            className="flex gap-2"
          >
            {SPEED_OPTIONS.map((opt) => {
              const active = settings.speed === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onSpeedChange(opt.value)}
                  className={[
                    'flex-1 min-h-[44px] px-2 py-2 rounded-lg font-mono text-xs uppercase tracking-widest border transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
                    active
                      ? 'bg-blue-600/60 border-blue-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Volume slider */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs text-white/60 uppercase tracking-widest">
              Volume
            </label>
            <span className="font-mono text-xs text-white/40">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            className="w-full accent-blue-500 cursor-pointer"
          />
        </div>

        {/* Haptics toggle */}
        <div className="flex items-center justify-between">
          <label className="font-mono text-xs text-white/60 uppercase tracking-widest">
            Haptics
          </label>
          <button
            onClick={() => onHapticsChange(!settings.haptics)}
            className={[
              'px-4 py-1.5 rounded-lg font-mono text-xs uppercase tracking-widest border transition-all',
              settings.haptics
                ? 'bg-blue-600/60 border-blue-400/50 text-white'
                : 'bg-white/5 border-white/10 text-white/40',
            ].join(' ')}
          >
            {settings.haptics ? 'On' : 'Off'}
          </button>
        </div>

        {/* Reset scores */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="w-full min-h-[44px] rounded-lg font-mono font-bold text-xs uppercase tracking-widest border border-red-400/30 bg-red-950/30 text-red-200/80 hover:bg-red-900/40 active:scale-95 transition-all"
          >
            Reset Best Scores
          </button>
          {confirmReset && (
            <div className="bg-red-950/35 border border-red-400/30 rounded-lg p-3">
              <p className="font-mono text-[11px] leading-5 text-red-100/80">
                Delete every saved personal best on this device?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[40px] rounded-lg border border-white/10 bg-white/5 font-mono text-[11px] uppercase tracking-widest text-white/60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onResetScores();
                    setConfirmReset(false);
                  }}
                  className="min-h-[40px] rounded-lg border border-red-300/50 bg-red-600/70 font-mono text-[11px] font-bold uppercase tracking-widest text-white"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controls reference */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <p className="font-mono text-xs text-white/50 uppercase tracking-widest mb-3">
            Controls
          </p>
          <div className="flex flex-col gap-1.5">
            {[
              ['Arrow keys / Mouse', 'Move paddle'],
              ['Space / Click', 'Launch / Fire'],
              ['Esc / P', 'Pause'],
            ].map(([key, action]) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] text-blue-400/80 bg-blue-900/20 px-2 py-0.5 rounded border border-blue-400/20">
                  {key}
                </span>
                <span className="font-mono text-[11px] text-white/40">{action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <MenuButton onClick={onBack}>Back</MenuButton>
    </div>
  );
}
