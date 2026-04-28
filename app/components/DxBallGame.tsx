'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  PADDLE_WIDTH, PADDLE_HEIGHT, BALL_RADIUS, PADDLE_SPEED,
} from '@/lib/game/constants';
import { buildInitialState, updateGame } from '@/lib/game/engine';
import { drawFrame } from '@/lib/game/renderer';
import { GameState } from '@/lib/game/types';
import { clamp } from '@/lib/game/engine';

export default function DxBallGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number | null>(null);
  const [uiState, setUiState] = useState({ score: 0, lives: 3, phase: 'waiting' as GameState['phase'] });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, screenWidth: 0 });

  // --- Initialization and Resize Handling ---
  useEffect(() => {
    const handleResize = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      // Calculate a focused game width (e.g., max 600px or 90% of screen)
      const gameWidth = Math.min(screenWidth, 600);
      const gameHeight = screenHeight;
      
      setDimensions({ width: gameWidth, height: gameHeight, screenWidth });
      
      if (!stateRef.current) {
        stateRef.current = buildInitialState(gameWidth, gameHeight);
      } else {
        if (stateRef.current.phase === 'waiting') {
          stateRef.current = buildInitialState(gameWidth, gameHeight);
        } else {
          // Adjust paddle if it's outside new bounds
          stateRef.current.paddle.x = Math.min(stateRef.current.paddle.x, gameWidth - stateRef.current.paddle.w);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

    let lastUiScore = -1, lastUiLives = -1, lastUiPhase = '';

    function loop() {
      if (stateRef.current) {
        stateRef.current = updateGame(stateRef.current, keysRef.current, width, height);
        drawFrame({ ctx: ctx!, canvasWidth: width, canvasHeight: height }, stateRef.current);

        const { score, lives, phase } = stateRef.current;
        if (score !== lastUiScore || lives !== lastUiLives || phase !== lastUiPhase) {
          lastUiScore = score;
          lastUiLives = lives;
          lastUiPhase = phase;
          setUiState({ score, lives, phase });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [dimensions]);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (stateRef.current) {
          const { phase } = stateRef.current;
          if (phase === 'waiting') {
            stateRef.current = { ...stateRef.current, phase: 'playing' };
          } else if (phase === 'won' || phase === 'lost') {
            stateRef.current = buildInitialState(dimensions.width, dimensions.height);
            stateRef.current.phase = 'waiting';
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
  }, [dimensions]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !stateRef.current || stateRef.current.phase !== 'playing') return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left);

    stateRef.current.paddle.x = clamp(
      mouseX - PADDLE_WIDTH / 2,
      0,
      dimensions.width - PADDLE_WIDTH
    );
  }, [dimensions]);

  const handleClick = useCallback(() => {
    if (!stateRef.current) return;
    const { phase } = stateRef.current;
    if (phase === 'waiting') {
      stateRef.current = { ...stateRef.current, phase: 'playing' };
    } else if (phase === 'won' || phase === 'lost') {
      stateRef.current = buildInitialState(dimensions.width, dimensions.height);
      stateRef.current.phase = 'waiting';
    }
  }, [dimensions]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !stateRef.current || stateRef.current.phase !== 'playing') return;

    const rect = canvas.getBoundingClientRect();
    const touchX = (e.touches[0].clientX - rect.left);

    stateRef.current.paddle.x = clamp(
      touchX - PADDLE_WIDTH / 2,
      0,
      dimensions.width - PADDLE_WIDTH
    );
  }, [dimensions]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    handleTouchMove(e);
    handleClick();
  }, [handleTouchMove, handleClick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchstart', handleTouchStart);

    return () => {
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('click', handleClick);
        canvas.removeEventListener('touchmove', handleTouchMove);
        canvas.removeEventListener('touchstart', handleTouchStart);
      }
    };
  }, [handleMouseMove, handleClick, handleTouchMove, handleTouchStart]);

  return (
    <div className="fixed inset-0 bg-neutral-950 flex justify-center items-center overflow-hidden touch-none select-none">
      <div 
        className="relative bg-black shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden"
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full h-full cursor-none"
        />
        
        {/* HUD Overlay */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
          <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10">
            <div className="text-[10px] text-blue-400 font-bold tracking-widest uppercase mb-0.5">Score</div>
            <div className="text-2xl text-white font-mono leading-none">{uiState.score.toString().padStart(6, '0')}</div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="bg-black/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/10 flex items-center gap-3">
               <div className="text-[10px] text-blue-400 font-bold tracking-widest uppercase">Lives</div>
               <div className="flex gap-1.5">
                 {[...Array(3)].map((_, i) => (
                   <div 
                     key={i} 
                     className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(10,132,255,0.6)] ${i < uiState.lives ? 'bg-blue-500' : 'bg-white/10'}`}
                   />
                 ))}
               </div>
            </div>
            <div className="text-[10px] font-mono text-white/40 bg-black/40 backdrop-blur-sm px-2 py-1 rounded border border-white/5 uppercase tracking-tighter">
              {uiState.phase === 'playing' ? '▶ PLAYING' : uiState.phase === 'won' ? '★ WINNER' : uiState.phase === 'lost' ? '✕ GAME OVER' : '● READY'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
