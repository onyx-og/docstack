import { CloudantV1 } from "@ibm-cloud/cloudant";
import { IamAuthenticator } from '@ibm-cloud/cloudant';
import dotenv from "dotenv";
dotenv.config({ path: './.env' })

export const cloudant: CloudantV1 = CloudantV1.newInstance(
	{
		serviceName: "CLOUDANT" as const,
		authenticator: new IamAuthenticator({
			apikey: process.env.CLOUDANT_APIKEY,
		}),
		serviceUrl: process.env.CLOUDANT_URL,
	}
)

// Try to create database if it doesn't exist
const initCloudDb = () => new Promise((resolve, reject) => {
	console.log("initCloudDb - starting to request creation of cloud db. May fail if already existing")
	cloudant
		.putDatabase({ db: "wordsearchdb" })
		.then((putDatabaseResult) => {
			if (putDatabaseResult.result.ok) {
				console.log(`"wordsearchdb" database created."`);
				resolve(true)
			}

		})
		.catch((err) => {
			if (err.code === 412) {
				console.log(
					`Cannot create "wordsearchdb" database, it already exists.`
				);
				resolve(true)
			} else {
				console.log("initCloudDb - error while initializing db", err);
				reject(err)
			}
		});
});

export default initCloudDb