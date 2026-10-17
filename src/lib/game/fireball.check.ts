// Runnable check for the DX-Ball fireball power-up collision branch.
// No test framework in this repo; run standalone:
//   npx tsc src/lib/game/fireball.check.ts --outDir /tmp/dxcheck --module commonjs \
//     --moduleResolution node --esModuleInterop --skipLibCheck && node /tmp/dxcheck/fireball.check.js
//
// Asserts: fireball destroys a multi-hit brick in one pass WITHOUT bouncing;
// a normal ball neither destroys a 3-hit brick nor passes through it.
import assert from "node:assert";
import { buildInitialState, updateGame } from "./engine";
import type { Ball } from "./types";

const W = 480, H = 640;

function ballOnBrick(bx: number, by: number, bw: number, bh: number): Ball {
  // Sit at brick centre, drift up slowly so it stays overlapping during the step.
  return { x: bx + bw / 2, y: by + bh / 2, r: 8, vx: 0, vy: -0.1, stuck: false };
}

// --- Fireball: plows through a 3-hit brick, no bounce ---
{
  let s = buildInitialState(W, H, 1, 1, "normal");
  const b = s.bricks[0];
  assert.ok(b.maxHits >= 2, `expected a multi-hit brick, got ${b.maxHits}`);
  s = { ...s, phase: "playing", fireballActive: true, balls: [ballOnBrick(b.x, b.y, b.w, b.h)] };
  s = updateGame(s, {}, W, H);
  assert.strictEqual(s.bricks[0].alive, false, "fireball must destroy a 3-hit brick in one pass");
  assert.ok(s.balls[0].vy < 0, `fireball must not bounce (vy stays negative), got ${s.balls[0].vy}`);
}

// --- Normal ball: 3-hit brick survives, ball bounces downward ---
{
  let n = buildInitialState(W, H, 1, 1, "normal");
  const b = n.bricks[0];
  n = { ...n, phase: "playing", fireballActive: false, balls: [ballOnBrick(b.x, b.y, b.w, b.h)] };
  n = updateGame(n, {}, W, H);
  assert.strictEqual(n.bricks[0].alive, true, "normal hit must not destroy a 3-hit brick");
  assert.ok(n.balls[0].vy > 0, `normal ball must bounce downward, got ${n.balls[0].vy}`);
}

console.log("PASS: fireball plows through bricks; normal ball bounces");
