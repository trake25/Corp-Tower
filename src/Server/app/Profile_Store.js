const WORD_LIST = [
    "Nova", "Atlas", "Comet", "Ranger", "Echo", "Blaze", "Orbit", "Vertex",
    "Anchor", "Summit", "Drift", "Quartz", "Ember", "Rook", "Talon", "Zephyr"
];

const REQUEST_TIMEOUT_MS = 4000;
const PROFILE_COLUMNS = "id,display_name,status";

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

            if (verifiedName && cached.displayName !== verifiedName) {
                cached.displayName = verifiedName;
            }

            return cached;
        }

        const profile = {
            profileId,
            displayName: verifiedName || generatedName(profileId),
            avatarId,
            status: "active",
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
            throw new Error(`${init && init.method ? init.method : "GET"} ${path} → ${response.status}`);
        }

        return response;
    }

    async fetchRow(profileId) {
        const response = await this.request(
            `profiles?id=eq.${encodeURIComponent(profileId)}&select=${PROFILE_COLUMNS}`,
            { method: "GET" }
        );
        const rows = await response.json();

        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    async insertRow(profileId, displayName) {
        await this.request("profiles", {
            method: "POST",
            headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify([{
                id: profileId,
                display_name: displayName,
                last_login_at: new Date().toISOString()
            }])
        });
    }

    async patchRow(profileId, patch) {
        await this.request(`profiles?id=eq.${encodeURIComponent(profileId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(patch)
        });
    }
}

module.exports = ProfileStore;
