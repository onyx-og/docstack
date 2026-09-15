import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import type { ServerConfig } from "../config/schema.js";

export interface VerifiedToken {
    payload: JWTPayload & { attributes?: unknown };
}

/**
 * Tokens the host issues and tokens it trusts.
 *
 * Issuing is HS256 under `auth.jwt.secret`. Verifying accepts the same secret, and a
 * JWKS URL for an external identity provider when configured; `issuer` and `audience`
 * are enforced when set.
 */
export class TokenService {
    private readonly secret: Uint8Array | null;
    private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;

    constructor(private readonly config: ServerConfig["auth"]) {
        this.secret = config.jwt?.secret ? new TextEncoder().encode(config.jwt.secret) : null;
        this.jwks = config.jwt?.jwks ? createRemoteJWKSet(new URL(config.jwt.jwks)) : null;
    }

    get canIssue(): boolean {
        return this.secret !== null;
    }

    get canVerify(): boolean {
        return this.secret !== null || this.jwks !== null;
    }

    async issue(claims: { sub: string; attributes: string[]; [key: string]: unknown }, ttlSeconds: number): Promise<{ token: string; expiresAt: number }> {
        if (!this.secret) throw new Error("This node has no 'auth.jwt.secret' and cannot issue sessions.");
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = now + ttlSeconds;
        let signer = new SignJWT({ ...claims })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt(now)
            .setExpirationTime(expiresAt)
            .setSubject(claims.sub);
        if (this.config.jwt?.issuer) signer = signer.setIssuer(this.config.jwt.issuer);
        if (this.config.jwt?.audience) signer = signer.setAudience(this.config.jwt.audience);
        return { token: await signer.sign(this.secret), expiresAt: expiresAt * 1000 };
    }

    /** Verifies against the secret first, then the JWKS. `null` when neither accepts it. */
    async verify(token: string): Promise<VerifiedToken | null> {
        const options = { issuer: this.config.jwt?.issuer, audience: this.config.jwt?.audience };
        const attempts: Array<() => Promise<VerifiedToken>> = [];
        if (this.secret) attempts.push(async () => ({ payload: (await jwtVerify(token, this.secret!, options)).payload }));
        if (this.jwks) attempts.push(async () => ({ payload: (await jwtVerify(token, this.jwks!, options)).payload }));
        for (const attempt of attempts) {
            try {
                return await attempt();
            } catch {
                // the next key set may accept it
            }
        }
        return null;
    }
}
