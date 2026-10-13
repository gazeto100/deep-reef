import { PixiCanvas } from '@framework/react/PixiCanvas';
import type { PixiHostEvent } from '@framework/pixi/PixiHost';
import { Graphics, type Application } from 'pixi.js';
import { useState } from 'react';

/**
 * Composition root. In phase 2 it is only a harness that proves the Pixi canvas mounts
 * and unmounts cleanly: toggle it and watch the lifecycle log and the canvas count.
 * The real UI arrives in phase 4.
 */
export function App() {
  const [mounted, setMounted] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [canvases, setCanvases] = useState(0);

  const record = (event: PixiHostEvent): void => {
    setLog((entries) => [...entries.slice(-11), event]);
    setCanvases(document.querySelectorAll('canvas').length);
  };

  const toggle = (): void => {
    setMounted((m) => !m);
    // The DOM updates after this render; count on the next frame.
    requestAnimationFrame(() => setCanvases(document.querySelectorAll('canvas').length));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: 8, fontSize: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Deep Reef: phase 2 shell</strong>
        <button type="button" onClick={toggle}>
          {mounted ? 'Unmount Pixi' : 'Mount Pixi'}
        </button>
        <span data-testid="canvas-count">canvases in DOM: {canvases}</span>
        <span data-testid="lifecycle-log">log: {log.join(' → ') || '—'}</span>
      </div>
      {mounted && (
        <PixiCanvas
          className="pixi-stage"
          options={{ background: '#06263f', antialias: true }}
          onEvent={record}
          onReady={drawPlaceholder}
        />
      )}
    </div>
  );
}

/** A 5x3 placeholder grid, just to show the stage renders. */
function drawPlaceholder(app: Application): void {
  const grid = new Graphics();
  const cell = 64;
  const gap = 8;
  for (let reel = 0; reel < 5; reel++) {
    for (let row = 0; row < 3; row++) {
      grid.roundRect(reel * (cell + gap), row * (cell + gap), cell, cell, 10).fill({ color: 0x1b6fa8, alpha: 0.6 });
    }
  }
  grid.position.set((app.screen.width - grid.width) / 2, (app.screen.height - grid.height) / 2);
  app.stage.addChild(grid);
}
