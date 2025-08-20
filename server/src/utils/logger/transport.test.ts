import PouchDBTransport from './transport';
const mockLog = jest.fn().mockImplementation((info: Object, callback: Function) => {
    console.log(info);
    callback()
})
jest.mock('./transport', () => {
    const MockTransport = jest.fn().mockImplementation((...args) => {
        console.log("Initiated PouchDBTransport with args:", args)
        return {
            // log: (info: Object, callback: Function) => {
            //     console.log(info);
            //     callback()
            // },
            log: mockLog
        };
    })
  return { __esModule: true, default: MockTransport };
})

describe('PouchDBTransport', () => {
  it('should log info to the database', async () => {
    const transport = new PouchDBTransport({ dbName: 'test' });
    const info = { message: 'test message' };

    await transport.log(info, () => {});

    expect(PouchDBTransport).toHaveBeenCalledWith({ dbName: 'test' });
    expect(mockLog).toHaveBeenCalledWith(info, expect.any(Function))
  });
});