import type { GameConfig } from '@deep-reef/contract/schemas';
import { selectBet } from '@framework/state/selectors';
import { useSlotSelector } from '@framework/state/hooks';
import { DEEP_REEF_SYMBOL_IMAGES } from '@games/deep-reef/theme';
import { useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons';
import { credits, T } from './strings';

interface PaytableProps {
  readonly onClose: () => void;
}

/**
 * Game information: pays at the current bet, wild/scatter/free-spin rules, the 20
 * paylines and the RTP. Every number comes from the server's GameConfig, so the screen
 * stays correct for any game math.
 */
export function Paytable({ onClose }: PaytableProps) {
  const config = useSlotSelector((s) => s.session.config);
  const bet = useSlotSelector(selectBet);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!config) return null;
  const lineBet = bet / config.paylines.length;

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="paytable"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paytable-header">
          <h2 id={titleId}>{T.info.title}</h2>
          <button ref={closeRef} type="button" className="icon-button" aria-label={T.info.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <section>
          <h3>{T.info.pays}</h3>
          <p className="muted">{T.info.paysNote(credits(bet), credits(lineBet))}</p>
          <div className="pay-grid">
            {config.linePays.map(({ symbol, pays }) => (
              <div className="pay-card" key={symbol}>
                <SymbolImage symbol={symbol} />
                <ul>
                  {[...pays]
                    .sort((a, b) => b.count - a.count)
                    .map(({ count, multiplier }) => (
                      <li key={count}>
                        <span className="count">{count}×</span> {credits(multiplier * lineBet)}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="special">
          <div className="special-row">
            <SymbolImage symbol={config.wild} />
            <div>
              <h3>{T.info.wildTitle}</h3>
              <p>{T.info.wildText(reelList(config.wildReels))}</p>
            </div>
          </div>
          <div className="special-row">
            <SymbolImage symbol={config.scatter} />
            <div>
              <h3>{T.info.scatterTitle}</h3>
              <p>{T.info.scatterText}</p>
              <ul className="scatter-pays">
                {[...config.scatterPays]
                  .sort((a, b) => b.count - a.count)
                  .map(({ count, multiplier }) => (
                    <li key={count}>
                      <span className="count">{count}×</span> {credits(multiplier * bet)}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h3>{T.info.freeSpinsTitle}</h3>
          <p>{T.info.freeSpinsText(config.freeSpins)}</p>
        </section>

        <section>
          <h3>{T.info.linesTitle(config.paylines.length)}</h3>
          <p className="muted">{T.info.linesNote}</p>
          <div className="lines-grid">
            {config.paylines.map((line, index) => (
              <PaylineDiagram key={index} index={index} line={line} rows={config.rows} />
            ))}
          </div>
        </section>

        <section>
          <h3>{T.info.rulesTitle}</h3>
          <ul className="rules">
            {T.info.rules(config.maxWinMultiplier).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>

        <section className="rtp">
          <p>
            {T.info.rtp}: <strong>{formatRtp(config.rtp)}</strong> · {T.info.volatility}
          </p>
          <p className="muted">{T.info.demoNote}</p>
        </section>
      </div>
    </div>
  );
}

function SymbolImage({ symbol }: { readonly symbol: string }) {
  const src = DEEP_REEF_SYMBOL_IMAGES[symbol];
  return src ? <img className="pay-symbol" src={src} alt={symbol} width={64} height={64} /> : <span>{symbol}</span>;
}

function PaylineDiagram({ index, line, rows }: { index: number; line: readonly number[]; rows: number }) {
  const cell = 10;
  const gap = 2;
  const width = line.length * (cell + gap) - gap;
  const height = rows * (cell + gap) - gap;
  const centre = (reel: number, row: number): string =>
    `${reel * (cell + gap) + cell / 2},${row * (cell + gap) + cell / 2}`;
  return (
    <figure className="payline">
      <svg viewBox={`-1 -1 ${width + 2} ${height + 2}`} role="img" aria-label={T.info.lineLabel(index + 1)}>
        {line.map((_, reel) =>
          Array.from({ length: rows }, (__, row) => (
            <rect
              key={`${reel}-${row}`}
              x={reel * (cell + gap)}
              y={row * (cell + gap)}
              width={cell}
              height={cell}
              rx={2}
              className={line[reel] === row ? 'on' : 'off'}
            />
          )),
        )}
        <polyline points={line.map((row, reel) => centre(reel, row)).join(' ')} />
      </svg>
      <figcaption>{index + 1}</figcaption>
    </figure>
  );
}

function reelList(reels: readonly number[]): string {
  return reels.map((r) => r + 1).join(', ');
}

function formatRtp(rtp: GameConfig['rtp']): string {
  return `${new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 2 }).format(rtp * 100)}%`;
}
