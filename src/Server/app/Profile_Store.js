const WORD_LIST = [
    "Nova", "Atlas", "Comet", "Ranger", "Echo", "Blaze", "Orbit", "Vertex",
    "Anchor", "Summit", "Drift", "Quartz", "Ember", "Rook", "Talon", "Zephyr"
];

const REQUEST_TIMEOUT_MS = 4000;
const PROFILE_COLUMNS = "player_account_id,display_name,status,name_change_used";

function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function generatedName(profileId) {
    return WORD_LIST[hashString(profileId) % WORD_LIST.length];
}

function normalizeUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function normalizedName(value) {
    return String(value || "").trim();
}

function validateName(value, currentName = "") {
    const candidate = normalizedName(value);
    const length = Array.from(candidate).length;

    if (length < 3 || length > 10 || !/^[\p{L}\p{N} _-]+$/u.test(candidate)) {
        return { ok: false, reason: "invalid_name" };
    }

    if (candidate.toLocaleLowerCase() === normalizedName(currentName).toLocaleLowerCase()) {
        return { ok: false, reason: "unchanged_name" };
    }

    return { ok: true, name: candidate };
}

class ProfileStore {
    constructor(options = {}) {
        this.profiles = new Map();
        this.supabaseUrl = normalizeUrl(
            options.supabaseUrl !== undefined
                ? options.supabaseUrl
                : process.env.SUPABASE_URL
        );
        this.serviceRoleKey = String(
            options.serviceRoleKey !== undefined
                ? options.serviceRoleKey
                : process.env.SUPABASE_SERVICE_ROLE_KEY || ""
        );
        this.fetchImpl = options.fetchImpl || null;
        this.enabled = false;
    }

    async connect() {
        this.enabled = this.supabaseUrl !== "" && this.serviceRoleKey !== "";
        console.log(`Profile store: ${this.enabled ? "Supabase" : "memory"}`);
    }

    async getProfile(profileId, seatIndex, verifiedName = null) {
        const avatarId = "avatar_" + seatIndex;

        if (!profileId) {
            return {
                profileId: null,
                displayName: verifiedName || "Player " + (seatIndex + 1),
                avatarId,
                equipped: {},
                owned: []
            };
        }

        if (this.profiles.has(profileId)) {
            const cached = this.profiles.get(profileId);

            if (
                verifiedName &&
                !cached.nameChangeUsed &&
                cached.displayName !== verifiedName
            ) {
                cached.displayName = verifiedName;
            }

            return cached;
        }

        const profile = {
            profileId,
            displayName: verifiedName || generatedName(profileId),
            avatarId,
            status: "active",
            nameChangeUsed: false,
            equipped: {},
            owned: []
        };

        await this.hydrateFromSupabase(profile, verifiedName);

        this.profiles.set(profileId, profile);
        return profile;
    }

    // Never allowed to break a room: a Supabase outage degrades to the generated
    // name rather than failing the roster the whole match is waiting on.
    async hydrateFromSupabase(profile, verifiedName) {
        if (!this.enabled) {
            return;
        }

        try {
            const row = await this.fetchRow(profile.profileId);

            if (!row) {
                await this.insertRow(profile.profileId, profile.displayName);
                return;
            }

            if (row.display_name) {
                profile.displayName = row.display_name;
            }

            profile.status = row.status || "active";
            profile.nameChangeUsed = Boolean(row.name_change_used);

            await this.patchRow(profile.profileId, {
                last_login_at: new Date().toISOString(),
                ...(row.display_name ? {} : { display_name: profile.displayName })
            });
        } catch (error) {
            console.log(
                `Profile lookup failed for ${profile.profileId}:`, error.message
            );
        }
    }

    async getAuthoritativeProfile(profileId) {
        if (!this.enabled || !profileId) {
            throw new Error("Authoritative profile persistence is unavailable");
        }

        let row = await this.fetchRow(profileId);

        if (!row) {
            await this.insertRow(profileId, generatedName(profileId));
            row = await this.fetchRow(profileId);
        }

        if (!row) {
            throw new Error("Authoritative profile creation did not persist");
        }

        const profile = {
            profileId,
            displayName: row.display_name || generatedName(profileId),
            avatarId: "avatar_0",
            status: row.status || "active",
            nameChangeUsed: Boolean(row.name_change_used),
            equipped: {},
            owned: []
        };

        this.profiles.set(profileId, profile);
        return profile;
    }

    async changeName(profileId, proposedName) {
        if (!this.enabled || !profileId) {
            return { ok: false, reason: "server_error" };
        }

        let current;
        try {
            current = await this.getAuthoritativeProfile(profileId);
        } catch (error) {
            console.log(`Authoritative profile lookup failed for ${profileId}:`, error.message);
            return { ok: false, reason: "server_error" };
        }

        if (current.nameChangeUsed) {
            return { ok: false, reason: "already_used", profile: current };
        }

        const validation = validateName(proposedName, current.displayName);
        if (!validation.ok) {
            return validation;
        }

        try {
            const response = await this.request(
                `player_profiles?player_account_id=eq.${encodeURIComponent(profileId)}&name_change_used=eq.false&select=${PROFILE_COLUMNS}`,
                {
                    method: "PATCH",
                    headers: { Prefer: "return=representation" },
                    body: JSON.stringify({
                        display_name: validation.name,
                        name_change_used: true
                    })
                }
            );
            const rows = await response.json();

            if (!Array.isArray(rows) || rows.length === 0) {
                const latest = await this.getAuthoritativeProfile(profileId);
                return { ok: false, reason: "already_used", profile: latest };
            }

            const row = rows[0];
            const profile = {
                ...current,
                displayName: row.display_name,
                status: row.status || current.status,
                nameChangeUsed: true
            };
            this.profiles.set(profileId, profile);
            return { ok: true, profile };
        } catch (error) {
            if (error && error.status === 409) {
                return { ok: false, reason: "name_taken" };
            }
            console.log(`Profile name change failed for ${profileId}:`, error.message);
            return { ok: false, reason: "server_error" };
        }
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
            const error = new Error(`${init && init.method ? init.method : "GET"} ${path} → ${response.status}`);
            error.status = response.status;
            throw error;
        }

        return response;
    }

    async fetchRow(profileId) {
        const response = await this.request(
            `player_profiles?player_account_id=eq.${encodeURIComponent(profileId)}&select=${PROFILE_COLUMNS}`,
            { method: "GET" }
        );
        const rows = await response.json();

        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async insertRow(profileId, displayName) {
        await this.request("player_profiles", {
            method: "POST",
            headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify([{
                player_account_id: profileId,
                display_name: displayName,
                name_change_used: false,
                last_login_at: new Date().toISOString()
            }])
        });
    }

    async patchRow(profileId, patch) {
        await this.request(`player_profiles?player_account_id=eq.${encodeURIComponent(profileId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(patch)
        });
    }
}

ProfileStore.validateName = validateName;

module.exports = ProfileStore;
