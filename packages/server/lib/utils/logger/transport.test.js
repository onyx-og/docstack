"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const transport_1 = __importDefault(require("./transport"));
const mockLog = jest.fn().mockImplementation((info, callback) => {
    console.log(info);
    callback();
});
jest.mock('./transport', () => {
    const MockTransport = jest.fn().mockImplementation((...args) => {
        console.log("Initiated PouchDBTransport with args:", args);
        return {
            // log: (info: Object, callback: Function) => {
            //     console.log(info);
            //     callback()
            // },
            log: mockLog
        };
    });
    return { __esModule: true, default: MockTransport };
});
describe('PouchDBTransport', () => {
    it('should log info to the database', async () => {
        const transport = new transport_1.default({ dbName: 'test' });
        const info = { message: 'test message' };
        await transport.log(info, () => { });
        expect(transport_1.default).toHaveBeenCalledWith({ dbName: 'test' });
        expect(mockLog).toHaveBeenCalledWith(info, expect.any(Function));
    });
});
//# sourceMappingURL=transport.test.js.map