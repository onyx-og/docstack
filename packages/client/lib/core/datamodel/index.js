import semver from "semver";
const syspatches = [];
const sys_001 = {
    "_id": "~sys-0.0.1",
    "type": "patch",
    "version": "0.0.1",
    "target": "system",
    "changelog": "### Schema Patch: v0.0.1\\\n#### New Documents: ~User, ~UserSession",
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
syspatches.push(sys_001);
export function getSystemPatches(currentVersion) {
    return syspatches
        .filter((patch) => semver.gt(patch.version, currentVersion))
        .sort((a, b) => semver.compare(a.version, b.version));
}
export function getAllSystemPatches() {
    return syspatches.sort((a, b) => semver.compare(a.version, b.version));
}
//# sourceMappingURL=index.js.map