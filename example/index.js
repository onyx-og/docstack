const {CouchSurfer} = require("../lib/index.js");

const couch = new CouchSurfer();
const app = couch.getApp();

const port = process.env.SERVER_PORT || 5000;

const server = app.listen(port, () => console.log(`Listening on port ${port}`));