import { selectBet, selectDisplayedWin, selectPrimaryAction } from '@framework/state/selectors';
import { betDecreased, betIncreased, turboToggled } from '@framework/state/slices';
import { useSlotDispatch, useSlotSelector } from '@framework/state/hooks';
import { primaryAction, resetSession } from '@framework/state/thunks';
import { credits, errorMessage, T } from './strings';

/** Stable fallback: a fresh [] per call would make the selector re-render on every store update. */
const NO_LEVELS: readonly number[] = [];

/** Controls and readouts below the reels. All decisions come from state; this only renders and dispatches. */
export function Hud() {
  const dispatch = useSlotDispatch();
  const balance = useSlotSelector((s) => s.wallet.balance);
  const win = useSlotSelector(selectDisplayedWin);
  const bet = useSlotSelector(selectBet);
  const levels = useSlotSelector((s) => s.session.config?.betLevels ?? NO_LEVELS);
  const levelIndex = useSlotSelector((s) => s.bet.levelIndex);
  const action = useSlotSelector(selectPrimaryAction);
  const idle = useSlotSelector((s) => s.round.phase === 'idle');
  const turbo = useSlotSelector((s) => s.settings.turbo);
  const round = useSlotSelector((s) => s.round);

  const status = round.retrying
    ? T.reconnecting(round.retrying.attempt)
    : round.freeSpins
      ? T.freeSpins(round.freeSpins.index, round.freeSpins.total)
      : round.error
        ? errorMessage(round.error)
        : idle && balance < bet
          ? T.lowBalance
          : '';

  return (
    <div className="hud">
      <div className={`hud-status${round.freeSpins ? ' is-feature' : ''}`} role="status" aria-live="polite">
        {status}
      </div>

      <div className="hud-meters">
        <div className="meter">
          <span className="meter-label">{T.balance}</span>
          <span className="meter-value" data-testid="balance">
            {credits(balance)}
          </span>
        </div>
        <div className="meter">
          <span className="meter-label">{T.win}</span>
          <span className="meter-value" data-testid="win">
            {credits(win)}
          </span>
        </div>
      </div>

      <div className="hud-controls">
        <div className="bet">
          <button
            type="button"
            aria-label={T.decreaseBet}
            disabled={!idle || levelIndex === 0}
            onClick={() => dispatch(betDecreased())}
          >
            −
          </button>
          <div className="meter">
            <span className="meter-label">{T.bet}</span>
            <span className="meter-value" data-testid="bet">
              {credits(bet)}
            </span>
          </div>
          <button
            type="button"
            aria-label={T.increaseBet}
            disabled={!idle || levelIndex >= levels.length - 1}
            onClick={() => dispatch(betIncreased(levels.length))}
          >
            +
          </button>
        </div>

        <button
          type="button"
          className={`spin${action === 'hurry' ? ' is-stop' : ''}`}
          disabled={action === 'disabled'}
          onClick={() => void dispatch(primaryAction())}
          data-testid="spin"
        >
          {action === 'hurry' ? T.stop : T.spin}
        </button>

        <div className="hud-side">
          <button
            type="button"
            className={`toggle${turbo ? ' is-on' : ''}`}
            aria-pressed={turbo}
            onClick={() => dispatch(turboToggled())}
          >
            {T.turbo}
          </button>
          <button type="button" className="link" disabled={!idle} onClick={() => void dispatch(resetSession())}>
            {T.reset}
          </button>
        </div>
      </div>
    </div>
  );
}
