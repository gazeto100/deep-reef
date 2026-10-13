import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { SlotDispatch, SlotState } from './store';

export const useSlotDispatch: () => SlotDispatch = useDispatch;
export const useSlotSelector: TypedUseSelectorHook<SlotState> = useSelector;
