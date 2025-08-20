import {DocStack, Attribute} from "../lib/index.js";

const stack = new DocStack();
const app = stack.getApp();

const port = process.env.SERVER_PORT || 5000;

const server = app.listen(port, () => console.log(`Listening on port ${port}`));

var UsernameAttribute = new Attribute(null, "username", "string", { maxLength: 50, primaryKey: true, mandatory: true });
    