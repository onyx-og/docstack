import { checkDocExisting } from "../pouchdb/index.js";
import { cloudant } from "../cloudant/index.js";
export const docArray = []
export const maxChanges = 5;
export const changeLimit = 60000;

const replicateChanges = async (docs, timer) => {
    console.log("replicating changes", docs)
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
            clearTimeout(timer);
            docs.splice(0, docs.length);
        });
    } catch (e) {
        console.log("replicateChanges - error while replicating", e)
        clearTimeout(timer); //TODO: consider resetting timer and setting a lower value of trigger
        
    }
}

export default replicateChanges


