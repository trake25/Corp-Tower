const { createHmac, randomUUID } = require("crypto");

const REQUEST_TIMEOUT_MS = 4000;
const GOOGLE_PROVIDER = "google";
const FACEBOOK_PROVIDER = "facebook";
const EXTERNAL_PROVIDERS = new Set([GOOGLE_PROVIDER, FACEBOOK_PROVIDER]);
const LINK_RESULTS = new Set([
    "accepted",
    "allowed",
    "provider_conflict",
    "identity_conflict",
    "rejected"
]);

function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizedProvider(value) {
    const provider = String(value || "").trim().toLowerCase();
    return EXTERNAL_PROVIDERS.has(provider) ? provider : "";
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

        if (identity.isAnonymous) {
            const anonymousAccount = await this.findOrCreateSupabaseAccount(identity.supabaseUserId);
            return this.identityForAccount(anonymousAccount, identity);
        }

        const user = await this.fetchSupabaseUser(identity.accessToken, identity.supabaseUserId);
        const providers = this.logicalProvidersForUser(user, identity.provider);

        if (providers.size > 1) {
            throw new Error("Verified user has more than one external provider");
        }

        const provider = [...providers][0] || "";

        if (provider === FACEBOOK_PROVIDER) {
            return this.resolveFacebook(
                this.providerSubjectFromUser(user, FACEBOOK_PROVIDER),
                identity.supabaseUserId,
                identity.displayName,
                identity.isAnonymous
            );
        }

        const account = await this.findOrCreateSupabaseAccount(identity.supabaseUserId);

        if (provider === GOOGLE_PROVIDER) {
            this.requireAcceptedClaim(await this.claimProvider(account.id, provider));
        }

        return this.identityForAccount(await this.findAccountById(account.id), identity);
    }

    identityForAccount(account, identity) {
        if (!account) {
            throw new Error("Player account is missing");
        }

        return {
            userId: account.id,
            supabaseUserId: account.supabase_user_id || null,
            linkedProvider: account.linked_provider || null,
            isAnonymous: Boolean(identity.isAnonymous),
            displayName: identity.displayName || null,
            nameOnboardingSeen: Boolean(account.name_onboarding_seen)
        };
    }

    async markNameOnboardingSeen(accountId) {
        await this.request(
            `player_accounts?id=eq.${encodeURIComponent(accountId)}&name_onboarding_seen=eq.false`,
            {
                method: "PATCH",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify({ name_onboarding_seen: true })
            }
        );

        const account = await this.findAccountById(accountId);
        return Boolean(account && account.name_onboarding_seen);
    }

    hashProviderSubject(provider, subject, secret = this.hmacSecret) {
        return createHmac("sha256", secret)
            .update(provider + ":" + subject)
            .digest("base64url");
    }

    async preflightProviderLink(accountId, provider, facebookSubject = null) {
        const normalized = normalizedProvider(provider);

        if (!normalized) {
            return { result: "rejected" };
        }

        const account = await this.findAccountById(accountId);

        if (!account) {
            return { result: "rejected" };
        }

        if (account.linked_provider && account.linked_provider !== normalized) {
            return { result: "provider_conflict" };
        }

        if (normalized === FACEBOOK_PROVIDER && typeof facebookSubject === "string") {
            const found = await this.findFacebookIdentity(facebookSubject);
            if (found && found.player_account_id !== account.id) {
                return { result: "identity_conflict" };
            }
        }

        return { result: "allowed" };
    }

    async commitProviderLink(accountId, expectedSupabaseUserId, credential, provider) {
        const normalized = normalizedProvider(provider);

        if (
            !normalized ||
            !credential ||
            credential.kind !== "supabase" ||
            credential.supabaseUserId !== expectedSupabaseUserId
        ) {
            return { result: "rejected" };
        }

        const account = await this.findAccountById(accountId);

        if (!account || account.supabase_user_id !== expectedSupabaseUserId) {
            return { result: "rejected" };
        }

        const user = await this.fetchSupabaseUser(
            credential.accessToken, credential.supabaseUserId
        );
        const providers = this.logicalProvidersForUser(user, credential.provider);

        if (providers.size > 1 || !providers.has(normalized)) {
            return { result: "provider_conflict" };
        }

        const subject = normalized === FACEBOOK_PROVIDER
            ? this.providerSubjectFromUser(user, FACEBOOK_PROVIDER)
            : null;
        const result = await this.claimProvider(account.id, normalized, subject);
        return { result };
    }

    async resolveFacebook(subject, supabaseUserId, displayName, isAnonymous, knownSupabaseAccount = null) {
        if (typeof subject !== "string" || subject === "") {
            throw new Error("Facebook provider identity is missing");
        }

        const found = await this.findFacebookIdentity(subject);
        const identityAccount = found ? await this.findAccountById(found.player_account_id) : null;

        if (found && !identityAccount) {
            throw new Error("Facebook identity references a missing player account");
        }

        const supabaseAccount = knownSupabaseAccount || (
            supabaseUserId ? await this.findAccountBySupabaseUserId(supabaseUserId) : null
        );

        if (identityAccount && supabaseAccount && identityAccount.id !== supabaseAccount.id) {
            throw new Error("Facebook identity is already linked to another durable account");
        }

        let account = identityAccount || supabaseAccount;

        if (!account) {
            account = supabaseUserId
                ? await this.findOrCreateSupabaseAccount(supabaseUserId)
                : await this.createAccount(null);
        }

        this.requireAcceptedClaim(await this.claimProvider(account.id, FACEBOOK_PROVIDER, subject));

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
        return identity;
    }

    async fetchSupabaseUser(accessToken, expectedUserId) {
        if (typeof accessToken !== "string" || accessToken === "") {
            throw new Error("Supabase access token is missing");
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
            throw new Error("Supabase identity lookup failed");
        }

        const user = await response.json();

        if (!user || String(user.id || "") !== expectedUserId) {
            throw new Error("Supabase identity did not match the verified user");
        }

        return user;
    }

    logicalProvidersForUser(user, fallbackProvider = "") {
        const providers = new Set();

        if (Array.isArray(user && user.identities)) {
            for (const identity of user.identities) {
                const provider = normalizedProvider(identity && identity.provider);
                if (provider) providers.add(provider);
            }
        }

        const fallback = normalizedProvider(fallbackProvider);
        if (!providers.size && fallback) providers.add(fallback);

        return providers;
    }

    providerSubjectFromUser(user, provider) {
        const identity = Array.isArray(user && user.identities)
            ? user.identities.find(candidate => candidate && candidate.provider === provider)
            : null;
        const subject = identity && (identity.provider_id || identity.id);

        if (typeof subject !== "string" || subject === "") {
            throw new Error(`${provider} provider identity is missing`);
        }

        return subject;
    }

    async claimProvider(accountId, provider, facebookSubject = null) {
        const normalized = normalizedProvider(provider);

        if (!normalized) {
            return "rejected";
        }

        const payload = {
            p_account_id: accountId,
            p_provider: normalized
        };

        if (normalized === FACEBOOK_PROVIDER) {
            if (typeof facebookSubject !== "string" || facebookSubject === "") {
                return "rejected";
            }
            payload.p_facebook_key_version = this.hmacKeyVersion;
            payload.p_facebook_subject_hmac = this.hashProviderSubject(
                FACEBOOK_PROVIDER, facebookSubject
            );
        }

        const response = await this.request("rpc/claim_player_provider", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(payload)
        });
        const body = await response.json();
        const rawResult = Array.isArray(body) ? body[0] : body;
        const result = typeof rawResult === "string"
            ? rawResult
            : rawResult && rawResult.claim_player_provider;
        return LINK_RESULTS.has(result) ? result : "rejected";
    }

    requireAcceptedClaim(result) {
        if (result === "accepted") {
            return;
        }

        if (result === "identity_conflict") {
            throw new Error("Provider identity is already linked to another durable account");
        }

        if (result === "provider_conflict") {
            throw new Error("Durable account already has a different external provider");
        }

        throw new Error("Provider claim was rejected");
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
        const existing = await this.findAccountBySupabaseUserId(supabaseUserId);

        if (existing && existing.id !== account.id) {
            throw new Error("Supabase user is already linked to another durable account");
        }

        if (account.supabase_user_id && account.supabase_user_id !== supabaseUserId) {
            throw new Error("Facebook identity is already linked to another Supabase user");
        }

        if (account.supabase_user_id === supabaseUserId) {
            return account;
        }

        await this.request(
            `player_accounts?id=eq.${encodeURIComponent(account.id)}&supabase_user_id=is.null`,
            {
                method: "PATCH",
                headers: { Prefer: "return=minimal" },
                body: JSON.stringify({ supabase_user_id: supabaseUserId })
            }
        );

        const linkedAccount = await this.findAccountById(account.id);

        if (linkedAccount && linkedAccount.supabase_user_id === supabaseUserId) {
            return linkedAccount;
        }

        const competing = await this.findAccountBySupabaseUserId(supabaseUserId);
        if (competing && competing.id !== account.id) {
            throw new Error("Supabase user is already linked to another durable account");
        }

        throw new Error("Supabase account link did not persist");
    }

    async findAccountById(accountId) {
        const rows = await this.fetchRows(
            `player_accounts?id=eq.${encodeURIComponent(accountId)}&select=id,supabase_user_id,name_onboarding_seen,linked_provider`
        );
        return rows[0] || null;
    }

    async findAccountBySupabaseUserId(supabaseUserId) {
        const rows = await this.fetchRows(
            `player_accounts?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&select=id,supabase_user_id,name_onboarding_seen,linked_provider`
        );
        return rows[0] || null;
    }

    async findIdentity(keyVersion, subjectHash) {
        const rows = await this.fetchRows(
            `player_identities?provider=eq.${FACEBOOK_PROVIDER}&key_version=eq.${keyVersion}&subject_hmac=eq.${encodeURIComponent(subjectHash)}&select=player_account_id`
        );
        return rows[0] || null;
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
