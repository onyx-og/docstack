
// Function to convert a string to an ArrayBuffer
const str2ab = (str: string): ArrayBuffer => {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

// Function to import the public key
export const importPublicKey = async(pem: string): Promise<CryptoKey> => {
    // Remove the PEM header and footer
    const pemHeader = "-----BEGIN PUBLIC KEY-----";
    const pemFooter = "-----END PUBLIC KEY-----";
    const pemContents = pem.replace(pemHeader, "").replace(pemFooter, "").replace(/\n/g, "");
    // the pemContent is translated into a base64 string
    const binaryDerString = window.atob(pemContents);
    // the base64 string is converted to an ArrayBuffer
    const binaryDer = str2ab(binaryDerString);
  
    return window.crypto.subtle.importKey(
      "spki",
      binaryDer,
      {
        name: "RSA-OAEP",
        hash: "SHA-256"
      },
      true,
      ["encrypt"]
    );
}

export const encryptStringWithPublicKey = async (publicKey: CryptoKey, data: string): Promise<ArrayBuffer> => {
  const enc = new TextEncoder();
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP"
    },
    publicKey,
    enc.encode(data)
  );
  return encryptedData;
}