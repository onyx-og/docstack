import PouchDB from 'pouchdb';
import { Middleware } from '@reduxjs/toolkit';
import { DocStack, Class, Attribute, ClientStack } from "@docstack/client";
const db = new PouchDB('redux_state');

export const saveState = async (state: any) => {
  try {
    const docStack = new DocStack({ name: "client-test" });
    let stack: ClientStack | undefined;
    docStack.addEventListener("ready", async (evt) => {
      if (stack = docStack.getStack("client-test")) {
        const testClass = await Class.create(stack, "Test", "class", "A test", {});
        // await docStack.getStore().addClass();

        // const testClass = await docStack.getStore().getClass("Test");
        // const doc = await db.get('state');
        // console.log("saveState - current doc", {doc});
        // console.log("saveState - provided state", {state});
        // await db.put({ ...doc, state });
        // [TODO] Add attribute
        var textAttribute = new Attribute(testClass, "text", "string", "A test attribute", { maxLength: 50, primaryKey: true, mandatory: true });
        await Attribute.build(textAttribute);
        await testClass.addCard({ text: 'Hello' });
      }

    })

  } catch (err: any) {
    console.error(err);
  }
};

type StateDoc = PouchDB.Core.IdMeta & PouchDB.Core.GetMeta & {
  state: any;
};
export const loadState = async () => {
  try {
    const doc = await db.get('state') as StateDoc;
    console.log("loadState - loaded doc", doc)
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
export const pouchdbMiddleware: Middleware = store => next => async action => {
  //await saveState(store.getState());
  const result = next(action);
  return result;
};