// lib/game/renderer.ts
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_Y, BALL_RADIUS,
  BRICK_WIDTH, BRICK_HEIGHT, BRICK_PADDING, BRICK_OFFSET_X, BRICK_OFFSET_Y, BRICK_COLS, BRICK_ROWS, BRICK_TIERS,
} from './constants';
import { Ball, Brick, GamePhase, GameState, Particle, Paddle, RenderContext } from './types';

// Helper to draw rounded rectangles
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- Draw Functions ---

function drawOverlay(ctx: CanvasRenderingContext2D, title: string, subtitle: string, titleColor: string, width: number, height: number) {
  // Semi-transparent background overlay
  ctx.fillStyle = 'rgba(10,10,20,0.75)';
  ctx.fillRect(0, height / 2 - 72, width, 144);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Title text
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.fillStyle = titleColor;
  ctx.shadowColor = titleColor;
  ctx.shadowBlur = 24;
  ctx.fillText(title, width / 2, height / 2 - 20);

  // Subtitle text
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.shadowBlur = 0;
  ctx.fillText(subtitle, width / 2, height / 2 + 20);
}

export function drawFrame(renderContext: RenderContext, state: GameState) {
  const { ctx, canvasWidth, canvasHeight } = renderContext;
  const { paddle, ball, bricks, score, lives, phase, particles } = state;

  // --- Background ---
  ctx.clearRect(0, 0, canvasWidth, canvasHeight); // Clear canvas for new frame
  const bg = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  bg.addColorStop(0, '#0a0a1a'); // Darker blue top
  bg.addColorStop(1, '#0d0d24'); // Slightly lighter blue bottom
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // --- Grid dots for subtle texture ---
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let gx = 16; gx < canvasWidth; gx += 32) {
    for (let gy = 16; gy < canvasHeight; gy += 32) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Bricks ---
  bricks.forEach(b => {
    if (!b.alive) return;

    const alpha = b.hits / b.maxHits; // Transparency based on remaining hits

    // Shadow glow for depth and highlight
    ctx.shadowColor = b.fill;
    ctx.shadowBlur = 6;

    // Brick body with gradient
    ctx.globalAlpha = 0.4 + alpha * 0.6; // Visible range from 40% to 100%
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grad.addColorStop(0, b.stroke);
    grad.addColorStop(1, b.fill);
    ctx.fillStyle = grad;
    roundRect(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.fill();

    // Brick border
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = b.stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.stroke();

    // Hit count pip (if brick has more than 1 hit)
    if (b.maxHits > 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0; // No shadow for text
      ctx.fillText(b.hits.toString(), b.x + b.w / 2, b.y + b.h / 2);
    }

    ctx.globalAlpha = 1; // Reset alpha
    ctx.shadowBlur = 0; // Reset shadow blur
  });

  // --- Particles ---
  particles.forEach(p => {
    ctx.globalAlpha = p.life; // Fade out effect
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // --- Paddle ---
  const pGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h);
  pGrad.addColorStop(0, '#a0c4ff'); // Light blue top
  pGrad.addColorStop(1, '#0a84ff'); // Darker blue bottom
  ctx.fillStyle = pGrad;
  ctx.shadowColor = '#0a84ff'; // Glow effect
  ctx.shadowBlur = 16;
  roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6); // Rounded corners
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- Ball ---
  if (phase !== 'lost' && phase !== 'won') { // Don't draw ball if game is over
    const ballGrad = ctx.createRadialGradient(
      ball.x - ball.r * 0.3, ball.y - ball.r * 0.3, 1, // Inner highlight
      ball.x, ball.y, ball.r // Outer edge
    );
    ballGrad.addColorStop(0, '#ffffff'); // Bright white center
    ballGrad.addColorStop(0.5, '#a0c4ff'); // Lighter blue
    ballGrad.addColorStop(1, '#0a84ff'); // Darker blue edge
    ctx.fillStyle = ballGrad;
    ctx.shadowColor = '#60afff'; // Ball glow
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // --- HUD (Score & Lives) ---
  drawHUD(ctx, score, lives, canvasWidth, canvasHeight);

  // --- Overlay screens (Ready, Won, Lost) ---
  if (phase === 'waiting') drawOverlay(ctx, 'READY', 'Click or press SPACE to launch', '#0a84ff', canvasWidth, canvasHeight);
  if (phase === 'won') drawOverlay(ctx, 'YOU WIN!', `Score: ${score} — press SPACE to play again`, '#ffd60a', canvasWidth, canvasHeight);
  if (phase === 'lost') drawOverlay(ctx, 'GAME OVER', `Final score: ${score} — press SPACE to restart`, '#ff2d55', canvasWidth, canvasHeight);
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, lives: number, canvasWidth: number, canvasHeight: number) {
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';

  // Score display
  ctx.fillText(`SCORE  ${score.toString().padStart(6, '0')}`, 12, 14);

  // Lives display (as small balls)
  ctx.textAlign = 'right';
  ctx.shadowColor = '#0a84ff';
  ctx.shadowBlur = 8;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.18; // Dim inactive lives
    ctx.fillStyle = '#0a84ff';
    ctx.beginPath();
    // Position lives on the right side, spaced out
    ctx.arc(canvasWidth - 14 - i * 20, 20, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}
