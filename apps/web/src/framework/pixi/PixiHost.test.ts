// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PixiHost, type PixiApplicationLike, type PixiHostEvent } from './PixiHost';

/** Fake Pixi app: init() resolves only when the test says so, destroy() removes the canvas like Pixi does. */
class FakeApp implements PixiApplicationLike {
  readonly canvas = document.createElement('canvas');
  destroyed = false;
  private resolveInit: () => void = () => undefined;

  init(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveInit = resolve;
    });
  }

  finishInit(): void {
    this.resolveInit();
  }

  destroy(rendererDestroyOptions?: unknown): void {
    this.destroyed = true;
    if (
      typeof rendererDestroyOptions === 'object' &&
      rendererDestroyOptions !== null &&
      'removeView' in rendererDestroyOptions
    ) {
      this.canvas.remove();
    }
  }
}

function setup(): { host: PixiHost<FakeApp>; app: FakeApp; container: HTMLDivElement; events: PixiHostEvent[] } {
  const app = new FakeApp();
  const events: PixiHostEvent[] = [];
  const host = new PixiHost(
    () => app,
    (e) => events.push(e),
  );
  return { host, app, container: document.createElement('div'), events };
}

describe('PixiHost', () => {
  it('attaches the canvas once init() resolves, and removes it on dispose()', async () => {
    const { host, app, container, events } = setup();
    const mounting = host.mount(container);
    expect(container.querySelector('canvas')).toBeNull(); // not before init finishes

    app.finishInit();
    await expect(mounting).resolves.toBe(app);
    expect(container.querySelectorAll('canvas')).toHaveLength(1);

    host.dispose();
    expect(app.destroyed).toBe(true);
    expect(container.querySelector('canvas')).toBeNull();
    expect(events).toEqual(['init', 'mounted', 'destroyed']);
  });

  it('never attaches a canvas when disposed during init (StrictMode double mount)', async () => {
    const { host, app, container, events } = setup();
    const mounting = host.mount(container);

    host.dispose(); // React cleanup runs before init() resolves
    app.finishInit();

    await expect(mounting).resolves.toBeNull();
    expect(app.destroyed).toBe(true);
    expect(container.querySelector('canvas')).toBeNull();
    expect(events).toEqual(['init', 'aborted']);
  });

  it('does not create an app when disposed before mount()', async () => {
    const create = vi.fn(() => new FakeApp());
    const host = new PixiHost(create);
    host.dispose();
    await expect(host.mount(document.createElement('div'))).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('is single-use and dispose() is idempotent', async () => {
    const { host, app, container, events } = setup();
    const mounting = host.mount(container);
    app.finishInit();
    await mounting;
    await expect(host.mount(container)).rejects.toThrow('only be called once');
    host.dispose();
    host.dispose();
    expect(events.filter((e) => e === 'destroyed')).toHaveLength(1);
  });
});
