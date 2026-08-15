const { createRemoteJWKSet, jwtVerify } = require("jose");

const SIGNING_ALGORITHMS = ["RS256", "RS512", "ES256", "ES512", "EdDSA"];
const AUDIENCE = "authenticated";
const DISPLAY_NAME_MAX_LENGTH = 24;

function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function resolveDisplayName(payload) {
    const metadata = payload.user_metadata || {};
    const candidates = [
        metadata.full_name,
        metadata.name,
        metadata.preferred_username
    ];

    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim() !== "") {
            return candidate.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
        }
    }

    return null;
}

class AuthVerifier {
    constructor(options = {}) {
        this.supabaseUrl = normalizeUrl(
            options.supabaseUrl !== undefined
                ? options.supabaseUrl
                : process.env.SUPABASE_URL
        );
        this.required = options.required !== undefined
            ? Boolean(options.required)
            : process.env.SUPABASE_AUTH_REQUIRED === "true";
        this.keyResolver = options.keyResolver || null;
        this.remoteKeySet = null;
    }

    isEnabled() {
        return this.supabaseUrl !== "";
    }

    isRequired() {
        return this.required && this.isEnabled();
    }

    getIssuer() {
        return this.supabaseUrl + "/auth/v1";
    }

    getKeyResolver() {
        if (this.keyResolver) {
            return this.keyResolver;
        }

        if (!this.remoteKeySet) {
            this.remoteKeySet = createRemoteJWKSet(
                new URL(this.supabaseUrl + "/auth/v1/.well-known/jwks.json")
            );
        }

        return this.remoteKeySet;
    }

    async verifyAccessToken(token) {
        if (!this.isEnabled() || typeof token !== "string" || token === "") {
            return null;
        }

        try {
            const { payload } = await jwtVerify(token, this.getKeyResolver(), {
                issuer: this.getIssuer(),
                audience: AUDIENCE,
                algorithms: SIGNING_ALGORITHMS
            });

            if (!payload.sub) {
                return null;
            }

            return {
                userId: String(payload.sub),
                isAnonymous: Boolean(payload.is_anonymous),
                displayName: resolveDisplayName(payload)
            };
        } catch (error) {
            console.log("Access token rejected:", error.message);
            return null;
        }
    }
}

module.exports = AuthVerifier;
