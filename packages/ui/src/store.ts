import { configureStore, Dispatch } from '@reduxjs/toolkit';
import ui, { UIState } from 'features/ui';
import authReducer, {AuthState} from 'features/auth';
import stack, {StackState} from "features/stack";
import { loadState, pouchdbMiddleware } from 'utils/docstack';

export type AppDispatch = typeof store.dispatch;

export type StoreState = {
  ui: UIState,
  auth: AuthState,
  stack: StackState
}

const preloadedState = await loadState();

export const store = configureStore({
  reducer: {
    ui,
    auth: authReducer,
    stack,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(pouchdbMiddleware),
  preloadedState,
});