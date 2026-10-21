// lib/game/renderer.ts
import { GameState, RenderContext } from "./types";
import { POWERUP_META } from "./engine";
import { SHAKE_MAGNITUDE } from "./constants";

// Helper to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  titleColor: string,
  width: number,
  height: number,
) {
  // Semi-transparent background overlay
  ctx.fillStyle = "rgba(10,10,20,0.75)";
  ctx.fillRect(0, height / 2 - 72, width, 144);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Title text
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.fillStyle = titleColor;
  ctx.shadowColor = titleColor;
  ctx.shadowBlur = 24;
  ctx.fillText(title, width / 2, height / 2 - 20);

  // Subtitle text
  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.shadowBlur = 0;
  ctx.fillText(subtitle, width / 2, height / 2 + 20);
}

export function drawFrame(renderContext: RenderContext, state: GameState) {
  const { ctx, canvasWidth, canvasHeight } = renderContext;
  const {
    paddle,
    balls,
    bricks,
    phase,
    particles,
    popups,
    powerups,
    lasers,
    activePowerups,
    level,
    levelTransitionFrames,
    shake,
    fireballActive,
  } = state;

  // --- Screen shake transform ---
  // Apply a random offset decaying over shake frames; restore after draw.
  const shakeActive = shake > 0;
  if (shakeActive) {
    const intensity = (shake / 6) * SHAKE_MAGNITUDE;
    const ox = (Math.random() * 2 - 1) * intensity;
    const oy = (Math.random() * 2 - 1) * intensity;
    ctx.save();
    ctx.translate(ox, oy);
  }

  // --- Background ---
  ctx.clearRect(-SHAKE_MAGNITUDE, -SHAKE_MAGNITUDE, canvasWidth + SHAKE_MAGNITUDE * 2, canvasHeight + SHAKE_MAGNITUDE * 2);
  const bg = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(1, "#0d0d24");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // --- Grid dots for subtle texture ---
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  for (let gx = 16; gx < canvasWidth; gx += 32) {
    for (let gy = 16; gy < canvasHeight; gy += 32) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Bricks ---
  bricks.forEach((b) => {
    if (!b.alive) return;

    const alpha = b.hits / b.maxHits;

    ctx.shadowColor = b.fill;
    ctx.shadowBlur = 6;

    ctx.globalAlpha = 0.4 + alpha * 0.6;
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grad.addColorStop(0, b.stroke);
    grad.addColorStop(1, b.fill);
    ctx.fillStyle = grad;
    roundRect(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.fill();

    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = b.stroke;
    ctx.lineWidth = 1;
    roundRect(ctx, b.x, b.y, b.w, b.h, 3);
    ctx.stroke();

    if (b.maxHits > 1) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Courier New";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 0;
      ctx.fillText(b.hits.toString(), b.x + b.w / 2, b.y + b.h / 2);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  });

  // --- Particles ---
  particles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // --- Falling Powerups ---
  powerups.forEach((pu) => {
    if (!pu.active) return;
    const meta = POWERUP_META[pu.type];

    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.92;

    // Capsule body
    roundRect(ctx, pu.x, pu.y, pu.w, pu.h, 4);
    ctx.fillStyle = meta.color + "99"; // semi-transparent fill
    ctx.fill();
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, pu.x, pu.y, pu.w, pu.h, 4);
    ctx.stroke();

    // Letter label
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(meta.label, pu.x + pu.w / 2, pu.y + pu.h / 2);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // --- Lasers ---
  lasers.forEach((l) => {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ff3b30";
    ctx.shadowColor = "#ff3b30";
    ctx.shadowBlur = 8;
    ctx.fillRect(l.x, l.y, l.w, l.h);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // --- Score Popups ---
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowBlur = 0;
  popups.forEach((popup) => {
    ctx.globalAlpha = popup.life;
    // Combo popups get a gold tint
    ctx.fillStyle = popup.text.includes("x") ? "#ffd60a" : "#ffffff";
    ctx.fillText(popup.text, popup.x, popup.y);
  });
  ctx.globalAlpha = 1;

  // --- Paddle ---
  // Tint paddle if widen or sticky is active
  const widenActive = activePowerups.some((a) => a.type === "widen");
  const stickyActive = activePowerups.some((a) => a.type === "sticky");
  const laserActive = activePowerups.some((a) => a.type === "laser");

  let paddleTopColor = "#a0c4ff";
  let paddleBottomColor = "#0a84ff";
  let paddleGlowColor = "#0a84ff";
  if (widenActive) {
    paddleTopColor = "#a8ffb4";
    paddleBottomColor = "#30d158";
    paddleGlowColor = "#30d158";
  } else if (stickyActive) {
    paddleTopColor = "#fff5b4";
    paddleBottomColor = "#ffd60a";
    paddleGlowColor = "#ffd60a";
  } else if (laserActive) {
    paddleTopColor = "#ffb3b0";
    paddleBottomColor = "#ff3b30";
    paddleGlowColor = "#ff3b30";
  }

  const pGrad = ctx.createLinearGradient(
    paddle.x, paddle.y, paddle.x, paddle.y + paddle.h,
  );
  pGrad.addColorStop(0, paddleTopColor);
  pGrad.addColorStop(1, paddleBottomColor);
  ctx.fillStyle = pGrad;
  ctx.shadowColor = paddleGlowColor;
  ctx.shadowBlur = 16;
  roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 6);
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- Balls ---
  if (phase !== "lost" && phase !== "won") {
    balls.forEach((ball) => {
      const ballGrad = ctx.createRadialGradient(
        ball.x - ball.r * 0.3,
        ball.y - ball.r * 0.3,
        1,
        ball.x,
        ball.y,
        ball.r,
      );
      ballGrad.addColorStop(0, "#ffffff");
      ballGrad.addColorStop(0.5, fireballActive ? "#ffd27f" : "#a0c4ff");
      ballGrad.addColorStop(1, fireballActive ? "#ff6a00" : "#0a84ff");
      ctx.fillStyle = ballGrad;
      ctx.shadowColor = fireballActive ? "#ff8c2b" : "#60afff";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  // --- Active powerup pills (bottom-left); the React overlay draws the main HUD ---
  drawActivePowerups(ctx, activePowerups, canvasHeight);

  // --- Overlay screens ---
  if (phase === "waiting")
    drawOverlay(
      ctx, "READY",
      "Click or press SPACE to launch",
      "#0a84ff",
      canvasWidth, canvasHeight,
    );
  // won/lost are handled by the React GameOverPanel overlay (run stats, name
  // entry, replay) — no canvas overlay needed here.
  if (phase === "paused")
    drawOverlay(
      ctx, "PAUSED",
      "Press ESC or P to resume",
      "#ffd60a",
      canvasWidth, canvasHeight,
    );
  if (phase === "levelTransition")
    drawLevelTransition(ctx, level, levelTransitionFrames, canvasWidth, canvasHeight);

  // --- Restore shake transform ---
  if (shakeActive) {
    ctx.restore();
  }
}

function drawLevelTransition(
  ctx: CanvasRenderingContext2D,
  level: number,
  framesLeft: number,
  width: number,
  height: number,
) {
  // Fade in / fade out
  const progress = framesLeft / 90; // 0 = just started fading out, 1 = just appeared
  const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;

  ctx.globalAlpha = Math.min(alpha, 0.9);
  ctx.fillStyle = "rgba(10,10,20,0.85)";
  ctx.fillRect(0, height / 2 - 72, width, 144);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = 'bold 44px "Courier New", monospace';
  ctx.fillStyle = "#ffd60a";
  ctx.shadowColor = "#ffd60a";
  ctx.shadowBlur = 28;
  ctx.fillText(`LEVEL ${level}`, width / 2, height / 2 - 18);

  ctx.font = '13px "Courier New", monospace';
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.shadowBlur = 0;
  ctx.fillText("Get ready!", width / 2, height / 2 + 22);

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// Active powerup pills (bottom-left strip). Score/lives/level/combo are drawn by
// the React HUD overlay — keeping them here too would double-draw and overlap.
function drawActivePowerups(
  ctx: CanvasRenderingContext2D,
  activePowerups: GameState["activePowerups"],
  canvasHeight: number,
) {
  ctx.textBaseline = "top";
  ctx.shadowBlur = 0;

  if (activePowerups.length > 0) {
    const PILL_W = 28;
    const PILL_H = 12;
    const PILL_GAP = 4;
    const startX = 12;
    const startY = canvasHeight - 20;

    activePowerups.forEach((ap, idx) => {
      const meta = POWERUP_META[ap.type];
      const px = startX + idx * (PILL_W + PILL_GAP);

      // Background pill
      ctx.globalAlpha = 0.85;
      roundRect(ctx, px, startY - PILL_H, PILL_W, PILL_H, 3);
      ctx.fillStyle = meta.color + "55";
      ctx.fill();
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 1;
      roundRect(ctx, px, startY - PILL_H, PILL_W, PILL_H, 3);
      ctx.stroke();

      // Depletion bar
      const barWidth = (ap.framesLeft / 900) * PILL_W;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = meta.color;
      ctx.fillRect(px, startY - 3, barWidth, 2);

      // Label
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = 'bold 8px "Courier New", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.label, px + PILL_W / 2, startY - PILL_H / 2);
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
