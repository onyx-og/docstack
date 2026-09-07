//! Spike wrapper: rabe's AC17 CP-ABE (the FAME scheme) across the wasm boundary.
//! Keys and ciphertexts travel as serde_json strings - fine for measurement,
//! not a wire format.

use rabe::schemes::ac17::*;
use rabe::utils::policy::pest::PolicyLanguage;
use wasm_bindgen::prelude::*;

fn fail(context: &str, error: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&format!("{context}: {error}"))
}

#[wasm_bindgen]
pub fn setup() -> Result<String, JsValue> {
    let (pk, msk) = rabe::schemes::ac17::setup();
    // The pk/msk are nested as PRE-SERIALIZED strings: rabe-bn's serde emits
    // u64 limbs, and a JSON.parse on the JS side would mangle them past 2^53.
    // JS must treat every blob as opaque.
    let bundle = serde_json::json!({
        "pk": serde_json::to_string(&pk).map_err(|e| fail("pk", e))?,
        "msk": serde_json::to_string(&msk).map_err(|e| fail("msk", e))?,
    });
    Ok(bundle.to_string())
}

#[wasm_bindgen]
pub fn cp_keygen(msk_json: &str, attrs_json: &str) -> Result<String, JsValue> {
    let msk: Ac17MasterKey = serde_json::from_str(msk_json).map_err(|e| fail("msk parse", e))?;
    let attrs: Vec<String> = serde_json::from_str(attrs_json).map_err(|e| fail("attrs parse", e))?;
    let attr_refs: Vec<&str> = attrs.iter().map(String::as_str).collect();
    let sk = rabe::schemes::ac17::cp_keygen(&msk, &attr_refs).map_err(|e| fail("keygen", e))?;
    serde_json::to_string(&sk).map_err(|e| fail("sk serialize", e))
}

#[wasm_bindgen]
pub fn cp_encrypt(pk_json: &str, policy: &str, plaintext: &[u8]) -> Result<String, JsValue> {
    let pk: Ac17PublicKey = serde_json::from_str(pk_json).map_err(|e| fail("pk parse", e))?;
    let ct = rabe::schemes::ac17::cp_encrypt(&pk, policy, plaintext, PolicyLanguage::HumanPolicy)
        .map_err(|e| fail("encrypt", e))?;
    serde_json::to_string(&ct).map_err(|e| fail("ct serialize", e))
}

#[wasm_bindgen]
pub fn cp_decrypt(sk_json: &str, ct_json: &str) -> Result<Vec<u8>, JsValue> {
    let sk: Ac17CpSecretKey = serde_json::from_str(sk_json).map_err(|e| fail("sk parse", e))?;
    let ct: Ac17CpCiphertext = serde_json::from_str(ct_json).map_err(|e| fail("ct parse", e))?;
    rabe::schemes::ac17::cp_decrypt(&sk, &ct).map_err(|e| fail("decrypt", e))
}
