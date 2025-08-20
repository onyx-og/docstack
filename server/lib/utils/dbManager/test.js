"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Attribute_1 = __importDefault(require("./Attribute"));
const Class_1 = __importDefault(require("./Class"));
const Domain_1 = __importDefault(require("./Domain"));
const Surfer_1 = __importDefault(require("./Surfer"));
const testDataModel = async () => {
    console.log("Starting");
    // Surfer.clear("testDb")
    // return;
    let surferInstance = new Surfer_1.default("db-test", { adapter: 'memory', plugins: [] });
    surferInstance = await Surfer_1.default.build(surferInstance);
    var TestClass = new Class_1.default(surferInstance, "TestClass", "class", "A test");
    // Create attribute and adds it to above class
    var TestAttribute = new Attribute_1.default(TestClass, "TestAttribute", "string", { charLength: 100 });
    console.log("testDataModel -  built surfer instance");
    TestClass = await Class_1.default.build(TestClass);
    console.log("testDataModel -  commited class creation");
    // add attribute to TestClass
    console.log("testDataModel -  adding attribute to class");
    await TestClass.addAttribute(TestAttribute);
    console.log("testDataModel -  added attribute to class");
    // Should cause error since attribute with the same name was already added 
    // let TestAttributeWithClass;
    // try {
    //   TestAttributeWithClass = new Attribute("TestAttribute", "string", { charLength: 100 }, TestClass);
    // } catch (e) {
    //   console.log("Error", e);
    // }
    // Should auto add attribute to above class
    console.log("testDataModel -  adding attribute to class");
    let TestAnotherAttrWithClass = new Attribute_1.default(TestClass, "TestAnotherAttrWithClass", "string", { charLength: 100, isArray: true });
    TestAnotherAttrWithClass = await Attribute_1.default.build(TestAnotherAttrWithClass);
    console.log("result", { result: TestClass.getModel() });
    let aDocument = await surferInstance.createDoc(null, TestClass, { TestAttribute: "TestValue", TestAnotherAttrWithClass: ["TestValue1", "TestValue2"] });
    console.log("aDocument was created", aDocument);
    let allDocs = await TestClass.getCards(null, null, 0, undefined);
    console.log("allDocs", allDocs);
    let MyDomain = new Domain_1.default(surferInstance, "MyDomain", "My Domain", ["TestClass"], ["TestClass"], "one-to-one");
};
exports.default = testDataModel;
//# sourceMappingURL=test.js.map