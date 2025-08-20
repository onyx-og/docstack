import { encryptString } from "../crypto";
import Attribute from "./Attribute";
import Class from "./Class";
// import Domain from "./Domain";
import Surfer from "./Surfer";

const testDataModel = async () => {
    console.log("Starting")
    // Surfer.clear("db-test")
    // return;
    let testSurfer = await Surfer.create("db-test", {plugins: []});
    console.log("testDataModel -  built surfer instance. Name: ", testSurfer.getDbName())
    var TestClass = await Class.create(testSurfer, "TestClass", "class", "A test");
    console.log("testDataModel -  Create class. Got model", TestClass.getModel())
    // Create attribute and adds it to above class
    var TestAttribute = new Attribute(TestClass, "TestAttribute", "string", { maxLength: 100 });
    
    // TestClass = await Class.build(TestClass);
    // add attribute to TestClass
    console.log("testDataModel -  adding attribute to class")
    let avar = await TestClass.addAttribute(TestAttribute);
    console.log("TestClass.addAttribute result. Checking rev", avar.getModel().schema)
    
    let TestAnotherAttrWithClass = new Attribute(TestClass, "TestAnotherAttrWithClass", "string", { maxLength: 100, isArray: true });
    TestAnotherAttrWithClass = await Attribute.build(TestAnotherAttrWithClass);
    
    let aDocument = await TestClass.addCard({TestAttribute: "TestValue", TestAnotherAttrWithClass: ["TestValue1", "TestValue2"]});
    // let aDocument = await testSurfer.createDoc(null, "TestClass", TestClass, {TestAttribute: "TestValue", TestAnotherAttrWithClass: ["TestValue1", "TestValue2"]});
    console.log("aDocument was created", aDocument)

    let testclassDocs = await TestClass.getCards(null, null, 0, undefined);
    console.log("allDocs of class TestClass", testclassDocs)

    var UserClass = await Class.create(testSurfer, "User", "class", "A user class for secure login");

    // Create attributes and add them to the User class
    var UsernameAttribute = new Attribute(UserClass, "username", "string", { maxLength: 50, primaryKey: true, mandatory: true });
    var PasswordAttribute = new Attribute(UserClass, "password", "string", { maxLength: 1000, mandatory: true, encrypted: true });
    var EmailAttribute = new Attribute(UserClass, "email", "string", { maxLength: 100, mandatory: false });
    var FirstNameAttribute = new Attribute(UserClass, "firstName", "string", { maxLength: 100, mandatory: false });
    var LastNameAttribute = new Attribute(UserClass, "lastName", "string", { maxLength: 100, mandatory: false });

    UsernameAttribute = await Attribute.build(UsernameAttribute);
    PasswordAttribute = await Attribute.build(PasswordAttribute);
    EmailAttribute = await Attribute.build(EmailAttribute);
    FirstNameAttribute = await Attribute.build(FirstNameAttribute);
    LastNameAttribute = await Attribute.build(LastNameAttribute);
    
    console.log({"User": JSON.stringify(UserClass.getModel(), null, 2)})

    // reinstantiate UserClass from db
    UserClass = await testSurfer.getClass("User");
    console.log({"User (from db)": JSON.stringify(UserClass.getModel(), null, 2)})

    // try {
    //     const encryptedPassword = encryptString("admin");
    //     let userDocument = await UserClass.addCard({
    //         username: "admin", password: encryptedPassword, 
    //         email: "admin@email.com", firstName: "FirstName", lastName: "LastName"
    //     });

    //     console.log("userDocument was created", userDocument)
    // } catch (e) {
    //     console.log("Error", e);
    // }

    let userDocs = await UserClass.getCards(null, null, 0, undefined);

    console.log("userDocs", userDocs)

    var UserSessionClass = await Class.create(testSurfer, "UserSession", "class", "Tracks user sessions");

    // Create attributes and add them to the User class
    var SUsernameAttribute = new Attribute(UserSessionClass, "username", "string", { maxLength: 50, primaryKey: true, mandatory: true });
    var SessionIdAttribute = new Attribute(UserSessionClass, "sessionId", "string", { maxLength: 200, mandatory: true });
    var SessionStartAttribute = new Attribute(UserSessionClass, "sessionStart", "string", { maxLength: 100, mandatory: true });
    var SessionStatusAttribute = new Attribute(UserSessionClass, "sessionStatus", "string", { maxLength: 100, mandatory: true });
    var SessionEndAttribute = new Attribute(UserSessionClass, "sessionEnd", "string", { maxLength: 100, mandatory: false });

    SUsernameAttribute = await Attribute.build(SUsernameAttribute);
    SessionIdAttribute = await Attribute.build(SessionIdAttribute);
    SessionStartAttribute = await Attribute.build(SessionStartAttribute);
    SessionStatusAttribute = await Attribute.build(SessionStatusAttribute);
    SessionEndAttribute = await Attribute.build(SessionEndAttribute);
    
    // The model here looks cool. But there's an error when persisting the change to the db
    console.log({"UserSessionClass": JSON.stringify(UserSessionClass.getModel(), null, 2)})
    // reinstantiate UserClass from db
    UserSessionClass = await testSurfer.getClass("UserSession");
    console.log({"UserSessionClass (from db)": JSON.stringify(UserSessionClass.getModel(), null, 2)})
}

export default testDataModel;


// FAILS
// var UserClass = new Class(testSurfer, "User", "class", "A user class for secure login");

// // Create attributes and add them to the User class
// var UsernameAttribute = new Attribute(UserClass, "username", "string", { maxLength: 50, mandatory: true });
// var PasswordAttribute = new Attribute(UserClass, "password", "string", { maxLength: 100, mandatory: true, encrypted: true });
// var EmailAttribute = new Attribute(UserClass, "email", "string", { maxLength: 100, mandatory: false });
// var FirstNameAttribute = new Attribute(UserClass, "firstName", "string", { maxLength: 100, mandatory: false });
// var LastNameAttribute = new Attribute(UserClass, "lastName", "string", { maxLength: 100, mandatory: false });

// await UserClass.addAttribute(UsernameAttribute);
// await UserClass.addAttribute(PasswordAttribute);
// await UserClass.addAttribute(EmailAttribute);
// await UserClass.addAttribute(FirstNameAttribute);
// LastNameAttribute = await Attribute.build(LastNameAttribute);

// console.log("UserClass -  built User class!")
// UserClass = await Class.build(UserClass);

// console.log({"User": JSON.stringify(UserClass.getModel(), null, 2)})