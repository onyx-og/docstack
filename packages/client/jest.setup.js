const globalRef = globalThis;

if (typeof globalRef.self === "undefined") {
  globalRef.self = globalRef;
}

if (typeof globalRef.window === "undefined") {
  globalRef.window = globalRef;
}

if (typeof globalRef.Worker === "undefined") {
  globalRef.Worker = class {
    onmessage = null;
    onmessageerror = null;
    constructor() {}
    postMessage() {}
    terminate() {}
  };
}

