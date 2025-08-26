export declare const hashStringEpoch: (string: string) => string;
export declare const updateEnvFile: (config: {
    [key: string]: string;
}) => void;
export declare const generatePswKeys: () => void;
export declare const generateJwtKeys: () => void;
export declare const encryptString: (stringToEncrypt: string) => string;
export declare const decryptData: (encryptedData: Buffer) => string;
export declare const decryptString: (stringToDecrypt: string) => string;
