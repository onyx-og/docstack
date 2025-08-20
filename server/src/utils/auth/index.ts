import { decryptString, encryptString, hashStringEpoch } from "../crypto";
import Surfer, {Document} from '../dbManager/Surfer';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Class from "../dbManager/Class";
import getLogger from "../logger";

const logger = getLogger().child({module: "auth"})

const envPath = '.env';

dotenv.config({ path: envPath });

export interface JWTAuthPayload {
    username: string;
    id: string;
    email: string;
    sessionId: string;
}
export const generateToken = (payload: JWTAuthPayload) => {
    const secretKey = process.env.JWT_PRIVATE_KEY;

    if (!secretKey || secretKey === '') {
        throw new Error('JWT secret key not found');
    }

    // TODO: Consider making the expiration time configurable
    const options = {
      expiresIn: '1h', // Token expiration time
    };
  
    const token = jwt.sign(payload, secretKey, options);
    return token;
};

export const login = async (username: string, password: string) => {
    if (!username || !password) {
        return { responseCode: 400, body: { error: 'Username and password are required' } };
    }

    // Add your login logic here
    const userDoc = await globalThis.surfer.findDocument({
        "type": "User",
        username: { $eq: username },
    }) as Document

    if (!userDoc) {
        return { responseCode: 404, body: { error: 'User not found'} }
    }

    const storedDecryptedPsw = decryptString(userDoc.password)
    const receivedDecryptedPsw = decryptString(password);

    if ( receivedDecryptedPsw === storedDecryptedPsw) {
        // Create session document
        const UserSessionClass = await (globalThis.surfer as Surfer).getClass("UserSession");
        const sessionCard = await UserSessionClass.addOrUpdateCard({
            username: userDoc.username,  //PK
            sessionId: hashStringEpoch(userDoc.username),  //unique
            sessionStart: new Date().toISOString(),
            sessionStatus: "active",
        });
        // Generate JWT token
        const token = generateToken({
            username: userDoc.username,
            id: userDoc.id,
            email: userDoc.email,
            sessionId: sessionCard.sessionId
        }) // return the token and expiration time (1h)

        const body = {
            success: true,
            message: 'Login successful',
            // token,
            expiresIn: 3600,
            sessionId: sessionCard.sessionId
        }
        return { responseCode: 200, body, token };
    } else {
        return { responseCode: 401, body: { error: 'Incorrect password' }};
    }
}

// Setups admin user using environment values
export const setupAdminUser = async () => {
    console.log("setupAdminUser - setting up admin user")
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || adminUsername === '') {
        throw new Error("Can't configure admin user because of missing username");
    }

    if (!adminPassword || adminPassword === '') {
        throw new Error("Can't configure admin user because of missing password");
    }

    const UserClass = await (globalThis.surfer as Surfer).getClass("User");
    // check if the admin user already exists
    // we consider as admin user the one that has the same username as in the env configs
    const userAdminCards = await UserClass.getCards({
        username: {$eq: adminUsername}
    }, null, 0, 1);
    const adminUser = userAdminCards.length ? userAdminCards[0] : undefined;
    if (!adminUser) {
        logger.info(`setupAdminUser - Missing admin user "${adminUsername}". Setting up...`)
        try {
            const encryptedPassword = encryptString(adminPassword);
            let userDocument = await UserClass.addCard({
                username: adminUsername, password: encryptedPassword, 
                email: "admin@email.com", firstName: "FirstName", lastName: "LastName"
            });
            logger.info("setupAdminUser - Admin user just got setup successfully", 
                {username: userDocument.username})
        } catch (e) {
            logger.error("setupAdminUser - error", {error: e})
            throw new Error(e)
        }
    } else {
        logger.info("setupAdminUser - Admin user already setup");
    }
}