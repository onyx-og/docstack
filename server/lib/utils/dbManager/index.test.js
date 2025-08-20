"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Class_1 = __importDefault(require("./Class"));
const Attribute_1 = __importDefault(require("./Attribute"));
const Surfer_1 = __importDefault(require("./Surfer"));
const mockClassInst = {
    getCards: jest.fn().mockImplementation(() => {
    }),
    addAttribute: jest.fn().mockImplementation(() => {
    })
};
const mockSurferInst = {
    createDoc: jest.fn().mockImplementation(() => {
    })
};
// Mock the Surfer class
jest.mock('./Surfer', () => {
    const MockSurfer = jest.fn().mockImplementation((...args) => {
        console.log('MockClass constructor called with args:', args);
        return {
            createDoc: jest.fn().mockResolvedValue({}),
            build: jest.fn().mockResolvedValue({}),
            // Mock other Surfer methods as needed
        };
    });
    MockSurfer.build = jest.fn().mockImplementation((arg) => Surfer_1.default);
    return { __esModule: true, default: MockSurfer };
});
// Mock the Class class
jest.mock('./Class', () => {
    let MockClass = jest.fn().mockImplementation(() => {
        return {
            addAttribute: jest.fn().mockResolvedValue({}),
            getCards: mockClassInst.getCards,
            // Mock Class methods as needed
        };
    });
    MockClass.build = () => MockClass;
    return { __esModule: true, default: MockClass };
});
// Mock the Attribute class
jest.mock('./Attribute', () => {
    let MockAttribute = jest.fn().mockImplementation(() => {
        return {
            build: jest.fn().mockResolvedValue({}),
            // Mock Attribute methods as needed
        };
    });
    MockAttribute.build = jest.fn().mockImplementation((arg) => Surfer_1.default);
    return { __esModule: true, default: MockAttribute };
});
test('Basic data model interactions', async () => {
    console.log("Starting");
    expect(3).toBe(3);
    let surferInstance = new Surfer_1.default("testDb", { adapter: 'memory', plugins: [] });
    surferInstance = await Surfer_1.default.build(surferInstance);
    var TestClass = new Class_1.default(surferInstance, "TestClass", "class");
    var TestAttribute = new Attribute_1.default(TestClass, "TestAttribute", "string", { charLength: 100 });
    // Add assertions to check that the mocked methods were called with the correct arguments
    expect(Surfer_1.default).toHaveBeenCalledWith("testDb", { adapter: 'memory', plugins: [] });
    // expect(surferInstance).toBeInstanceOf(Surfer);
    expect(Class_1.default).toHaveBeenCalledWith(surferInstance, "TestClass", "class");
    expect(Attribute_1.default).toHaveBeenCalledWith(TestClass, "TestAttribute", "string", { charLength: 100 });
    TestClass = await Class_1.default.build(TestClass);
    // expect(TestClass).toBeInstanceOf(Class);
    expect(Class_1.default.build).toHaveBeenCalledWith(TestClass);
    await TestClass.addAttribute(TestAttribute);
    expect(mockClassInst.addAttribute).toHaveBeenCalledWith(TestAttribute);
    let TestAnotherAttrWithClass = new Attribute_1.default(TestClass, "TestAnotherAttrWithClass", "string", { charLength: 100, isArray: true });
    TestAnotherAttrWithClass = await Attribute_1.default.build(TestAnotherAttrWithClass);
    // expect(TestAnotherAttrWithClass).toBeInstanceOf(Attribute);
    expect(Attribute_1.default.build).toHaveBeenCalledWith(TestAnotherAttrWithClass);
    let aDocument = await surferInstance.createDoc(null, TestClass, { TestAttribute: "TestValue", TestAnotherAttrWithClass: ["TestValue1", "TestValue2"] });
    expect(surferInstance.createDoc).toHaveBeenCalledWith(null, "TestClass", { TestAttribute: "TestValue", TestAnotherAttrWithClass: ["TestValue1", "TestValue2"] });
    let allDocs = await TestClass.getCards(null, null, 0, undefined);
    expect(TestClass.getCards).toHaveBeenCalledWith(null, null, 0, undefined);
});
// const testFind = async () => {
//     let testDbMg = new DbManager("testDb");
//     testDbMg = await DbManager.build(testDbMg);
//     let filteredClasses = await testDbMg.getClasses(["TestClass"]);
//     debugger;
// }
// export default testDataModel;
//# sourceMappingURL=index.test.js.map