import {CouchSurfer} from "./src"

const couchsurfer = new CouchSurfer()

const app = couchsurfer.getApp();

const port = process.env.SERVER_PORT || 5000;

const server = app.listen(port, () => console.log(`Listening on port ${port}`));