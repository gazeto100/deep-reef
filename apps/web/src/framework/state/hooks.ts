import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';
import type { SlotDispatch, SlotState, SlotStore } from './store';

export const useSlotDispatch: () => SlotDispatch = useDispatch;
export const useSlotSelector: TypedUseSelectorHook<SlotState> = useSelector;
/** The store itself, for non-React consumers such as the Pixi presentation. */
export const useSlotStore: () => SlotStore = useStore;
