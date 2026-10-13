// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];

/** Stand-in for pixi.js Application: no WebGL in jsdom. */
class FakeApplication {
  static last: FakeApplication | null = null;
  readonly canvas = document.createElement('canvas');
  readonly renderer = { resize: vi.fn((w: number, h: number) => log.push(`resize ${w}x${h}`)) };
  initOptions: unknown = null;

  constructor() {
    FakeApplication.last = this;
  }

  init(options: unknown): Promise<void> {
    this.initOptions = options;
    return Promise.resolve();
  }

  destroy(): void {
    log.push('destroy');
    this.canvas.remove();
  }
}

vi.mock('pixi.js', () => ({ Application: FakeApplication }));

class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  readonly callback: () => void;
  observed: Element | null = null;

  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.last = this;
  }

  observe(element: Element): void {
    this.observed = element;
  }

  disconnect(): void {
    log.push('disconnect');
  }
}

const { PixiCanvas } = await import('./PixiCanvas');

function setSize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
}

describe('PixiCanvas', () => {
  beforeEach(() => {
    log.length = 0;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('follows the container size, not the window, and cleans up in order', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onReady = vi.fn(() => () => log.push('scene cleanup'));

    await act(async () => {
      root.render(<PixiCanvas className="stage" onReady={onReady} />);
      await Promise.resolve(); // let the async mount settle
    });
    const container = host.querySelector<HTMLDivElement>('.stage');
    if (!container) throw new Error('container not rendered');

    expect(onReady).toHaveBeenCalledOnce();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(FakeResizeObserver.last?.observed).toBe(container);

    // A layout change with no window resize (e.g. a scrollbar appears): 1440 -> 1423.
    setSize(container, 1423, 665);
    FakeResizeObserver.last?.callback();
    expect(FakeApplication.last?.renderer.resize).toHaveBeenLastCalledWith(1423, 665);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    // The observer and the scene go first, then the app (and its canvas).
    expect(log.slice(-3)).toEqual(['disconnect', 'scene cleanup', 'destroy']);
    expect(container.querySelector('canvas')).toBeNull();
    host.remove();
  });
});
