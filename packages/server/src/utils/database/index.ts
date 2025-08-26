import workerpool from 'workerpool';
import NodePouchDB from "pouchdb-node"

const pool = workerpool.pool();

class ReplicationService {
    db: PouchDB.Database;
    status: string;
    queue: PouchDB.Core.PutDocument<any>[];
    errorMessages: {}[]; // TODO: implement error objects
    errorEvent: Event;
    changes: PouchDB.Core.Changes<any>;
    queueEvent: Event;
    private forceQueueEvt: Event;
    lastUpdate: Date;
    interval: NodeJS.Timer;
    listeners: EventListener[];

    constructor(db: PouchDB.Database) {
        this.db = db;
        this.lastUpdate = new Date();
        this.queue = [];
        this.errorMessages = [];
        this.listeners = [];    
        this.errorEvent = new CustomEvent('error', {detail: {errors: this.errorMessages}});
        this.forceQueueEvt = new Event('forceQueue');
        this.queueEvent = new CustomEvent('queue');
        let context = this;

        // check for replication every 1 minute
        this.interval = setInterval(() => this.checkReplication(), 1000 * 60 * 1); // 1 minute

        this.changes = this.db.changes({
            since: 'now',
            live: true,
            include_docs: true
          }).on('change', async (change) => {
            this.push(change.doc);
          }).on('complete', function (info) {
            // changes() was canceled
            console.log("completed change")
          }).on('error', function (err) {
            console.log(err);
            context.catchErrors(err);
          });

        this.status = "running";

        this.on('forceQueue', async () => {
            this.replicate();
        })

    }

    on(event: string, callback: EventListener) {
        if (event === 'error') {
            addEventListener(event, callback);
        } else if (event === 'queue') {
            addEventListener(event, callback);
        }
        this.listeners.push(callback);
    }

    off(event: string, callback: EventListener) {
        if (event === 'error') {
            removeEventListener(event, callback);
        } else if (event === 'queue') {
            removeEventListener(event, callback);
        }
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }

    push(doc: PouchDB.Core.PutDocument<any>) {
        this.queue.push(doc);
        dispatchEvent(this.queueEvent);
        // fire event for replication
    }

    catchErrors(error: {}) {
        this.errorMessages.push(error);
        dispatchEvent(this.errorEvent);
    }  

    forceReplicationForMax

    forceQueue() {
        dispatchEvent(this.forceQueueEvt);
    }

    getErrorMessages() {
        return this.errorMessages;
    }

    clearQueue() {
        this.queue = [];
    }

    checkReplication() {
        if (this.queue.length > 0) {
            dispatchEvent(this.forceQueueEvt);
        }
    }

    replicate() {
        const queue_ = [...this.queue];
        pool.exec('replicateChanges', [queue_], {
            on: function (payload) {
              if (payload.status === 'in_progress') {
                console.log('In progress...');
              } else if (payload.status === 'complete') {
                console.log('Done!');
              }
            },
        }).then(function (result) {
            console.log(result); // will output 3
        })
        .catch(function (err) {
            console.error(err);
        });;
        this.clearQueue()
    }

}

export { ReplicationService }