import { GameServerError } from '@deep-reef/contract/errors';
import type { GameServer, RequestOptions } from '@deep-reef/contract/GameServer';
import type { Session, GameConfig, SpinRequest, SpinResponse } from '@deep-reef/contract/schemas';
import { SlotEngine } from '@deep-reef/math/engine/SlotEngine';
import type { GameDefinition } from '@deep-reef/math/engine/types';
import type { Rng } from '@deep-reef/math/rng/Rng';
import type { SessionStore } from './ports';
import { toGameConfig, toRound } from './toContract';

export const DEFAULT_STARTING_BALANCE = 10_000;

export interface GameServiceOptions<S extends string> {
  readonly definition: GameDefinition<S>;
  readonly store: SessionStore;
  /** Source of outcomes: CryptoRng in production, a seeded Rng in tests. */
  readonly rng: Rng;
  /** UUID generator for session and round ids (e.g. `() => crypto.randomUUID()`). */
  readonly newId: () => string;
  readonly startingBalance?: number;
}

/**
 * The game core: sessions, wallet and idempotent spins. It knows nothing about HTTP or
 * the browser. The in-browser mock calls it directly; the Node server (phase 3b) puts a
 * Fastify transport in front of it.
 *
 * It implements GameServer itself, so the same contract (and the same conformance
 * tests) applies at every layer. Request options such as abort signals belong to
 * transports and are ignored here.
 */
export class GameService<S extends string> implements GameServer {
  readonly config: GameConfig;
  private readonly engine: SlotEngine<S>;
  private readonly betLevels: ReadonlySet<number>;
  private readonly store: SessionStore;
  private readonly rng: Rng;
  private readonly newId: () => string;
  private readonly startingBalance: number;

  constructor(options: GameServiceOptions<S>) {
    this.engine = new SlotEngine(options.definition);
    this.config = toGameConfig(options.definition);
    this.betLevels = new Set(options.definition.betLevels);
    this.store = options.store;
    this.rng = options.rng;
    this.newId = options.newId;
    this.startingBalance = options.startingBalance ?? DEFAULT_STARTING_BALANCE;
    if (!Number.isInteger(this.startingBalance) || this.startingBalance < 0) {
      throw new RangeError('startingBalance must be a non-negative integer');
    }
  }

  async createSession(_options?: RequestOptions): Promise<Session> {
    const sessionId = this.newId();
    await this.store.create({ id: sessionId, balance: this.startingBalance });
    return { sessionId, balance: this.startingBalance, config: this.config };
  }

  async getSession(sessionId: string, _options?: RequestOptions): Promise<Session> {
    const session = await this.store.find(sessionId);
    if (!session) throw new GameServerError('SESSION_NOT_FOUND', `no session ${sessionId}`);
    return { sessionId: session.id, balance: session.balance, config: this.config };
  }

  /**
   * Debit, play and credit in one atomic step. Repeating a requestId returns the stored
   * response with `replayed: true` (never a second charge); repeating it with a different
   * bet is an IDEMPOTENCY_CONFLICT. Rejected requests change nothing and are not stored,
   * so they can simply be retried.
   */
  async spin(sessionId: string, request: SpinRequest, _options?: RequestOptions): Promise<SpinResponse> {
    const { requestId, bet } = request;
    this.validate(requestId, bet);

    return this.store.transaction(sessionId, async (tx) => {
      const previous = await tx.findSpin(requestId);
      if (previous) {
        if (previous.bet !== bet) {
          throw new GameServerError(
            'IDEMPOTENCY_CONFLICT',
            `requestId was already used with bet ${previous.bet}, not ${bet}`,
            { requestId },
          );
        }
        return { ...previous.response, replayed: true };
      }

      const balanceBefore = tx.session.balance;
      if (balanceBefore < bet) {
        throw new GameServerError('INSUFFICIENT_FUNDS', `balance ${balanceBefore} is lower than bet ${bet}`, {
          requestId,
        });
      }

      // The whole round, free spins included, is decided here, before anything is shown.
      const round = this.engine.playRound(bet, this.rng);
      const balanceAfter = balanceBefore - bet + round.totalWin;
      const response: SpinResponse = {
        requestId,
        roundId: this.newId(),
        bet,
        win: round.totalWin,
        balanceBefore,
        balanceAfter,
        replayed: false,
        round: toRound(round),
      };
      tx.recordSpin({ requestId, bet, response }, balanceAfter);
      return response;
    });
  }

  /** Defensive checks; transports validate the schema first, but the core never trusts them. */
  private validate(requestId: string, bet: number): void {
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 100) {
      throw new GameServerError('VALIDATION_ERROR', 'requestId must be a non-empty string');
    }
    if (!Number.isInteger(bet) || bet <= 0) {
      throw new GameServerError('VALIDATION_ERROR', 'bet must be a positive integer', { requestId });
    }
    if (!this.betLevels.has(bet)) {
      throw new GameServerError('INVALID_BET', `bet must be one of ${[...this.betLevels].join(', ')}`, { requestId });
    }
  }
}
