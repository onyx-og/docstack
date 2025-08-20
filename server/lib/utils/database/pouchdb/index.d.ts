declare const localdb: PouchDB.Database<{}>;
declare const getDocByType: (type: string) => Promise<PouchDB.Core.ExistingDocument<{}>>;
declare const getDocById: (db: any, id: string) => Promise<any>;
declare const checkDocExisting: (db: any, id: string) => Promise<any>;
declare const registerConnection: (db: any, uuid: string) => Promise<void>;
declare const registerDisconnection: (db: any, uuid: string) => Promise<void>;
declare const registerChangesListener: (db: any) => any;
export default localdb;
export { registerChangesListener, getDocById, getDocByType, checkDocExisting, registerConnection, registerDisconnection };
