import type { StateError } from '@framework/state/actions';

/** All user-facing text in one place (Bulgarian), ready for a translation layer later. */
export const T = {
  title: 'Deep Reef',
  demo: 'Демо — виртуални кредити',
  faults: 'Тестов режим: симулирани мрежови грешки',
  faultsHint: 'Махни ?faults=1 от адреса, за да го изключиш',
  balance: 'Баланс',
  win: 'Печалба',
  bet: 'Залог',
  spin: 'Завърти',
  stop: 'Стоп',
  turbo: 'Турбо',
  reset: 'Нулирай баланса',
  connecting: 'Свързване…',
  retry: 'Опитай отново',
  reconnecting: (attempt: number) => `Връзката се възстановява… (опит ${attempt + 1})`,
  freeSpins: (index: number, total: number) => `Безплатни завъртания ${index} / ${total}`,
  lowBalance: 'Балансът не стига за този залог. Намали залога или нулирай баланса.',
  decreaseBet: 'Намали залога',
  increaseBet: 'Увеличи залога',
  keyboardHint: 'Интервал: завъртане / стоп',
  spaceKey: 'интервал',
  infoButton: 'Правила и изплащания',
  info: {
    title: 'Правила и изплащания',
    close: 'Затвори',
    pays: 'Изплащания',
    paysNote: (bet: string, lineBet: string) =>
      `В кредити при текущия залог ${bet} (${lineBet} на линия). Печалбите по линии се умножават по залога на линия.`,
    wildTitle: 'Перла (wild)',
    wildText: (reels: string) =>
      `Замества всички символи освен сандъка. Появява се само на барабани ${reels}. Няма собствено изплащане.`,
    scatterTitle: 'Сандък (scatter)',
    scatterText: 'Плаща навсякъде на екрана, независимо от линиите. Изплащането е спрямо общия залог:',
    freeSpinsTitle: 'Безплатни завъртания',
    freeSpinsText: (fs: {
      triggerCount: number;
      awarded: number;
      retriggerAwarded: number;
      maxTotal: number;
      winMultiplier: number;
    }) =>
      `${fs.triggerCount} или повече сандъка дават ${fs.awarded} безплатни завъртания. По време на тях всички печалби се умножават по ${fs.winMultiplier}, а лентите имат повече перли. Нови ${fs.triggerCount}+ сандъка добавят още ${fs.retriggerAwarded} завъртания, общо до ${fs.maxTotal}. Залогът е същият като на завъртането, което ги е отключило.`,
    linesTitle: (n: number) => `${n} печеливши линии`,
    linesNote: 'Линиите са фиксирани и винаги активни.',
    lineLabel: (n: number) => `Линия ${n}`,
    rulesTitle: 'Правила',
    rules: (maxWin: number) => [
      'Печалба по линия: 3 или повече еднакви символа подред от най-левия барабан.',
      'На всяка линия се плаща само най-високата печалба; печалбите от различни линии се събират.',
      'Печалбата от сандъци се добавя към печалбите по линии.',
      `Максималната печалба от едно завъртане (заедно с безплатните) е ${credits(maxWin)} × общия залог. При достигането ѝ рундът приключва.`,
      'Резултатът се определя изцяло преди анимацията; бутонът „стоп“ само я съкращава.',
    ],
    rtp: 'Теоретична възвръщаемост (RTP)',
    volatility: 'волатилност: средна',
    demoNote: 'Демо версия: играе се само с виртуални кредити, без реални пари и без възможност за изплащане.',
  },
} as const;

export function errorMessage(error: StateError): string {
  switch (error.code) {
    case 'INSUFFICIENT_FUNDS':
      return 'Недостатъчен баланс за този залог.';
    case 'INVALID_BET':
      return 'Невалиден залог.';
    case 'TIMEOUT':
    case 'NETWORK_ERROR':
    case 'SERVICE_UNAVAILABLE':
    case 'INTERNAL_ERROR':
      return 'Няма връзка със сървъра. Балансът е проверен отново, опитай пак.';
    case 'RATE_LIMITED':
      return 'Твърде много заявки. Изчакай малко.';
    case 'SESSION_NOT_FOUND':
      return 'Сесията е изтекла. Презареди страницата.';
    default:
      return `Възникна грешка (${error.code}).`;
  }
}

// Always group thousands: bg-BG leaves 4-digit numbers ungrouped, so 9980 and 10 000 would look inconsistent.
const numberFormat = new Intl.NumberFormat('bg-BG', { useGrouping: 'always' });
export const credits = (amount: number): string => numberFormat.format(amount);
