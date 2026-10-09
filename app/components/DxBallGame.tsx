'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { buildInitialState, DIFFICULTY_CONFIG, updateGame } from '@/lib/game/engine';
import { drawFrame } from '@/lib/game/renderer';
import { Difficulty, GameSpeed, GameState, HighScoreEntry, HighScoreTable } from '@/lib/game/types';
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

// --- High Score localStorage helpers ---

const HIGH_SCORE_KEY = 'dxball_highscores';
const SETTINGS_KEY = 'dxball_settings';

const SPEED_MULTIPLIERS: Record<GameSpeed, number> = {
  '0.75': 0.75,
  '1': 1,
  '1.25': 1.25,
};

interface RunResult {
  score: number;
  best: number;
  isNewRecord: boolean;
  difficulty: Difficulty;
  speed: GameSpeed;
}

function scoreKey(difficulty: Difficulty, speed: GameSpeed): string {
  return `${difficulty}:${speed}`;
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function isGameSpeed(value: unknown): value is GameSpeed {
  return value === '0.75' || value === '1' || value === '1.25';
}

function loadHighScores(): HighScoreTable {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};

    const safeScores: HighScoreTable = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (!value || typeof value !== 'object') return;
      const [difficulty, speed] = key.split(':');
      const entry = value as Partial<HighScoreEntry>;
      if (!isDifficulty(difficulty) || !isGameSpeed(speed)) return;
      if (typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0) return;
      safeScores[key] = {
        score: Math.floor(entry.score),
        date: typeof entry.date === 'string' ? entry.date : new Date().toISOString(),
      };
    });
    return safeScores;
  } catch {
    return {};
  }
}

function saveHighScore(score: number, difficulty: Difficulty, speed: GameSpeed): RunResult {
  const key = scoreKey(difficulty, speed);
  const currentScores = loadHighScores();
  const previousBest = currentScores[key]?.score ?? 0;
  const isNewRecord = score > previousBest;

  try {
    if (typeof window !== 'undefined' && isNewRecord) {
      localStorage.setItem(
        HIGH_SCORE_KEY,
        JSON.stringify({
          ...currentScores,
          [key]: { score, date: new Date().toISOString() },
        }),
      );
    }
  } catch {
    // localStorage unavailable - keep the run result in memory only.
  }

  return { score, best: Math.max(score, previousBest), isNewRecord, difficulty, speed };
}

// --- Settings localStorage helpers ---

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

  const [uiState, setUiState] = useState({
    score: 0,
    lives: 3,
    phase: 'menu' as GameState['phase'],
    level: 1,
    comboCount: 1,
  });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, screenWidth: 0 });

  // Menu / overlay React state
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [highScores, setHighScores] = useState<HighScoreTable>({});
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [runResult, setRunResult] = useState<RunResult | null>(null);

  // Load browser-only localStorage data after hydration so server/client text matches.
  useEffect(() => {
    const savedSettings = loadSettings();
    settingsRef.current = savedSettings;
    // Browser storage must load after hydration to keep SSR/client text identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(savedSettings);
    setHighScores(loadHighScores());
    setVolume(savedSettings.volume);
  }, []);

  // --- Initialization and Resize Handling ---
  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      const gameWidth = Math.min(screenWidth, 600);
      const gameHeight = screenHeight;

      setDimensions({ width: gameWidth, height: gameHeight, screenWidth });

      if (!stateRef.current) {
        const { speed, difficulty } = settingsRef.current;
        const s = buildInitialState(gameWidth, gameHeight, 1, SPEED_MULTIPLIERS[speed], difficulty);
        // Start on the menu, not the waiting screen
        stateRef.current = { ...s, phase: 'menu' };
      } else {
        if (stateRef.current.phase === 'waiting' || stateRef.current.phase === 'menu') {
          const currentLevel = stateRef.current.level;
          const currentPhase = stateRef.current.phase;
          const { speed, difficulty } = settingsRef.current;
          stateRef.current = {
            ...buildInitialState(gameWidth, gameHeight, currentLevel, SPEED_MULTIPLIERS[speed], difficulty),
            phase: currentPhase,
          };
        } else {
          stateRef.current.paddle.x = Math.min(
            stateRef.current.paddle.x,
            gameWidth - stateRef.current.paddle.w,
          );
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Save high score when game ends ---
  const handleGameEnd = useCallback((score: number) => {
    if (scoreSavedRef.current) return;
    scoreSavedRef.current = true;
    const { difficulty, speed } = settingsRef.current;
    const result = saveHighScore(score, difficulty, speed);
    setRunResult(result);
    if (result.isNewRecord) {
      setHighScores(loadHighScores());
    }
  }, []);

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
      localStorage.removeItem(HIGH_SCORE_KEY);
    } catch {
      // localStorage unavailable - nothing to clear.
    }
    setHighScores({});
    setRunResult(null);
  }, []);

  // --- Start game from menu ---
  const startGame = useCallback(() => {
    if (!stateRef.current || dimensions.width === 0) return;
    scoreSavedRef.current = false;
    setRunResult(null);
    const speedMultiplier = SPEED_MULTIPLIERS[settingsRef.current.speed];
    const fresh = buildInitialState(
      dimensions.width,
      dimensions.height,
      1,
      speedMultiplier,
      settingsRef.current.difficulty,
    );
    stateRef.current = { ...fresh, phase: 'waiting' };
    pointerTargetXRef.current = null;
    prevPhaseRef.current = 'waiting';
    prevScoreRef.current = 0;
    prevLivesRef.current = 3;
    prevLevelRef.current = 1;
  }, [dimensions]);

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const { width, height } = dimensions;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

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

        // Render once per animation frame after stepping.
        drawFrame({ ctx: ctx!, canvasWidth: width, canvasHeight: height }, stateRef.current);

        const { score, lives, phase, level, comboCount, activePowerups } = stateRef.current;

        // --- Audio: phase transitions ---
        const prevPhase = prevPhaseRef.current;
        if (phase !== prevPhase) {
          if (phase === 'won') { playWin(); handleGameEnd(score); }
          if (phase === 'lost') { playGameOver(); handleGameEnd(score); }
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
  }, [dimensions, handleGameEnd]);

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
  }, [dimensions, startGame]);

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

    // Set the desired paddle CENTRE; the engine eases toward it (single writer).
    pointerTargetXRef.current = clientX - rect.left;
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
    const canvas = canvasRef.current;
    const paddle = stateRef.current?.paddle;
    if (!canvas || !paddle) return;

    const horizontalDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : 0;
    if (horizontalDelta === 0) return;

    e.preventDefault();
    const currentCenter = pointerTargetXRef.current ?? paddle.x + paddle.w / 2;
    pointerTargetXRef.current = Math.max(
      0,
      Math.min(canvas.getBoundingClientRect().width, currentCenter + horizontalDelta),
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
  const selectedBest = highScores[scoreKey(settings.difficulty, settings.speed)]?.score ?? 0;

  return (
    <div className="fixed inset-0 bg-neutral-950 flex justify-center items-center overflow-hidden touch-none select-none">
      <div
        ref={gameAreaRef}
        className="relative bg-black shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ width: dimensions.width, height: dimensions.height }}
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

        {showGameOver && runResult && (
          <GameOverPanel
            won={uiState.phase === 'won'}
            result={runResult}
            onReplay={() => { initAudio(); startGame(); }}
            onMenu={() => {
              if (!stateRef.current) return;
              stateRef.current = { ...stateRef.current, phase: 'menu' };
              setMenuView('main');
            }}
          />
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
                onPlay={() => { initAudio(); startGame(); }}
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
  onPlay,
  onHighScores,
  onSettings,
}: {
  bestScore: number;
  difficulty: Difficulty;
  speed: GameSpeed;
  onPlay: () => void;
  onHighScores: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8 px-6 w-full max-w-xs">
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

      {/* Buttons */}
      <div className="flex flex-col gap-3 w-full">
        <MenuButton onClick={onPlay} primary>
          Play
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
  won,
  result,
  onReplay,
  onMenu,
}: {
  won: boolean;
  result: RunResult;
  onReplay: () => void;
  onMenu: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a1a]/70 backdrop-blur-[2px] px-6"
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
          {result.isNewRecord && (
            <p className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-yellow-300">
              New Personal Best
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">Score</div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums text-white">
              {result.score.toString().padStart(6, '0')}
            </div>
          </div>
          <div className="rounded-lg border border-yellow-300/30 bg-yellow-950/20 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-yellow-200/60">Best</div>
            <div className="mt-1 font-mono text-xl font-bold tabular-nums text-yellow-200">
              {result.best.toString().padStart(6, '0')}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-blue-400/20 bg-blue-950/20 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-blue-200/80">
          {DIFFICULTY_CONFIG[result.difficulty].label} / {result.speed}x
        </div>

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

function HighScoresPanel({
  scores,
  selectedDifficulty,
  selectedSpeed,
  onBack,
}: {
  scores: HighScoreTable;
  selectedDifficulty: Difficulty;
  selectedSpeed: GameSpeed;
  onBack: () => void;
}) {
  const entries = DIFFICULTY_OPTIONS.flatMap((difficulty) =>
    SPEED_OPTIONS.map((speed) => ({
      difficulty: difficulty.value,
      speed: speed.value,
      entry: scores[scoreKey(difficulty.value, speed.value)],
    })),
  );

  return (
    <div className="flex flex-col items-center gap-6 px-6 w-full max-w-xs">
      <h2 className="font-mono font-bold text-2xl tracking-widest text-white/90 uppercase">
        Best Scores
      </h2>

      <div className="w-full">
        {Object.keys(scores).length === 0 ? (
          <p className="text-white/30 font-mono text-sm text-center py-6">
            No scores yet. Play a game!
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {entries.map(({ difficulty, speed, entry }) => {
              const active = difficulty === selectedDifficulty && speed === selectedSpeed;
              return (
              <div
                key={`${difficulty}:${speed}`}
                className={[
                  'bg-white/5 border rounded-lg px-3 py-2 min-h-[70px]',
                  active ? 'border-blue-400/60 shadow-[0_0_16px_rgba(10,132,255,0.18)]' : 'border-white/10',
                ].join(' ')}
              >
                <div className="font-mono text-[9px] text-white/40 uppercase tracking-widest">
                  {DIFFICULTY_CONFIG[difficulty].label}
                </div>
                <div className="font-mono text-[9px] text-blue-300/70 uppercase tracking-widest">
                  {speed}x
                </div>
                <div className="mt-1 font-mono font-bold text-sm text-white tabular-nums">
                  {(entry?.score ?? 0).toString().padStart(6, '0')}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <MenuButton onClick={onBack}>Back</MenuButton>
    </div>
  );
}

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; note: string }[] = [
  { value: 'easy', label: 'Easy', note: '4 lives' },
  { value: 'normal', label: 'Normal', note: 'balanced' },
  { value: 'hard', label: 'Hard', note: '2 lives' },
];

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
        {/* Difficulty segmented control */}
        <div className="flex flex-col gap-2">
          <span
            id="difficulty-label"
            className="font-mono text-xs text-white/60 uppercase tracking-widest"
          >
            Difficulty
          </span>
          <div
            role="radiogroup"
            aria-labelledby="difficulty-label"
            className="grid grid-cols-3 gap-2"
          >
            {DIFFICULTY_OPTIONS.map((opt) => {
              const active = settings.difficulty === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onDifficultyChange(opt.value)}
                  className={[
                    'min-h-[58px] px-2 py-2 rounded-lg font-mono uppercase border transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70',
                    active
                      ? 'bg-blue-600/60 border-blue-400/50 text-white'
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
