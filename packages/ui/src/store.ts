import { configureStore } from '@reduxjs/toolkit';
import ui, { UIState } from 'features/ui';
import authReducer, { AuthState } from 'features/auth';
import stack, { StackState } from "features/stack";

export type StoreState = {
  ui: UIState,
  auth: AuthState,
  stack: StackState
}

/** The one thing worth remembering across reloads: which stack was open. */
const STACK_KEY = "docstack.workbench.stack";

const rememberedStack = (): string => {
  try {
    return window.localStorage.getItem(STACK_KEY) ?? "";
  } catch {
    return "";
  }
};

export const store = configureStore({
  reducer: {
    ui,
    auth: authReducer,
    stack,
  },
  preloadedState: rememberedStack() ? { stack: { name: rememberedStack() } } : undefined,
});

store.subscribe(() => {
  try {
    window.localStorage.setItem(STACK_KEY, store.getState().stack.name);
  } catch {
    // storage unavailable: the choice simply is not remembered
  }
});

export type AppDispatch = typeof store.dispatch;
