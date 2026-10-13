import type { ApplicationOptions, DestroyOptions, RendererDestroyOptions } from 'pixi.js';

/** The part of pixi.js `Application` that PixiHost relies on (lets tests use a fake). */
export interface PixiApplicationLike {
  readonly canvas: HTMLCanvasElement;
  init(options?: Partial<ApplicationOptions>): Promise<void>;
  destroy(rendererDestroyOptions?: RendererDestroyOptions, options?: DestroyOptions): void;
}

export type PixiHostEvent =
  /** init() started. */
  | 'init'
  /** init() finished and the canvas is in the DOM. */
  | 'mounted'
  /** dispose() ran while init() was pending; the app was destroyed without touching the DOM. */
  | 'aborted'
  /** dispose() destroyed a mounted app and removed its canvas. */
  | 'destroyed';

/**
 * Owns one Pixi Application for one mount of a DOM container.
 *
 * Pixi v8 initialises asynchronously (`await app.init()`), but a host can be disposed
 * at any moment. In development, React StrictMode deliberately mounts, unmounts and
 * re-mounts every effect. Without care, that leaks a second canvas or a WebGL context.
 * PixiHost handles it: if dispose() lands while init() is still pending, the app is
 * destroyed as soon as init() resolves and its canvas is never attached.
 *
 * A host is single-use: create a new one for every mount.
 */
export class PixiHost<A extends PixiApplicationLike = PixiApplicationLike> {
  private app: A | null = null;
  private disposed = false;
  private started = false;

  constructor(
    private readonly createApp: () => A,
    private readonly onEvent?: (event: PixiHostEvent) => void,
  ) {}

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Resolves with the mounted app, or null if the host was disposed during init. */
  async mount(container: HTMLElement, options?: Partial<ApplicationOptions>): Promise<A | null> {
    if (this.started) throw new Error('PixiHost.mount() can only be called once');
    this.started = true;
    if (this.disposed) return null;

    const app = this.createApp();
    this.onEvent?.('init');
    await app.init(options);

    if (this.disposed) {
      app.destroy({ removeView: true }, { children: true });
      this.onEvent?.('aborted');
      return null;
    }

    container.appendChild(app.canvas);
    this.app = app;
    this.onEvent?.('mounted');
    return app;
  }

  /** Idempotent. Safe to call before, during or after mount(). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.app) {
      this.app.destroy({ removeView: true }, { children: true });
      this.app = null;
      this.onEvent?.('destroyed');
    }
  }
}
