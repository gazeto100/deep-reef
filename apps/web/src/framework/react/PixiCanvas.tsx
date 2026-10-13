import { Application, type ApplicationOptions } from 'pixi.js';
import { useEffect, useEffectEvent, useRef } from 'react';
import { PixiHost, type PixiHostEvent } from '../pixi/PixiHost';

export interface PixiCanvasProps {
  /** Read once, when the canvas mounts. Changing it later does not re-create the app. */
  readonly options?: Partial<ApplicationOptions>;
  /**
   * Called once the app is initialised and its canvas is in the DOM. It may return a
   * cleanup function, which runs before the app is destroyed (e.g. to unsubscribe a
   * scene from the store).
   */
  readonly onReady?: (app: Application) => void | (() => void);
  readonly onEvent?: (event: PixiHostEvent) => void;
  readonly className?: string;
}

/**
 * React boundary for a Pixi Application. React owns the container `<div>`; Pixi owns
 * everything inside it. Each mount gets a fresh PixiHost, so StrictMode's double
 * mount and fast remounts never leak a canvas or a WebGL context.
 */
export function PixiCanvas({ options, onReady, onEvent, className }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialOptions = useRef(options);

  // Effect events always see the latest callbacks without re-running the mount effect.
  const handleReady = useEffectEvent((app: Application) => onReady?.(app));
  const handleEvent = useEffectEvent((event: PixiHostEvent) => onEvent?.(event));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    const host = new PixiHost(() => new Application(), handleEvent);
    host
      .mount(container, {
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
        ...initialOptions.current,
      })
      .then((app) => {
        if (!app) return; // disposed during init: nothing was mounted
        // Follow the container, not the window: Pixi's resizeTo only listens to window
        // resize, so layout changes (a scrollbar appearing, the HUD reflowing) left the
        // canvas at its old size and caused horizontal scrolling.
        observer = new ResizeObserver(() => {
          app.renderer.resize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
        });
        observer.observe(container);
        const result = handleReady(app);
        if (typeof result === 'function') cleanup = result;
      })
      .catch((error: unknown) => {
        console.error('Pixi failed to initialise', error);
      });

    return () => {
      observer?.disconnect();
      cleanup?.();
      host.dispose();
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
