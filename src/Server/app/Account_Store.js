const { createHmac, randomUUID } = require("crypto");

const REQUEST_TIMEOUT_MS = 4000;
const FACEBOOK_PROVIDER = "facebook";

function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class AccountStore {
    constructor(options = {}) {
        this.supabaseUrl = normalizeUrl(
            options.supabaseUrl !== undefined ? options.supabaseUrl : process.env.SUPABASE_URL
        );
        this.serviceRoleKey = String(
            options.serviceRoleKey !== undefined
                ? options.serviceRoleKey
                : process.env.SUPABASE_SERVICE_ROLE_KEY || ""
        );
        this.hmacSecret = String(
            options.hmacSecret !== undefined
                ? options.hmacSecret
                : process.env.PLAYER_IDENTITY_HMAC_SECRET || ""
        );
        this.hmacKeyVersion = positiveInteger(
            options.hmacKeyVersion !== undefined
                ? options.hmacKeyVersion
                : process.env.PLAYER_IDENTITY_HMAC_KEY_VERSION,
            1
        );
        this.previousHmacSecret = String(
            options.previousHmacSecret !== undefined
                ? options.previousHmacSecret
                : process.env.PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET || ""
        );
        this.previousHmacKeyVersion = positiveInteger(
            options.previousHmacKeyVersion !== undefined
                ? options.previousHmacKeyVersion
                : process.env.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION,
            0
        );
        this.fetchImpl = options.fetchImpl || null;
        this.enabled = false;
    }

    async connect() {
        this.enabled =
            this.supabaseUrl !== "" &&
            this.serviceRoleKey !== "" &&
            this.hmacSecret !== "";
        console.log(`Account store: ${this.enabled ? "Supabase" : "disabled"}`);
    }

    async resolve(identity) {
        if (!this.enabled || !identity) {
            return null;
        }

        if (identity.kind === "facebook_native") {
            return this.resolveFacebook(
                identity.providerSubject, null, identity.displayName, identity.isAnonymous
            );
        }

        if (identity.kind !== "supabase" || !identity.supabaseUserId) {
            return null;
        }

        if (identity.provider === FACEBOOK_PROVIDER) {
            const providerSubject = await this.fetchFacebookProviderSubject(
                identity.accessToken, identity.supabaseUserId
            );
            return this.resolveFacebook(
                providerSubject,
                identity.supabaseUserId,
                identity.displayName,
                identity.isAnonymous
            );
        }

        const account = await this.findOrCreateSupabaseAccount(identity.supabaseUserId);
        return this.identityForAccount(account, identity);
    }

    identityForAccount(account, identity) {
        return {
            userId: account.id,
            isAnonymous: Boolean(identity.isAnonymous),
            displayName: identity.displayName || null
        };
    }

    hashProviderSubject(provider, subject, secret = this.hmacSecret) {
        return createHmac("sha256", secret)
            .update(provider + ":" + subject)
            .digest("base64url");
    }

    async resolveFacebook(subject, supabaseUserId, displayName, isAnonymous) {
        if (typeof subject !== "string" || subject === "") {
            throw new Error("Facebook provider identity is missing");
        }

        const found = await this.findFacebookIdentity(subject);
        let account = found ? await this.findAccountById(found.player_account_id) : null;

        if (found && !account) {
            throw new Error("Facebook identity references a missing player account");
        }

        if (!account) {
            account = supabaseUserId
                ? await this.findOrCreateSupabaseAccount(supabaseUserId)
                : await this.createAccount(null);
            await this.insertFacebookIdentity(account.id, subject);
            const linkedIdentity = await this.findFacebookIdentity(subject);
            account = linkedIdentity
                ? await this.findAccountById(linkedIdentity.player_account_id)
                : null;

            if (!account) {
                throw new Error("Facebook identity creation did not persist");
            }
        }

        if (supabaseUserId) {
            account = await this.bindSupabaseUser(account, supabaseUserId);
        }

        return this.identityForAccount(account, { displayName, isAnonymous });
    }

    async findFacebookIdentity(subject) {
        const activeHash = this.hashProviderSubject(FACEBOOK_PROVIDER, subject);
        let identity = await this.findIdentity(this.hmacKeyVersion, activeHash);

        if (identity || this.previousHmacSecret === "" || this.previousHmacKeyVersion <= 0) {
            return identity;
        }

        const previousHash = this.hashProviderSubject(
            FACEBOOK_PROVIDER, subject, this.previousHmacSecret
        );
        identity = await this.findIdentity(this.previousHmacKeyVersion, previousHash);

        if (identity) {
            await this.insertIdentity(identity.player_account_id, this.hmacKeyVersion, activeHash);
        }

        return identity;
    }

    async fetchFacebookProviderSubject(accessToken, expectedUserId) {
        if (typeof accessToken !== "string" || accessToken === "") {
            throw new Error("Facebook OAuth access token is missing");
        }

        const doFetch = this.fetchImpl || fetch;
        const response = await doFetch(`${this.supabaseUrl}/auth/v1/user`, {
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
                apikey: this.serviceRoleKey,
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error("Supabase Facebook identity lookup failed");
        }

        const user = await response.json();

        if (!user || String(user.id || "") !== expectedUserId) {
            throw new Error("Supabase Facebook identity did not match the verified user");
        }

        const facebookIdentity = Array.isArray(user.identities)
            ? user.identities.find(identity => identity && identity.provider === FACEBOOK_PROVIDER)
            : null;
        const providerSubject = facebookIdentity && facebookIdentity.provider_id;

        if (typeof providerSubject !== "string" || providerSubject === "") {
            throw new Error("Supabase Facebook provider identity is missing");
        }

        return providerSubject;
    }

    async findOrCreateSupabaseAccount(supabaseUserId) {
        const found = await this.findAccountBySupabaseUserId(supabaseUserId);

        if (found) {
            return found;
        }

        await this.insertAccount(randomUUID(), supabaseUserId);
        const created = await this.findAccountBySupabaseUserId(supabaseUserId);

        if (!created) {
            throw new Error("Supabase account creation did not persist");
        }

        return created;
    }

    async createAccount(supabaseUserId) {
        const id = randomUUID();
        await this.insertAccount(id, supabaseUserId);
        const account = await this.findAccountById(id);

        if (!account) {
            throw new Error("Account creation did not persist");
        }

        return account;
    }

    async bindSupabaseUser(account, supabaseUserId) {
        if (account.supabase_user_id && account.supabase_user_id !== supabaseUserId) {
            throw new Error("Facebook identity is already linked to another Supabase user");
        }

        if (!account.supabase_user_id) {
            await this.request(`player_accounts?id=eq.${encodeURIComponent(account.id)}`, {
                method: "PATCH",
                headers: { Prefer: "return=minimal" },
                body: JSON.stringify({ supabase_user_id: supabaseUserId })
            });
            const linkedAccount = await this.findAccountById(account.id);

            if (!linkedAccount) {
                throw new Error("Supabase account link did not persist");
            }

            return linkedAccount;
        }

        return account;
    }

    async findAccountById(accountId) {
        const rows = await this.fetchRows(
            `player_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,supabase_user_id`
        );
        return rows[0] || null;
    }

    async findAccountBySupabaseUserId(supabaseUserId) {
        const rows = await this.fetchRows(
            `player_accounts?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&select=id,supabase_user_id`
        );
        return rows[0] || null;
    }

    async findIdentity(keyVersion, subjectHash) {
        const rows = await this.fetchRows(
            `player_identities?provider=eq.${FACEBOOK_PROVIDER}&key_version=eq.${keyVersion}&subject_hmac=eq.${encodeURIComponent(subjectHash)}&select=player_account_id`
        );
        return rows[0] || null;
    }

    async insertFacebookIdentity(accountId, subject) {
        return this.insertIdentity(
            accountId,
            this.hmacKeyVersion,
            this.hashProviderSubject(FACEBOOK_PROVIDER, subject)
        );
    }

    async insertIdentity(accountId, keyVersion, subjectHash) {
        await this.request("player_identities", {
            method: "POST",
            headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify([{
                provider: FACEBOOK_PROVIDER,
                key_version: keyVersion,
                subject_hmac: subjectHash,
                player_account_id: accountId
            }])
        });
    }

    async insertAccount(id, supabaseUserId) {
        await this.request("player_accounts", {
            method: "POST",
            headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify([{
                id,
                supabase_user_id: supabaseUserId
            }])
        });
    }

    async fetchRows(path) {
        const response = await this.request(path, { method: "GET" });
        const rows = await response.json();
        return Array.isArray(rows) ? rows : [];
    }

    async request(path, init) {
        const doFetch = this.fetchImpl || fetch;
        const response = await doFetch(`${this.supabaseUrl}/rest/v1/${path}`, {
            ...init,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
                apikey: this.serviceRoleKey,
                Authorization: `Bearer ${this.serviceRoleKey}`,
                "Content-Type": "application/json",
                ...(init && init.headers ? init.headers : {})
            }
        });

        if (!response.ok) {
            throw new Error(`Account store request failed: ${response.status}`);
        }

        return response;
    }
}

module.exports = AccountStore;
