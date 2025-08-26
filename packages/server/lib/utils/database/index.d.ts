declare class ReplicationService {
    db: PouchDB.Database;
    status: string;
    queue: PouchDB.Core.PutDocument<any>[];
    errorMessages: {}[];
    errorEvent: Event;
    changes: PouchDB.Core.Changes<any>;
    queueEvent: Event;
    private forceQueueEvt;
    lastUpdate: Date;
    interval: NodeJS.Timer;
    listeners: EventListener[];
    constructor(db: PouchDB.Database);
    on(event: string, callback: EventListener): void;
    off(event: string, callback: EventListener): void;
    push(doc: PouchDB.Core.PutDocument<any>): void;
    catchErrors(error: {}): void;
    forceReplicationForMax: any;
    forceQueue(): void;
    getErrorMessages(): {}[];
    clearQueue(): void;
    checkReplication(): void;
    replicate(): void;
}
export { ReplicationService };
