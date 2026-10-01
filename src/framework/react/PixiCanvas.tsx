import { Application, type ApplicationOptions } from 'pixi.js';
import { useEffect, useEffectEvent, useRef } from 'react';
import { PixiHost, type PixiHostEvent } from '../pixi/PixiHost';

export interface PixiCanvasProps {
  /** Read once, when the canvas mounts. Changing it later does not re-create the app. */
  readonly options?: Partial<ApplicationOptions>;
  /** Called once the app is initialised and its canvas is in the DOM. */
  readonly onReady?: (app: Application) => void;
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

    const host = new PixiHost(() => new Application(), handleEvent);
    host
      .mount(container, { resizeTo: container, ...initialOptions.current })
      .then((app) => {
        if (app) handleReady(app);
      })
      .catch((error: unknown) => {
        console.error('Pixi failed to initialise', error);
      });

    return () => {
      host.dispose();
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
