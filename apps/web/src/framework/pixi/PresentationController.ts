import type { SpinOutcome, SpinResponse } from '@deep-reef/contract/schemas';
import type { Application, Ticker } from 'pixi.js';
import { freeSpinProgress, presentationFinished } from '../state/actions';
import type { SlotState, SlotStore } from '../state/store';
import { Hurry } from './Hurry';
import type { ReelTimings } from './ReelSet';
import { SlotScene, SYMBOL_SIZE } from './SlotScene';
import { createSymbolTextures, type SymbolTheme } from './SymbolTextures';

interface PresentationTimings extends ReelTimings {
  readonly winShowMs: number;
  readonly freeSpinsIntroMs: number;
}

export const NORMAL_TIMINGS: PresentationTimings = {
  speedPxPerMs: 2.4,
  minSpinMs: 700,
  stopStaggerMs: 160,
  winShowMs: 1600,
  freeSpinsIntroMs: 1200,
};

export const TURBO_TIMINGS: PresentationTimings = {
  speedPxPerMs: 3.6,
  minSpinMs: 250,
  stopStaggerMs: 50,
  winShowMs: 700,
  freeSpinsIntroMs: 500,
};

/**
 * The adapter between the Redux store and the Pixi scene. React and Pixi are two views of
 * one state: this class turns state transitions into animations, and reports back only
 * through actions (freeSpinProgress, presentationFinished).
 *
 * - idle -> requesting: reels start at once (no waiting for the server);
 * - requesting -> presenting: reels land on the server's grid, wins are shown, free spins
 *   are played back, then presentationFinished credits the win;
 * - requesting -> idle (request failed): reels stop on the previous grid;
 * - a hurry press slams the reels or skips the wins; turbo shortens every timing;
 * - when the page is hidden (tab switched, phone locked) the round is fast-forwarded to
 *   its end: browsers pause requestAnimationFrame in hidden pages, and a round must not
 *   hang half-presented with the win not yet credited.
 *
 * Returns a dispose function for the React boundary.
 */
export function mountSlotScene(app: Application, store: SlotStore, theme: SymbolTheme): () => void {
  const config = store.getState().session.config;
  if (!config) throw new Error('mountSlotScene needs a ready session');

  const textures = createSymbolTextures(app.renderer, config.symbols, theme, SYMBOL_SIZE);
  const scene = new SlotScene(config, textures);
  app.stage.addChild(scene);

  let lastGrid: readonly (readonly string[])[] | null = store.getState().round.result?.round.base.grid ?? null;
  if (lastGrid) scene.reelSet.show(lastGrid);

  // Refit whenever the canvas size changes (resizeTo follows the container: rotation, window resize).
  let fittedFor = '';
  const tick = (ticker: Ticker): void => {
    const size = `${app.screen.width}x${app.screen.height}`;
    if (size !== fittedFor) {
      fittedFor = size;
      scene.fit(app.screen.width, app.screen.height);
    }
    scene.reelSet.update(ticker.deltaMS);
  };
  app.ticker.add(tick);

  const hurry = new Hurry();
  const pageHidden = (): boolean => document.hidden;
  const onVisibilityChange = (): void => {
    if (document.hidden) hurry.press(); // cut the running step; the rest checks pageHidden()
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  const timings = (): PresentationTimings => (store.getState().settings.turbo ? TURBO_TIMINGS : NORMAL_TIMINGS);
  let previous: SlotState = store.getState();
  let presentedRequestId: string | null = null;
  let spinStartedAt = 0;
  let disposed = false;

  const startReels = (): void => {
    scene.winPresenter.clear();
    scene.reelSet.start(timings());
    spinStartedAt = performance.now();
  };

  /** Lets the reels spin their minimum time, then stops them; a press slams them. */
  const landReels = async (grid: readonly (readonly string[])[], slamNow: boolean): Promise<void> => {
    const remaining = timings().minSpinMs - (performance.now() - spinStartedAt);
    if (slamNow || pageHidden() || (remaining > 0 && (await hurry.wait(remaining)) === 'hurried')) {
      scene.reelSet.slam(grid);
    } else {
      await scene.reelSet.stop(grid, timings(), hurry);
      if (pageHidden()) scene.reelSet.slam(grid); // hidden mid-stop: the ticker may be paused
    }
    lastGrid = grid;
  };

  const showWins = (spin: SpinOutcome): Promise<void> =>
    pageHidden() ? Promise.resolve() : scene.winPresenter.show(spin, timings().winShowMs, hurry);

  const present = async (result: SpinResponse): Promise<void> => {
    const { base, freeSpins } = result.round;
    // A press while we were still waiting for the server means "slam as soon as it lands".
    await landReels(base.grid, store.getState().round.hurryCount > 0);
    if (disposed) return;
    await showWins(base);

    if (freeSpins && !disposed) {
      let awarded = base.scatter?.freeSpinsAwarded ?? freeSpins.awarded;
      let win = base.win;
      store.dispatch(freeSpinProgress({ index: 0, total: awarded, win }));
      if (!pageHidden()) await hurry.wait(timings().freeSpinsIntroMs);

      for (const [i, spin] of freeSpins.spins.entries()) {
        if (disposed) return;
        store.dispatch(freeSpinProgress({ index: i + 1, total: awarded, win }));
        startReels();
        await landReels(spin.grid, false);
        win += spin.win;
        awarded += spin.scatter?.freeSpinsAwarded ?? 0;
        store.dispatch(freeSpinProgress({ index: i + 1, total: awarded, win }));
        await showWins(spin);
      }
    }
    if (!disposed) store.dispatch(presentationFinished());
  };

  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    const before = previous;
    previous = state;

    if (state.round.hurryCount > before.round.hurryCount) hurry.press();

    if (before.round.phase === 'idle' && state.round.phase === 'requesting') startReels();

    if (before.round.phase === 'requesting' && state.round.phase === 'idle' && lastGrid) {
      scene.reelSet.slam(lastGrid); // the request failed: back to what was on screen
    }

    const { result, requestId } = state.round;
    if (state.round.phase === 'presenting' && result && requestId !== presentedRequestId) {
      presentedRequestId = requestId;
      present(result).catch((error: unknown) => {
        console.error('presentation failed', error);
        if (!disposed) store.dispatch(presentationFinished()); // never leave the round stuck
      });
    }
  });

  return () => {
    disposed = true;
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    hurry.press();
    app.ticker.remove(tick);
    // Unmounting mid-round must not lose the win: finish the round in state.
    if (store.getState().round.phase === 'presenting') store.dispatch(presentationFinished());
    scene.destroy({ children: true });
    for (const texture of textures.values()) texture.destroy(true);
  };
}
