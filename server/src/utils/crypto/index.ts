import crypto from "crypto"
import dotenv from 'dotenv';
import { resolve } from 'node:path';
import process from "node:process";
import fs from "node:fs";
import { KeyLike } from "node:crypto";

const envPath = process.env.ENVFILE || "./.env";

dotenv.config({ path: envPath }); 

const checkKeyPairPresence = (keys: string[]) => {
    let missingKeys = keys.filter(key => {
        return process.env[key] === undefined || process.env[key] === "";
    });

    return missingKeys;
}

export const hashStringEpoch = (string: string) => {
    return crypto.createHash('sha256').update(string + Date.now()).digest('base64');
}

const generatePair = () => {
    const passphrase = process.env.ENCRYPTION_PASSPHRASE;

    if (passphrase === undefined) {
        throw new Error("No passphrase found in .env file");
    }
    // Placeholder method, aimed to provide in the future additional
    // customizations for the key pair generation
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        // The standard secure default length for RSA keys is 2048 bits
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: process.env.ENCRYPTION_PASSPHRASE,
        },
    });
    return { publicKey, privateKey };
}

// TODO: Consider moving to another dir
export const updateEnvFile = (config: {
    [key: string]: string;
}) => {
    const envFilePath = resolve(process.cwd(), envPath);
    console.log(`updateEnvFile - preparing to update .env file at path: "${envFilePath}"`);

    try {
        const envConfig = dotenv.parse(fs.readFileSync(envFilePath));

        for (const [key, value] of Object.entries(config)) {
            envConfig[key] = value;
        }

        const envContent = Object.entries(envConfig)
            .map(([key, value]) => `${key}="${value}"`)
            .join('\n');

        fs.writeFileSync(envFilePath, envContent);
    } catch (e) {
        const errMsg = `updateEnvFile - Error while updating env file at path ${envFilePath}: ${e}` ;
        console.error(errMsg);
        throw new Error(errMsg)
    }
    console.log(`updateEnvFile - successfully updated .env file at path: "${envFilePath}"`);
    dotenv.config({ override: true, path: envFilePath});
};

export const generatePswKeys = () => {
    let keys = checkKeyPairPresence(["PSW_PUBLIC_KEY", "PSW_PRIVATE_KEY"]);
    if (keys.length === 0) {
        console.log("Password Key pair already exists");
        return;
    }
    const { publicKey, privateKey } = generatePair();
    updateEnvFile({"PSW_PUBLIC_KEY": publicKey, "PSW_PRIVATE_KEY": privateKey});
    console.log("Key pair generated successfully. Reloading .env file...");
}

export const generateJwtKeys = () => {
    let keys = checkKeyPairPresence(["JWT_PUBLIC_KEY", "JWT_PRIVATE_KEY"]);
    if (keys.length === 0) {
        console.log("JWT Key pair already exists");
        return;
    }
    const { publicKey, privateKey } = generatePair();
    updateEnvFile({"JWT_PUBLIC_KEY": publicKey, "JWT_PRIVATE_KEY": privateKey});
    console.log("JWT key pair generated successfully. Reloading .env file...");
}

export const encryptString = (stringToEncrypt: string) => {
    const publicKey = process.env.PSW_PUBLIC_KEY;
  
    const encryptedData = crypto.publicEncrypt(
        {
            key: publicKey as KeyLike,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
        },
        // We convert the data string to a buffer using `Buffer.from`
        Buffer.from(stringToEncrypt) as Uint8Array
    );

    return encryptedData.toString("base64");
}

// TODO: Consider adding more params like:
// custom padding and encoding output
export const decryptData = (encryptedData: Buffer) => {
    const privateKey = process.env.PSW_PRIVATE_KEY;
    const passphrase = process.env.ENCRYPTION_PASSPHRASE;

    if (privateKey === undefined) {
        throw new Error("No public key found in .env file");
    }

    if (passphrase === undefined) {
        throw new Error("No passphrase found in .env file");
    }

    try {
        // const decipher = crypto.createDecipheriv('aes-256-cbc', passphrase);
        const decryptedData = crypto.privateDecrypt(
            {
              key: privateKey,
              passphrase: passphrase,
              // In order to decrypt the data, we need to specify the
              // same hashing function and padding scheme that we used to
              // encrypt the data in the previous step
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: "sha256",
            },
            encryptedData as Uint8Array
          );
          
        // The decrypted data is of the Buffer type, which we can convert to a
        // string to reveal the original data
        return decryptedData.toString();
    } catch (error: any) {
        if (error.message.includes('error:0407109F:rsa routines:RSA_padding_check_PKCS1_type_2:pkcs decoding error')) {
            console.error("Decryption failed: Incorrect padding.");
        } else if (error.message.includes('error:04065072:rsa routines:RSA_EAY_PRIVATE_DECRYPT:padding check failed')) {
            console.error("Decryption failed: Incorrect private key or corrupted data.");
        } else if (error.message.includes('error:0407006E:rsa routines:RSA_padding_add_PKCS1_OAEP_mgf1:data too large for key size')) {
            console.error("Decryption failed: Data too large for key size.");
        } else {
            console.error("Decryption failed:", error);
        }
        return null;
    } 
}

export const decryptString = (stringToDecrypt: string) => {
    return decryptData(Buffer.from(stringToDecrypt, "base64"));
}


