class Stack extends EventTarget {
    constructor() {
        super(...arguments);
        this.appVersion = "0.0.1";
        /* Used to retrieve faster data */
        this.cache = {};
        this.listeners = [];
        this.modelWorker = null;
    }
}
export default Stack;
//# sourceMappingURL=index.js.map