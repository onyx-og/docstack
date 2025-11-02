import {DocStack} from "@docstack/client";

async function main() {
    const stack = new DocStack({
        name: "Test"
    });
    stack.addEventListener("ready", () => {
        console.log("DocStack is ready!");
    });
}

main();

