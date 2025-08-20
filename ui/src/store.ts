import { configureStore, Dispatch } from '@reduxjs/toolkit';
import ui, { UIState } from 'features/ui';
import authReducer, {AuthState} from 'features/auth';
import { loadState, pouchdbMiddleware } from 'utils/pouchdb';

export type AppDispatch = typeof store.dispatch;

export type StoreState = {
  ui: UIState,
  auth: AuthState
}

const preloadedState = await loadState();

export const store = configureStore({
  reducer: {
    ui,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(pouchdbMiddleware),
  preloadedState,
});