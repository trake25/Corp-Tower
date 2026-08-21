const { createRemoteJWKSet, jwtVerify } = require("jose");

const SIGNING_ALGORITHMS = ["RS256", "RS512", "ES256", "ES512", "EdDSA"];
const AUDIENCE = "authenticated";
const DISPLAY_NAME_MAX_LENGTH = 24;
const FACEBOOK_GRAPH_URL = "https://graph.facebook.com/debug_token";

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
        this.facebookAppId = String(
            options.facebookAppId !== undefined
                ? options.facebookAppId
                : process.env.FACEBOOK_APP_ID || ""
        ).trim();
        this.facebookAppSecret = String(
            options.facebookAppSecret !== undefined
                ? options.facebookAppSecret
                : process.env.FACEBOOK_APP_SECRET || ""
        ).trim();
        this.fetchImpl = options.fetchImpl || null;
        this.keyResolver = options.keyResolver || null;
        this.remoteKeySet = null;
    }

    isEnabled() {
        return this.supabaseUrl !== "" || this.isFacebookEnabled();
    }

    isFacebookEnabled() {
        return this.facebookAppId !== "" && this.facebookAppSecret !== "";
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

    async verifyAccessToken(token, provider = "") {
        if (!this.isEnabled() || typeof token !== "string" || token === "") {
            return null;
        }

        if (provider === "facebook") {
            return this.verifyFacebookAccessToken(token);
        }

        if (this.supabaseUrl === "") {
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
                kind: "supabase",
                supabaseUserId: String(payload.sub),
                accessToken: token,
                provider: String(payload.app_metadata && payload.app_metadata.provider || ""),
                isAnonymous: Boolean(payload.is_anonymous),
                displayName: resolveDisplayName(payload)
            };
        } catch (error) {
            console.log("Access token rejected:", error.message);
            return null;
        }
    }

    async verifyFacebookAccessToken(token) {
        if (!this.isFacebookEnabled()) {
            return null;
        }

        try {
            const url = new URL(FACEBOOK_GRAPH_URL);
            url.searchParams.set("input_token", token);
            url.searchParams.set(
                "access_token", this.facebookAppId + "|" + this.facebookAppSecret
            );
            const doFetch = this.fetchImpl || fetch;
            const response = await doFetch(url, { signal: AbortSignal.timeout(4000) });

            if (!response.ok) {
                console.log("Facebook access token rejected: verification request failed");
                return null;
            }

            const result = await response.json();
            const data = result && result.data;

            if (
                !data ||
                data.is_valid !== true ||
                String(data.app_id || "") !== this.facebookAppId ||
                typeof data.user_id !== "string" ||
                data.user_id === ""
            ) {
                console.log("Facebook access token rejected: invalid token data");
                return null;
            }

            return {
                kind: "facebook_native",
                provider: "facebook",
                providerSubject: data.user_id,
                isAnonymous: false,
                displayName: null
            };
        } catch (error) {
            console.log("Facebook access token rejected: verification unavailable");
            return null;
        }
    }
}

module.exports = AuthVerifier;
