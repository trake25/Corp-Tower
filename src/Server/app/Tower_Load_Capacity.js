"use strict";

function number(value, fallback) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function resolveCapacityProfile(config) {
    const referenceHeight = Math.max(1, number(config.towerTargetHeight, 30));
    const collapseShare = Math.max(
        0.0001,
        number(config.towerSupportCollapseLoadHeightShare, 1.5)
    );
    const safeShare = Math.max(
        0,
        Math.min(
            collapseShare - 0.0001,
            number(config.towerSupportSafeLoadHeightShare, 0.85)
        )
    );

    return {
        safePerContact: referenceHeight * safeShare,
        collapsePerContact: referenceHeight * collapseShare
    };
}

function assessLoadCapacity(config, supportedLoad, links, disabled) {
    const profile = resolveCapacityProfile(config);
    const usableLinks = links.filter(link => link.width > 0 && link.weight > 0);
    const totalContactFaces = usableLinks.reduce((sum, link) => sum + link.width, 0);
    const aggregateCapacity = totalContactFaces * profile.collapsePerContact;
    const aggregateRatio = supportedLoad / Math.max(0.0001, aggregateCapacity);
    const linkRatios = usableLinks.map(link => {
        const assignedLoad = supportedLoad * link.weight;
        const capacity = link.width * profile.collapsePerContact;
        return assignedLoad / Math.max(0.0001, capacity);
    });
    const loadRatio = Math.max(aggregateRatio, ...linkRatios, 0);
    const supportCapacity = loadRatio > 0
        ? supportedLoad / loadRatio
        : aggregateCapacity;
    const safeRatio = profile.safePerContact / profile.collapsePerContact;
    const loadRisk = disabled
        ? 0
        : clamp01((loadRatio - safeRatio) / Math.max(0.0001, 1 - safeRatio));

    return {
        supportCapacity,
        loadRatio,
        loadRisk,
        safeLoadRatio: safeRatio,
        totalContactFaces
    };
}

module.exports = { assessLoadCapacity, resolveCapacityProfile };
