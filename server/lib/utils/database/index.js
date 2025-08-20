"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplicationService = void 0;
const workerpool_1 = __importDefault(require("workerpool"));
const pool = workerpool_1.default.pool();
class ReplicationService {
    constructor(db) {
        this.db = db;
        this.lastUpdate = new Date();
        this.queue = [];
        this.errorMessages = [];
        this.listeners = [];
        this.errorEvent = new CustomEvent('error', { detail: { errors: this.errorMessages } });
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
            console.log("completed change");
        }).on('error', function (err) {
            console.log(err);
            context.catchErrors(err);
        });
        this.status = "running";
        this.on('forceQueue', async () => {
            this.replicate();
        });
    }
    on(event, callback) {
        if (event === 'error') {
            addEventListener(event, callback);
        }
        else if (event === 'queue') {
            addEventListener(event, callback);
        }
        this.listeners.push(callback);
    }
    off(event, callback) {
        if (event === 'error') {
            removeEventListener(event, callback);
        }
        else if (event === 'queue') {
            removeEventListener(event, callback);
        }
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }
    push(doc) {
        this.queue.push(doc);
        dispatchEvent(this.queueEvent);
        // fire event for replication
    }
    catchErrors(error) {
        this.errorMessages.push(error);
        dispatchEvent(this.errorEvent);
    }
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
                }
                else if (payload.status === 'complete') {
                    console.log('Done!');
                }
            },
        }).then(function (result) {
            console.log(result); // will output 3
        })
            .catch(function (err) {
            console.error(err);
        });
        ;
        this.clearQueue();
    }
}
exports.ReplicationService = ReplicationService;
//# sourceMappingURL=index.js.map