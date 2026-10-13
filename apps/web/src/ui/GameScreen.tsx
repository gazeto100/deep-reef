import { mountSlotScene } from '@framework/pixi/PresentationController';
import { PixiCanvas } from '@framework/react/PixiCanvas';
import { useSlotDispatch, useSlotSelector, useSlotStore } from '@framework/state/hooks';
import { primaryAction, startSession } from '@framework/state/thunks';
import { DEEP_REEF_THEME } from '@games/deep-reef/theme';
import { useEffect } from 'react';
import { Hud } from './Hud';
import { errorMessage, T } from './strings';

export function GameScreen() {
  const store = useSlotStore();
  const dispatch = useSlotDispatch();
  const session = useSlotSelector((s) => s.session);
  const faultsActive = useSlotSelector((s) => s.settings.faultsActive);

  // Space bar = main button (spin / stop), except while a control has keyboard focus.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      void dispatch(primaryAction());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  return (
    <div className="game">
      <header className="game-header">
        <span className="game-title">{T.title}</span>
        <span className="badge badge-demo">{T.demo}</span>
        {faultsActive && (
          <span className="badge badge-faults" title={T.faultsHint} data-testid="faults-badge">
            {T.faults}
          </span>
        )}
      </header>

      <main className="game-stage">
        {session.status === 'ready' ? (
          <PixiCanvas
            className="pixi-stage"
            options={{ backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio }}
            onReady={(app) => mountSlotScene(app, store, DEEP_REEF_THEME)}
          />
        ) : (
          <div className="stage-message" role="status">
            {session.status === 'failed' && session.error ? (
              <>
                <p>{errorMessage(session.error)}</p>
                <button type="button" onClick={() => void dispatch(startSession())}>
                  {T.retry}
                </button>
              </>
            ) : (
              <p>{T.connecting}</p>
            )}
          </div>
        )}
      </main>

      <Hud />
    </div>
  );
}
