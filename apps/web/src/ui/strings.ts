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
