import type Class from "../../class.js";
import { Trigger } from "../index.js";
import type { Document } from "@docstack/shared";

describe("Trigger", () => {
    it("hydrates the run function and executes with class and stack context", async () => {
        const mockStack = { id: "stack-1" } as const;
        const mockClass = {
            getStack: jest.fn(() => mockStack),
            getName: jest.fn(() => "ExampleClass"),
        } as unknown as Class;

        const trigger = new Trigger({
            name: "beforeUpdate",
            order: "before",
            run: `
                document.processedBy = classObj?.getName?.();
                document.stackId = stack?.id ?? null;
                return { ...document, additional: true };
            `,
        }, mockClass);

        const doc = { _id: "doc-1", "~class": "ExampleClass" } as Document;
        const result = await trigger.execute(doc);

        expect(mockClass.getStack).toHaveBeenCalled();
        expect(result.additional).toBe(true);
        expect(result.processedBy).toBe("ExampleClass");
        expect(result.stackId).toBe("stack-1");
    });

    it("executes without class or stack context using executeLimited", async () => {
        const trigger = new Trigger({
            name: "after",
            order: "after",
            run: `
                document.limited = true;
                return document;
            `,
        });

        const doc = { _id: "doc-2", "~class": "Class" } as Document;
        const result = await trigger.executeLimited(doc);

        expect(result.limited).toBe(true);
    });

    it("throws when the trigger run field is not a string", () => {
        const invalidModel = {
            name: "invalid",
            order: "before" as const,
            run: null as unknown as string,
        };

        expect(() => new Trigger(invalidModel)).toThrow(
            "Trigger model's 'run' field must be a string representation of a function."
        );
    });

    it("returns the original document when the trigger does not return a value", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation();

        const trigger = new Trigger({
            name: "noReturn",
            order: "before",
            run: `
                document.flagged = true;
                // no return statement
            `,
        });

        const doc = { _id: "doc-3", "~class": "Class" } as Document;
        const result = await trigger.execute(doc);

        expect(result).toBe(doc);
        expect(result.flagged).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
            "Trigger 'noReturn' did not return a document. Returning the original document."
        );

        warnSpy.mockRestore();
    });
});
