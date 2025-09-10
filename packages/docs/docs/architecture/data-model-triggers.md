# Triggers

### Abstract

This whitepaper presents the design and implementation of the Trigger class, a core component for a data-driven application architecture. By enabling the runtime hydration of executable logic from a declarative data model, the Trigger class provides a flexible and powerful mechanism for defining custom data validations, transformations, and business rules. This design promotes a highly decoupled system where application behavior can be defined and modified as data, without requiring a redeployment of the application code.

## 1. Design Philosophy

The Trigger class is built on three fundamental principles:

* Declarative Behavior: Application logic is defined in a structured data format (TriggerModel), typically stored in a database alongside the data models they operate on. This transforms the application's behavior from being statically coded into a dynamic and configurable asset.

* Dynamic Hydration: The executable logic, represented as a string within the data model, is dynamically converted into a callable function at runtime. This allows for powerful, late-binding behavior.

* Secure Dependency Injection: The dynamic function's execution environment is carefully sandboxed. Instead of using a global eval(), which has significant security risks, the Trigger class employs new Function() to create a function with an isolated scope. Critical dependencies (document, classObj, stack) are explicitly injected as function arguments, providing the developer with a powerful, yet controlled, execution context.

## 2. Core Component Architecture

The Trigger class comprises two primary components:

* `model` (**Input**): An immutable data object (TriggerModel) that serves as the blueprint for the trigger. It contains a unique name, an order ("before" or "after") to define its execution timing, and the run field. The run field is the string representation of the function's body.

* `run` (Output): The dynamically created, callable method. This function adheres to a strict signature, taking the target document as an argument and returning the updated document.

## 3. The Hydration Process

The core innovation of the Trigger class lies in its constructor, where the run method is hydrated:

1. The constructor receives a TriggerModel and a reference to the parent Class instance.

2.  It uses `new Function('document', 'classObj', 'stack', ...)` to create a new function instance. The first three arguments (`document, classObj, stack`) explicitly declare the variables that will be available within the function's scope.

3. The body of the function is the developer-provided `run` string.

4. The newly created function is assigned to the `this.run` property of the Trigger instance.

5. Comprehensive error handling is implemented to catch syntax errors or issues that may arise during this dynamic function creation.

This process ensures that the developer's logic can access the document being processed, the classObj for context, and the stack for interacting with the rest of the application's data layer, all without exposing the global scope.

## 4. Usage and Execution Flow

The Trigger class is designed for seamless integration into a data model layer. Its execute method is asynchronous by default, ensuring a consistent and predictable API for all consumers.

1. **Data Definition**: A TriggerModel is defined and stored whithin its class data model. The run field can contain both synchronous and asynchronous JavaScript logic, including await expressions.

2. **Instantiation**: A parent Class instance, upon initialization or a change in its data model, creates a new Trigger instance for each corresponding TriggerModel.

3. **Execution**: When a data operation is about to occur ("before") or has just completed ("after"), the Class instance calls the `trigger.execute(document)` method. This method, in turn, calls the hydrated run function and awaits its completion. This ensures that any asynchronous operations (e.g., querying the database for related documents) are fully resolved before the flow continues.

4. **Result**: The run function's return value (the updated document) is awaited and then used by the Class to complete the data operation. This asynchronous-by-default design prevents race conditions and simplifies the calling code. The execute method also includes a safeguard to ensure a document is always returned, even if the run function does not explicitly do so.

This approach provides a robust and reliable execution model, making the Trigger class suitable for a wide range of data transformation and validation tasks, from simple field assignments to complex cross-document business rules.

## 5. Security and Reliability

The Trigger design acknowledges the inherent risks of executing dynamic code. By using `new Function()` instead of eval(), the code runs in a **separate**, **isolated** lexical scope, which prevents it from accessing or modifying local variables or functions in the parent scope. This significantly mitigates security vulnerabilities.

Furthermore, the Trigger framework includes robust error handling to ensure that syntax errors or runtime exceptions within the dynamic logic do not crash the main application thread.

## 6. Conclusion

The Trigger class represents a robust and scalable solution for defining and managing application logic as data. Its dynamic hydration, coupled with a secure dependency injection pattern, empowers developers to build highly flexible, declarative systems that can be extended and modified at runtime without the need for code changes. This approach is ideal for applications requiring configurable business rules, a decoupled architecture, and real-time extensibility.