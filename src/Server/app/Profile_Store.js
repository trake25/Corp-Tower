const WORD_LIST = [
    "Nova", "Atlas", "Comet", "Ranger", "Echo", "Blaze", "Orbit", "Vertex",
    "Anchor", "Summit", "Drift", "Quartz", "Ember", "Rook", "Talon", "Zephyr"
];

function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash;
}

class ProfileStore {
    constructor() {
        this.profiles = new Map();
    }

    async connect() {
    }

    async getProfile(profileId, seatIndex) {
        const avatarId = "avatar_" + seatIndex;

        if (!profileId) {
            return {
                profileId: null,
                displayName: "Player " + (seatIndex + 1),
                avatarId,
                equipped: {},
                owned: []
            };
        }

        if (this.profiles.has(profileId)) {
            return this.profiles.get(profileId);
        }

        const profile = {
            profileId,
            displayName: WORD_LIST[hashString(profileId) % WORD_LIST.length],
            avatarId,
            equipped: {},
            owned: []
        };

        this.profiles.set(profileId, profile);
        return profile;
    }
}

module.exports = ProfileStore;
