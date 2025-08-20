import PouchDB from 'pouchdb';
import { Middleware } from '@reduxjs/toolkit';

const db = new PouchDB('redux_state');

// In the future use the client versio of CouchSurfer to save the state
export const saveState = async (state: any) => {
  try {
    const doc = await db.get('state');
    await db.put({ ...doc, state });
  } catch (err: any) {
    if (err.status === 404) {
      await db.put({ _id: 'state', state });
    } else {
      console.error(err);
    }
  }
};

type StateDoc = PouchDB.Core.IdMeta & PouchDB.Core.GetMeta & {
    state: any;
};
export const loadState = async () => {
  try {
    const doc = await db.get('state') as StateDoc;
    return doc.state;
  } catch (err: any) {
    if (err.status === 404) {
      return undefined;
    } else {
      console.error(err);
      return undefined;
    }
  }
};

// Middleware to Sync Redux State with PouchDB
export const  pouchdbMiddleware: Middleware = store => next => action => {
  const result = next(action);
  saveState(store.getState());
  return result;
};