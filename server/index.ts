import {DocStack} from "./src"

const stack = new DocStack()

const app = stack.getApp();

const port = process.env.SERVER_PORT || 5000;

const server = app.listen(port, () => console.log(`Listening on port ${port}`));