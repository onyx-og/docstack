export declare const importPublicKey: (pem: string) => Promise<CryptoKey>;
export declare const decryptString: (encrypted: string) => void;
export declare const encryptStringWithPublicKey: (publicKey: CryptoKey, data: string) => Promise<ArrayBuffer>;
