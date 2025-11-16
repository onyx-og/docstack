import { Patch } from "@docstack/shared";
import semver from "semver";

const syspatches: Patch[] = [];

// TODO: implement _rev auto handler:
// If patches include updates to existing documents, 
// we need to ensure that the _rev field is handled correctly to avoid conflicts.

const sys_001: Patch = {
    "_id": "~sys-0.0.1",
    "type": "patch",
    "version": "0.0.1",
    "target": "system",
    "changelog": "### Initial patch with originators: Class and Domain",
    "docs": [
        {
            "_id": "class",
            "active": true,
            "name": "class",
            "description": "A class document representing a data model class",
            "type": "~self",
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
                "type": {
                    "name": "type",
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
            "type": "~self",
            "schema": {
                "type": { name: "type", type: "string", config: { defaultValue: "domain" } },
                "schema": {
                    name: "schema", type: "object", config: {
                        isArray: true,
                        defaultValue: {
                            "source": {
                                name: "source",
                                type: "foreign_key",
                                config: {
                                    isArray: false
                                }
                            },
                            "target": {
                                name: "target",
                                type: "foreign_key",
                                config: {
                                    isArray: false
                                }
                            }
                        }
                    }
                },
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
    "type": "patch",
    "version": "0.0.2",
    "target": "system",
    "changelog": "### Schema Patch: v0.0.2\\\n#### New Classes: ~User, ~UserSession",
    "docs": [
        {
            "_id": "~User",
            "active": true,
            "name": "User",
            "description": "A user class for secure login",
            "type": "class",
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
            "type": "class",
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

syspatches.push(sys_001, sys_002);

export function getSystemPatches(currentVersion: string) {
    return syspatches
        .filter((patch) => semver.gt(patch.version, currentVersion))
        .sort((a, b) => semver.compare(a.version, b.version));
}

export function getAllSystemPatches() {
    return syspatches.sort((a, b) => semver.compare(a.version, b.version));
}