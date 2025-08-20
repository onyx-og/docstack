

import workerpool from 'workerpool';
import { cloudant } from "../cloudant/index.js";

const replicateChanges = async (docs) => {
    try {
        let idList = [],
        docList = {};
        // remove _rev info from server db
        // while collecting doc ids for later use
        let _docs = docs.map(doc => {
            // [TODO] remove th doc rev as of now, the cloud will provide the mus updated 
            delete doc._rev;
            idList.push(doc._id);
            docList[doc._id] = doc;
            return doc;
        })

        // query cloud db with doc id list
        const docIdsReq = (await cloudant.postAllDocs({
            db: 'wordsearchdb',
            // includeDocs: true,
            keys: idList,
            // limit: 10
        }))
        const docIdsRevList = docIdsReq.result.rows;

        // update docs with last rev id for each doc that must be updated
        for (const docIdsRev of docIdsRevList) {
            let doc = docList[docIdsRev.id];
            if (doc) {
                // [TODO] As of now it updates every doc, although it should
                // use a method to decide wich doc should be actually update
                doc._rev = docIdsRev.value.rev;
            }
        }

        cloudant.postBulkDocs({
            db: 'wordsearchdb',
            bulkDocs: { docs: Object.values(docList) }
        }).then(response => {
            console.log("UpdatedDocs - responsse", response)
            // clearTimeout(timer);
            docs.splice(0, docs.length);
        });
    } catch (e) {

    }
    
}

// create a worker and register functions
workerpool.worker({
    replicateChanges,
});