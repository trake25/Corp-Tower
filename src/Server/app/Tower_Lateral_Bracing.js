"use strict";

const EPSILON = 0.000000001;

function number(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
}

function compareGroups(left, right) {
    return left.key.localeCompare(right.key);
}

function groupRisk(group) {
    return Math.max(
        number(group.interface?.balanceRisk),
        number(group.interface?.integrityRisk)
    );
}

function compareNeed(left, right) {
    const risk = groupRisk(right) - groupRisk(left);
    if (Math.abs(risk) > EPSILON) return risk;
    const ratio = number(right.interface?.loadRatio) - number(left.interface?.loadRatio);
    if (Math.abs(ratio) > EPSILON) return ratio;
    const leftDependent = Math.max(0, number(left.loadMass) - number(left.mass));
    const rightDependent = Math.max(0, number(right.loadMass) - number(right.mass));
    if (Math.abs(rightDependent - leftDependent) > EPSILON) {
        return rightDependent - leftDependent;
    }
    if (Math.abs(number(right.loadMass) - number(left.loadMass)) > EPSILON) {
        return number(right.loadMass) - number(left.loadMass);
    }
    return compareGroups(left, right);
}

function cellKey(x, y) {
    return `${x},${y}`;
}

function addValue(map, key, amount) {
    map.set(key, number(map.get(key)) + amount);
}

function sideContacts(groups) {
    const occupancy = new Map();
    const contacts = new Map();

    for (const group of groups) {
        for (const member of group.members || []) {
            for (const cell of member.cells || []) {
                occupancy.set(cellKey(cell.x, cell.y), group);
            }
        }
    }

    for (const group of groups.slice().sort(compareGroups)) {
        for (const member of group.members || []) {
            for (const cell of member.cells || []) {
                const neighbour = occupancy.get(cellKey(cell.x + 1, cell.y));
                if (!neighbour || neighbour === group) continue;
                const pair = [group, neighbour].sort(compareGroups);
                const pairKey = `${pair[0].key}|${pair[1].key}`;
                const record = contacts.get(pairKey) || {
                    key: pairKey,
                    groups: pair,
                    faces: new Set()
                };
                record.faces.add(`${cell.x + 1}:${cell.y}`);
                contacts.set(pairKey, record);
            }
        }
    }

    return Array.from(contacts.values()).sort((left, right) => (
        left.key.localeCompare(right.key)
    )).map(contact => ({
        key: contact.key,
        groups: contact.groups,
        faceCount: contact.faces.size
    }));
}

function downstreamGroups(source) {
    const found = new Set();
    const queue = [source];

    while (queue.length > 0) {
        const group = queue.shift();
        for (const link of group.supportLinks || []) {
            if (!link.supporter || found.has(link.supporter)) continue;
            found.add(link.supporter);
            queue.push(link.supporter);
        }
    }

    return found;
}

function hasGroundPath(group, visiting = new Set()) {
    if (!group || visiting.has(group)) return false;
    if ((group.contacts || []).some(contact => !contact.supporter)) return true;
    const next = new Set(visiting);
    next.add(group);
    return (group.supportLinks || []).some(link => (
        link.supporter && hasGroundPath(link.supporter, next)
    ));
}

function independentRouting(brace, source) {
    const reachability = new Map();

    const reachesGround = (group, visiting = new Set()) => {
        if (!group || group === source) return false;
        if (reachability.has(group)) return reachability.get(group);
        if (visiting.has(group)) return false;
        if ((group.contacts || []).some(contact => !contact.supporter)) {
            reachability.set(group, true);
            return true;
        }
        const next = new Set(visiting);
        next.add(group);
        const reaches = (group.supportLinks || []).some(link => (
            link.supporter && reachesGround(link.supporter, next)
        ));
        reachability.set(group, reaches);
        return reaches;
    };

    if (!reachesGround(brace)) return null;

    const routeLinks = new Map();
    const buildRoutes = group => {
        if (routeLinks.has(group)) return;
        const eligible = (group.supportLinks || []).filter(link => (
            !link.supporter || reachesGround(link.supporter)
        ));
        const total = eligible.reduce((sum, link) => sum + Math.max(0, number(link.weight)), 0);
        const routes = eligible.map(link => ({
            supporter: link.supporter,
            weight: total > EPSILON ? Math.max(0, number(link.weight)) / total : 0
        })).filter(link => link.weight > EPSILON);
        routeLinks.set(group, routes);
        for (const link of routes) {
            if (link.supporter) buildRoutes(link.supporter);
        }
    };
    buildRoutes(brace);

    const sourceDownstream = downstreamGroups(source);
    sourceDownstream.add(source);
    const pathShares = new Map();
    const addPath = (group, share) => {
        if (!group || share <= EPSILON || sourceDownstream.has(group)) return;
        pathShares.set(group, number(pathShares.get(group)) + share);
        for (const link of routeLinks.get(group) || []) {
            if (link.supporter) addPath(link.supporter, share * link.weight);
        }
    };
    addPath(brace, 1);

    return pathShares.size > 0 ? { routeLinks, pathShares } : null;
}

function candidateFor(source, brace, contact) {
    if (number(source.loadMass) - number(source.mass) <= EPSILON) return null;
    if (!hasGroundPath(source)) return null;
    const sourceDependent = Math.max(0, number(source.loadMass) - number(source.mass));
    const braceDependent = Math.max(0, number(brace.loadMass) - number(brace.mass));
    if (
        groupRisk(source) <= groupRisk(brace) + EPSILON &&
        number(source.interface?.loadRatio) <= number(brace.interface?.loadRatio) + EPSILON &&
        sourceDependent <= braceDependent + EPSILON
    ) return null;
    if (downstreamGroups(source).has(brace)) return null;
    const routing = independentRouting(brace, source);
    if (!routing) return null;
    return {
        key: `${source.key}->${brace.key}`,
        source,
        brace,
        faceCount: contact.faceCount,
        routeLinks: routing.routeLinks,
        pathShares: routing.pathShares,
        acceptedMass: 0
    };
}

function candidatesFor(groups) {
    const candidates = [];

    for (const contact of sideContacts(groups)) {
        const ordered = contact.groups.slice().sort(compareNeed);
        const preferred = candidateFor(ordered[0], ordered[1], contact);
        const fallback = preferred ? null : candidateFor(ordered[1], ordered[0], contact);
        if (preferred || fallback) candidates.push(preferred || fallback);
    }

    return candidates.sort((left, right) => left.key.localeCompare(right.key));
}

function availableCapacity(candidate, residual) {
    let available = Infinity;

    for (const [group, pathShare] of candidate.pathShares) {
        if (pathShare <= EPSILON) continue;
        available = Math.min(available, Math.max(0, number(residual.get(group))) / pathShare);
    }

    return Number.isFinite(available) ? Math.max(0, available) : 0;
}

function reserveCapacity(candidate, amount, residual) {
    for (const [group, pathShare] of candidate.pathShares) {
        residual.set(group, Math.max(
            0,
            number(residual.get(group)) - amount * pathShare
        ));
    }
}

function allocateForSource(source, sourceCandidates, configuredShare, residual) {
    let remaining = Math.max(0, number(source.loadMass)) * configuredShare;
    let active = sourceCandidates.slice().sort((left, right) => left.key.localeCompare(right.key));

    while (remaining > EPSILON && active.length > 0) {
        const roundRequest = remaining;
        const totalWeight = active.reduce((sum, candidate) => sum + candidate.faceCount, 0);
        const desired = new Map(active.map(candidate => [
            candidate,
            totalWeight > 0 ? roundRequest * candidate.faceCount / totalWeight : 0
        ]));
        const pathDemand = new Map();
        for (const candidate of active) {
            for (const [group, pathShare] of candidate.pathShares) {
                addValue(pathDemand, group, desired.get(candidate) * pathShare);
            }
        }
        let scale = 1;
        for (const [group, demand] of pathDemand) {
            if (demand <= EPSILON) continue;
            scale = Math.min(scale, Math.max(0, number(residual.get(group))) / demand);
        }
        scale = Math.max(0, Math.min(1, scale));
        let accepted = 0;

        for (const candidate of active) {
            const amount = desired.get(candidate) * scale;
            if (amount <= EPSILON) continue;
            candidate.acceptedMass += amount;
            reserveCapacity(candidate, amount, residual);
            accepted += amount;
        }

        if (accepted <= EPSILON) break;
        remaining = Math.max(0, remaining - accepted);
        active = active.filter(candidate => availableCapacity(candidate, residual) > EPSILON);
    }
}

function allocate(groups, share) {
    const configuredShare = Math.max(0, Math.min(1, number(share)));
    if (configuredShare <= EPSILON) return [];

    const candidates = candidatesFor(groups);
    const residual = new Map(groups.map(group => [
        group,
        Math.max(0, number(group.interface?.supportCapacity) - number(group.loadMass))
    ]));
    const bySource = new Map();

    for (const candidate of candidates) {
        const list = bySource.get(candidate.source) || [];
        list.push(candidate);
        bySource.set(candidate.source, list);
    }

    for (const source of Array.from(bySource.keys()).sort(compareGroups)) {
        allocateForSource(source, bySource.get(source), configuredShare, residual);
    }

    return candidates.filter(candidate => candidate.acceptedMass > EPSILON).map(candidate => ({
        ...candidate,
        acceptedMoment: candidate.acceptedMass * number(candidate.source.loadMoment) /
            Math.max(EPSILON, number(candidate.source.loadMass)),
        weight: candidate.acceptedMass / Math.max(EPSILON, number(candidate.source.loadMass))
    }));
}

module.exports = { allocate, sideContacts };
