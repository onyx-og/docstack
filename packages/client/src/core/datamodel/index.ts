import { Patch } from "@docstack/shared";
import semver from "semver";
import crypto from "crypto";

const syspatches: Patch[] = [];
const hashContent = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

// TODO: implement _rev auto handler:
// If patches include updates to existing documents, 
// we need to ensure that the _rev field is handled correctly to avoid conflicts.

const sys_001: Patch = {
    "_id": "~sys-0.0.1",
    "~class": "patch",
    "version": "0.0.1",
    "target": "system",
    "changelog": "### Initial patch with originators: Class and Domain",
    "docs": [
        {
            "_id": "class",
            "active": true,
            "name": "class",
            "description": "A class document representing a data model class",
            "~class": "~self",
            "schema": {
                "name": {
                    "name": "name",
                    "type": "string",
                    "config": {
                        "primaryKey": true,
                        "mandatory": true,
                        "isArray": false,
                        "maxLength": 100
                    }
                },
                "description": {
                    "name": "description",
                    "type": "string",
                    "config": {
                        "mandatory": false,
                        "isArray": false,
                        "maxLength": 500
                    }
                },
                "~class": {
                    "name": "~class",
                    "type": "string",
                    "config": {
                        "mandatory": true,
                        "isArray": false,
                        "maxLength": 50,
                        "defaultValue": "class"
                    }
                },
                "schema": { "name": "schema", "type": "object", "config": { "maxLength": 1000, "isArray": false } },
            }
        },
        {
            "_id": "domain",
            "active": true,
            "name": "domain",
            "description": "A domain document representing a data model domain",
            "~class": "~self",
            "schema": {
                "~class": { name: "~class", type: "string", config: { defaultValue: "domain" } },
                "relation": {
                    name: "relation", type: "enum", config: {
                        isArray: false, values: [
                            { value: "1:1" }, { value: "1:N" }, { value: "N:1" }, { value: "N:N" }
                        ]
                    }
                },
                "sourceClass": {
                    name: "sourceClass",
                    type: "foreign_key",
                    config: {
                        targetClass: "class",
                        isArray: false
                    }
                },
                "targetClass": {
                    name: "targetClass",
                    type: "foreign_key",
                    config: {
                        targetClass: "class",
                        isArray: false
                    }
                },
            }
        }
    ]
}

const sys_002: Patch = {
    "_id": "~sys-0.0.2",
    "~class": "patch",
    "version": "0.0.2",
    "target": "system",
    "changelog": "### Initial patch with system classes and domains",
    "docs": [
        {
            "_id": "log",
            "active": true,
            "name": "log",
            "description": "Contains the system logs",
            "~class": "class",
            "schema": {
                "log": {
                    "name": "log",
                    "type": "object",
                    "config": {
                        "isArray": false
                    }
                }
            }
        }
    ]
}

const sys_003: Patch = {
    "_id": "~sys-0.0.3",
    "~class": "patch",
    "version": "0.0.3",
    "target": "system",
    "changelog": "### Schema Patch: v0.0.3\\\n#### New Classes: ~User, ~UserSession",
    "docs": [
        {
            "_id": "~User",
            "active": true,
            "name": "User",
            "description": "A user class for secure login",
            "~class": "class",
            "schema": {
                "username": {
                    "name": "username",
                    "type": "string",
                    "config": {
                        "primaryKey": true,
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "password": {
                    "name": "password",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "email": {
                    "name": "email",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "firstName": {
                    "name": "firstName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "lastName": {
                    "name": "lastName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                }
            }
        },
        {
            "_id": "~UserSession",
            "name": "UserSession",
            "active": true,
            "description": "Tracks user sessions",
            "~class": "class",
            "schema": {
                "username": {
                    "name": "username",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false,
                        "primaryKey": true,
                        "mandatory": true
                    }
                },
                "sessionId": {
                    "name": "sessionId",
                    "type": "string",
                    "config": {
                        "maxLength": 200,
                        "primaryKey": true,
                        "isArray": false,
                        "mandatory": true
                    }
                },
                "sessionStart": {
                    "name": "sessionStart",
                    "type": "string",
                    "config": {
                        "maxLength": 100,
                        "isArray": false,
                        "mandatory": true
                    }
                },
                "sessionStatus": {
                    "name": "sessionStatus",
                    "type": "string",
                    "config": {
                        "maxLength": 100,
                        "isArray": false,
                        "mandatory": true
                    }
                },
                "sessionEnd": {
                    "name": "sessionEnd",
                    "type": "string",
                    "config": {
                        "maxLength": 100,
                        "isArray": false,
                        "mandatory": false
                    }
                }
            }
        }
    ]
};

const classicAuthJobContent = `
const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function deriveKeyMaterial(password, salt, iterations = 120000, length = 32) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
        throw new Error("WebCrypto unavailable for key derivation");
    }

    const encoder = new TextEncoder();
    const keyMaterial = await globalThis.crypto.subtle.importKey(
        "raw",
        encoder.encode(String(password)),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    const derived = await globalThis.crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: encoder.encode(String(salt)),
            iterations,
            hash: "SHA-256",
        },
        keyMaterial,
        length * 8
    );

    return toHex(derived);
}

async function execute(_stack, params) {
    const password = params?.password ?? "";
    const salt = params?.salt ?? params?.keyDerivationSalt ?? "";

    if (!password) {
        throw new Error("Password is required for key derivation");
    }
    if (!salt) {
        throw new Error("Salt is required for key derivation");
    }

    const derivedKey = await deriveKeyMaterial(password, salt);
    const metadata = { derivedKey, derivedAt: Date.now() };
    return { metadata };
}
`;

const sys_004: Patch = {
    "_id": "~sys-0.0.4",
    "~class": "patch",
    "version": "0.0.4",
    "target": "system",
    "changelog": "### Schema Patch: v0.0.4\\n#### New Classes: ~Job, ~JobRun, ~Policy, ~AuthModule\\n#### Updates: ~User authentication fields",
    "docs": [
        {
            "_id": "~User",
            "_rev": "auto",
            "active": true,
            "name": "User",
            "description": "A user class for secure login",
            "~class": "class",
            "schema": {
                "username": {
                    "name": "username",
                    "type": "string",
                    "config": {
                        "primaryKey": true,
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "password": {
                    "name": "password",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "email": {
                    "name": "email",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "firstName": {
                    "name": "firstName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "lastName": {
                    "name": "lastName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "authMethod": {
                    "name": "authMethod",
                    "type": "string",
                    "config": {
                        "mandatory": true,
                        "maxLength": 100,
                        "isArray": false
                    }
                },
                "externalId": {
                    "name": "externalId",
                    "type": "string",
                    "config": {
                        "maxLength": 200,
                        "isArray": false
                    }
                },
                "keyDerivationSalt": {
                    "name": "keyDerivationSalt",
                    "type": "string",
                    "config": {
                        "mandatory": true,
                        "maxLength": 200,
                        "isArray": false
                    }
                }
            }
        },
        {
            "_id": "~Job",
            "active": true,
            "name": "Job",
            "description": "A long running or scheduled job",
            "~class": "class",
            "schema": {
                "_id": { "name": "_id", "type": "string", "config": { "primaryKey": true, "mandatory": true } },
                "name": { "name": "name", "type": "string", "config": { "mandatory": true } },
                "description": { "name": "description", "type": "string", "config": { "isArray": false } },
                "type": { "name": "type", "type": "string", "config": { "mandatory": true } },
                "workerPlatform": { "name": "workerPlatform", "type": "string", "config": { "mandatory": true } },
                "content": { "name": "content", "type": "string", "config": { "mandatory": true } },
                "hash": { "name": "hash", "type": "string", "config": { "mandatory": true } },
                "schedule": { "name": "schedule", "type": "string", "config": { "mandatory": false } },
                "isSingleton": { "name": "isSingleton", "type": "boolean", "config": { "defaultValue": false } },
                "isEnabled": { "name": "isEnabled", "type": "boolean", "config": { "mandatory": true, "defaultValue": true } },
                "nextRunTimestamp": { "name": "nextRunTimestamp", "type": "integer", "config": { "mandatory": false } },
                "defaultParams": { "name": "defaultParams", "type": "object", "config": { "mandatory": false } },
                "metadata": { "name": "metadata", "type": "object", "config": { "mandatory": false } }
            }
        },
        {
            "_id": "~JobRun",
            "active": true,
            "name": "JobRun",
            "description": "Execution history for jobs",
            "~class": "class",
            "schema": {
                "_id": { "name": "_id", "type": "string", "config": { "primaryKey": true, "mandatory": true } },
                "~class": { "name": "~class", "type": "string", "config": { "mandatory": true, "defaultValue": "~JobRun" } },
                "jobId": { "name": "jobId", "type": "string", "config": { "mandatory": true } },
                "status": { "name": "status", "type": "string", "config": { "mandatory": true } },
                "triggerType": { "name": "triggerType", "type": "string", "config": { "mandatory": true } },
                "startTime": { "name": "startTime", "type": "integer", "config": { "mandatory": true } },
                "endTime": { "name": "endTime", "type": "integer", "config": { "mandatory": false } },
                "durationMs": { "name": "durationMs", "type": "integer", "config": { "mandatory": false } },
                "runtimeArgs": { "name": "runtimeArgs", "type": "object", "config": { "mandatory": false } },
                "initialMetadata": { "name": "initialMetadata", "type": "object", "config": { "mandatory": false } },
                "finalMetadata": { "name": "finalMetadata", "type": "object", "config": { "mandatory": false } },
                "errorMessage": { "name": "errorMessage", "type": "string", "config": { "mandatory": false } },
                "errorStack": { "name": "errorStack", "type": "string", "config": { "mandatory": false } },
                "logs": { "name": "logs", "type": "object", "config": { "mandatory": false } },
                "workerId": { "name": "workerId", "type": "string", "config": { "mandatory": false } }
            }
        },
        {
            "_id": "~Policy",
            "active": true,
            "name": "Policy",
            "description": "Access policies for classes and documents",
            "~class": "class",
            "schema": {
                "userId": { "name": "userId", "type": "string", "config": { "mandatory": true } },
                "rule": { "name": "rule", "type": "string", "config": { "mandatory": true, "maxLength": 2000 } },
                "description": { "name": "description", "type": "string", "config": { "mandatory": false } },
                "targetClass": { "name": "targetClass", "type": "foreign_key", "config": { "mandatory": true, "isArray": true, "targetClass": "class" } }
            }
        },
        {
            "_id": "~AuthModule",
            "active": true,
            "name": "AuthModule",
            "description": "Authentication module descriptor",
            "~class": "class",
            "schema": {
                "name": { "name": "name", "type": "string", "config": { "mandatory": true } },
                "config": { "name": "config", "type": "object", "config": { "mandatory": false } },
                "jobId": { "name": "jobId", "type": "foreign_key", "config": { "mandatory": true, "targetClass": "~Job" } }
            }
        },
        {
            "_id": "Job-Auth-Classic",
            "~class": "~Job",
            "name": "Classic authentication",
            "description": "Derive key material from password and salt",
            "type": "user",
            "workerPlatform": "client",
            "content": classicAuthJobContent,
            "hash": hashContent(classicAuthJobContent),
            "isEnabled": true,
            "isSingleton": true,
            "defaultParams": {},
            "metadata": {}
        },
        {
            "_id": "AuthMod-Classic",
            "~class": "~AuthModule",
            "name": "Classic Email/Password",
            "config": { "mode": "password" },
            "jobId": "Job-Auth-Classic"
        },
        {
            "_id": "Policy-System-Classes",
            "~class": "~Policy",
            "userId": "system",
            "rule": "return true;",
            "description": "Default system policy",
            "targetClass": ["class", "~User", "~UserSession", "~Policy", "~Job", "~JobRun", "~AuthModule"]
        }
    ]
};

syspatches.push(sys_001, sys_002, sys_003, sys_004);

const sys_005: Patch = {
    "_id": "~sys-0.0.5",
    "~class": "patch",
    "version": "0.0.5",
    "target": "system",
    "changelog": "### Schema Patch: v0.0.5\\n#### Updates: enforce enum/foreign key definitions for job, policy, and user auth fields",
    "docs": [
        {
            "_id": "~User",
            "_rev": "auto",
            "active": true,
            "name": "User",
            "description": "A user class for secure login",
            "~class": "class",
            "schema": {
                "username": {
                    "name": "username",
                    "type": "string",
                    "config": {
                        "primaryKey": true,
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "password": {
                    "name": "password",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "mandatory": true,
                        "isArray": false
                    }
                },
                "email": {
                    "name": "email",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "firstName": {
                    "name": "firstName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "lastName": {
                    "name": "lastName",
                    "type": "string",
                    "config": {
                        "maxLength": 50,
                        "isArray": false
                    }
                },
                "authMethod": {
                    "name": "authMethod",
                    "type": "foreign_key",
                    "config": { "mandatory": true, "targetClass": "~AuthModule" }
                },
                "externalId": {
                    "name": "externalId",
                    "type": "string",
                    "config": {
                        "maxLength": 200,
                        "isArray": false
                    }
                },
                "keyDerivationSalt": {
                    "name": "keyDerivationSalt",
                    "type": "string",
                    "config": {
                        "mandatory": true,
                        "maxLength": 200,
                        "isArray": false
                    }
                }
            }
        },
        {
            "_id": "~Job",
            "_rev": "auto",
            "active": true,
            "name": "Job",
            "description": "A long running or scheduled job",
            "~class": "class",
            "schema": {
                "_id": { "name": "_id", "type": "string", "config": { "primaryKey": true, "mandatory": true } },
                "name": { "name": "name", "type": "string", "config": { "mandatory": true } },
                "description": { "name": "description", "type": "string", "config": { "isArray": false } },
                "type": {
                    "name": "type",
                    "type": "enum",
                    "config": { "mandatory": true, "values": [{ value: "system" }, { value: "user" }] }
                },
                "workerPlatform": {
                    "name": "workerPlatform",
                    "type": "enum",
                    "config": { "mandatory": true, "values": [{ value: "client" }, { value: "server" }, { value: "hybrid" }] }
                },
                "content": { "name": "content", "type": "string", "config": { "mandatory": true } },
                "hash": { "name": "hash", "type": "string", "config": { "mandatory": true } },
                "schedule": { "name": "schedule", "type": "string", "config": { "mandatory": false } },
                "isSingleton": { "name": "isSingleton", "type": "boolean", "config": { "defaultValue": false } },
                "isEnabled": { "name": "isEnabled", "type": "boolean", "config": { "mandatory": true, "defaultValue": true } },
                "nextRunTimestamp": { "name": "nextRunTimestamp", "type": "integer", "config": { "mandatory": false } },
                "defaultParams": { "name": "defaultParams", "type": "object", "config": { "mandatory": false } },
                "metadata": { "name": "metadata", "type": "object", "config": { "mandatory": false } }
            }
        },
        {
            "_id": "~JobRun",
            "_rev": "auto",
            "active": true,
            "name": "JobRun",
            "description": "Execution history for jobs",
            "~class": "class",
            "schema": {
                "_id": { "name": "_id", "type": "string", "config": { "primaryKey": true, "mandatory": true } },
                "~class": { "name": "~class", "type": "string", "config": { "mandatory": true, "defaultValue": "~JobRun" } },
                "jobId": { "name": "jobId", "type": "foreign_key", "config": { "mandatory": true, "targetClass": "~Job" } },
                "status": {
                    "name": "status",
                    "type": "enum",
                    "config": {
                        "mandatory": true,
                        "values": [
                            { value: "PENDING" },
                            { value: "RUNNING" },
                            { value: "SUCCESS" },
                            { value: "FAILURE" },
                            { value: "CANCELED" },
                            { value: "SKIPPED" }
                        ]
                    }
                },
                "triggerType": {
                    "name": "triggerType",
                    "type": "enum",
                    "config": { "mandatory": true, "values": [{ value: "manual" }, { value: "scheduled" }, { value: "event" }] }
                },
                "startTime": { "name": "startTime", "type": "integer", "config": { "mandatory": true } },
                "endTime": { "name": "endTime", "type": "integer", "config": { "mandatory": false } },
                "durationMs": { "name": "durationMs", "type": "integer", "config": { "mandatory": false } },
                "runtimeArgs": { "name": "runtimeArgs", "type": "object", "config": { "mandatory": false } },
                "initialMetadata": { "name": "initialMetadata", "type": "object", "config": { "mandatory": false } },
                "finalMetadata": { "name": "finalMetadata", "type": "object", "config": { "mandatory": false } },
                "errorMessage": { "name": "errorMessage", "type": "string", "config": { "mandatory": false } },
                "errorStack": { "name": "errorStack", "type": "string", "config": { "mandatory": false } },
                "logs": { "name": "logs", "type": "object", "config": { "mandatory": false } },
                "workerId": { "name": "workerId", "type": "string", "config": { "mandatory": false } }
            }
        },
        {
            "_id": "~Policy",
            "_rev": "auto",
            "active": true,
            "name": "Policy",
            "description": "Access policies for classes and documents",
            "~class": "class",
            "schema": {
                "userId": { "name": "userId", "type": "foreign_key", "config": { "mandatory": true, "targetClass": "~User" } },
                "rule": { "name": "rule", "type": "string", "config": { "mandatory": true, "maxLength": 2000 } },
                "description": { "name": "description", "type": "string", "config": { "mandatory": false } },
                "targetClass": { "name": "targetClass", "type": "foreign_key", "config": { "mandatory": true, "isArray": true, "targetClass": "class" } }
            }
        },
        {
            "_id": "system",
            "~class": "~User",
            "username": "system",
            "password": "system",
            "email": "",
            "firstName": "System",
            "lastName": "User",
            "authMethod": "AuthMod-Classic",
            "externalId": "",
            "keyDerivationSalt": "system-salt"
        }
    ]
};

syspatches.push(sys_005);

export function getSystemPatches(currentVersion: string) {
    return syspatches
        .filter((patch) => semver.gt(patch.version, currentVersion))
        .sort((a, b) => semver.compare(a.version, b.version));
}

export function getAllSystemPatches() {
    return syspatches.sort((a, b) => semver.compare(a.version, b.version));
}