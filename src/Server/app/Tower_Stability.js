"use strict";

function cellsFor(entry) {
    const block = entry.block || {};
    const cells = Array.isArray(block.cells) ? block.cells : [];
    return cells.map(cell => ({
        x: Number(cell[0] ?? cell.x ?? 0) + Number(entry.originX ?? 0),
        y: Number(cell[1] ?? cell.y ?? 0) + Number(entry.originY ?? entry.baseHeight ?? 0)
    }));
}

function key(x, y) { return `${x},${y}`; }

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

function number(value, fallback) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
}

function topHeight(entries) {
    return cellsForEntries(entries).reduce((top, cell) => Math.max(top, cell.y + 1), 0);
}

function cellsForEntries(entries) { return entries.flatMap(cellsFor); }

function settleBlock(entries, block, originX, fromY = null) {
    const cells = (block.cells || []).map(cell => ({ x: Number(cell[0]), y: Number(cell[1]) }));
    const anchoredX = Math.round(Number(originX) || 0);
    const occupied = new Set(cellsForEntries(entries).map(cell => key(cell.x, cell.y)));
    const released = fromY === null || fromY === undefined ? NaN : Number(fromY);
    let originY = Number.isFinite(released)
        ? Math.max(0, Math.round(released))
        : topHeight(entries) + 8;
    const collides = y => cells.some(cell => occupied.has(key(cell.x + anchoredX, cell.y + y)));
    while (originY > 0 && !collides(originY - 1)) originY -= 1;
    return { originX: anchoredX, originY };
}

function blockCells(block) {
    return (block?.cells || []).map(cell => ({
        x: Number(cell[0] ?? cell.x ?? 0),
        y: Number(cell[1] ?? cell.y ?? 0)
    }));
}

function isPlacementLegal(entries, block, originX, originY) {
    const cells = blockCells(block);

    if (cells.length === 0 || !Number.isInteger(originX) || !Number.isInteger(originY)) {
        return false;
    }

    if (cells.some(cell => cell.y + originY < 0)) {
        return false;
    }

    const occupied = new Set(cellsForEntries(entries).map(cell => key(cell.x, cell.y)));
    return !cells.some(cell => occupied.has(key(cell.x + originX, cell.y + originY)));
}

function supportedCellsGained(entries, block, originX, originY) {
    const cells = blockCells(block);

    if (cells.length === 0) {
        return 0;
    }

    const occupied = new Set(cellsForEntries(entries).map(cell => key(cell.x, cell.y)));
    const placed = new Set(cells.map(cell => key(cell.x + originX, cell.y + originY)));
    let gained = 0;

    for (const cell of cellsForEntries(entries)) {
        if (cell.y === 0 || occupied.has(key(cell.x, cell.y - 1))) {
            continue;
        }

        if (placed.has(key(cell.x, cell.y - 1))) {
            gained += 1;
        }
    }

    return gained;
}

function canonicalKey(cells) {
    return cells.map(cell => `${cell.y}:${cell.x}`).sort().join(",");
}

function blockId(entry) {
    return String(entry?.block?.id ?? entry?.blockId ?? "");
}

function buildNodes(entries) {
    return entries.map((entry, entryIndex) => {
        const cells = cellsFor(entry);
        const cellKeys = new Set(cells.map(cell => key(cell.x, cell.y)));
        const mass = cells.length;
        const moment = cells.reduce((sum, cell) => sum + cell.x + 0.5, 0);
        return {
            entry,
            entryIndex,
            cells,
            cellKeys,
            mass,
            moment,
            minY: cells.reduce((value, cell) => Math.min(value, cell.y), Infinity),
            maxY: cells.reduce((value, cell) => Math.max(value, cell.y), -Infinity),
            key: canonicalKey(cells),
            contacts: []
        };
    }).filter(node => node.mass > 0).sort((left, right) => left.key.localeCompare(right.key));
}

function buildContacts(nodes) {
    const occupancy = new Map();

    for (const node of nodes) {
        for (const cell of node.cells) {
            if (!occupancy.has(key(cell.x, cell.y))) {
                occupancy.set(key(cell.x, cell.y), node);
            }
        }
    }

    for (const node of nodes) {
        for (const cell of node.cells) {
            const belowKey = key(cell.x, cell.y - 1);
            if (node.cellKeys.has(belowKey)) {
                continue;
            }
            if (cell.y === 0) {
                node.contacts.push({ supporter: null, x: cell.x + 0.5, y: 0 });
                continue;
            }
            const supporter = occupancy.get(belowKey);
            if (supporter && supporter !== node) {
                node.contacts.push({ supporter, x: cell.x + 0.5, y: cell.y });
            }
        }
    }
}

function condense(nodes) {
    let nextIndex = 0;
    const stack = [];
    const components = [];

    for (const node of nodes) {
        node.tarjanIndex = -1;
        node.lowLink = -1;
        node.onStack = false;
    }

    const visit = node => {
        node.tarjanIndex = nextIndex;
        node.lowLink = nextIndex;
        nextIndex += 1;
        stack.push(node);
        node.onStack = true;
        const neighbours = Array.from(new Set(node.contacts.map(contact => contact.supporter).filter(Boolean)))
            .sort((left, right) => left.key.localeCompare(right.key));

        for (const neighbour of neighbours) {
            if (neighbour.tarjanIndex < 0) {
                visit(neighbour);
                node.lowLink = Math.min(node.lowLink, neighbour.lowLink);
            } else if (neighbour.onStack) {
                node.lowLink = Math.min(node.lowLink, neighbour.tarjanIndex);
            }
        }

        if (node.lowLink !== node.tarjanIndex) {
            return;
        }

        const members = [];
        let member = null;
        do {
            member = stack.pop();
            member.onStack = false;
            members.push(member);
        } while (member !== node);
        components.push(members.sort((left, right) => left.key.localeCompare(right.key)));
    };

    for (const node of nodes) {
        if (node.tarjanIndex < 0) {
            visit(node);
        }
    }

    return components.map(members => ({ members, key: members[0].key }))
        .sort((left, right) => left.key.localeCompare(right.key));
}

function buildGroups(nodes) {
    buildContacts(nodes);
    const components = condense(nodes);
    const groupForNode = new Map();
    const groups = components.map((component, index) => {
        const group = {
            id: index,
            key: component.key,
            members: component.members,
            contacts: [],
            dependents: new Set(),
            supportLinks: [],
            mass: 0,
            moment: 0,
            minY: Infinity,
            maxY: -Infinity,
            componentMass: 0,
            pendingDependents: 0,
            loadMass: 0,
            loadMoment: 0,
            interface: null
        };
        component.members.forEach(member => groupForNode.set(member, group));
        return group;
    });

    for (const group of groups) {
        for (const member of group.members) {
            group.mass += member.mass;
            group.moment += member.moment;
            group.minY = Math.min(group.minY, member.minY);
            group.maxY = Math.max(group.maxY, member.maxY);
            for (const contact of member.contacts) {
                const supporter = contact.supporter ? groupForNode.get(contact.supporter) : null;
                if (supporter !== group) {
                    group.contacts.push({ supporter, x: contact.x, y: contact.y });
                }
            }
        }
    }

    for (const group of groups) {
        for (const contact of group.contacts) {
            if (contact.supporter) {
                contact.supporter.dependents.add(group);
            }
        }
    }

    const visited = new Set();
    for (const group of groups) {
        if (visited.has(group)) {
            continue;
        }
        const component = [];
        const queue = [group];
        visited.add(group);
        while (queue.length > 0) {
            const current = queue.shift();
            component.push(current);
            const neighbours = [
                ...current.dependents,
                ...current.contacts.map(contact => contact.supporter).filter(Boolean)
            ];
            for (const neighbour of neighbours) {
                if (!visited.has(neighbour)) {
                    visited.add(neighbour);
                    queue.push(neighbour);
                }
            }
        }
        const componentMass = component.reduce((sum, member) => sum + member.mass, 0);
        component.forEach(member => { member.componentMass = componentMass; });
    }

    groups.forEach(group => {
        group.pendingDependents = group.dependents.size;
        group.loadMass = group.mass;
        group.loadMoment = group.moment;
    });
    return groups;
}

function interfaceFor(group, config, height, disabled) {
    const contactsBySupporter = new Map();
    for (const contact of group.contacts) {
        const supporterKey = contact.supporter ? String(contact.supporter.id) : "ground";
        const record = contactsBySupporter.get(supporterKey) || { supporter: contact.supporter, xs: [] };
        record.xs.push(contact.x);
        contactsBySupporter.set(supporterKey, record);
    }

    const carriedLoadShare = group.componentMass > 0 ? clamp01(group.loadMass / group.componentMass) : 1;
    const carriedCenter = group.loadMass > 0 ? group.loadMoment / group.loadMass : 0;
    const allXs = Array.from(new Set(group.contacts.map(contact => contact.x))).sort((a, b) => a - b);
    const contactWidth = allXs.length;
    const supportCenter = contactWidth > 0 ? (allXs[0] + allXs[allXs.length - 1]) * 0.5 : carriedCenter;
    const halfWidth = contactWidth > 0 ? Math.max(0.5, (allXs[allXs.length - 1] - allXs[0] + 1) * 0.5) : 0.5;
    const signedOffsetShare = contactWidth > 0 ? (carriedCenter - supportCenter) / halfWidth : 1;
    const safeBalance = Math.max(0, number(config.towerBalanceSafeOffsetShare, 0.8));
    const collapseBalance = Math.max(safeBalance + 0.0001, number(config.towerBalanceCollapseOffsetShare, 1.15));
    const maturity = Math.min(1, height / Math.max(1, number(config.towerStabilityMinHeight, 8)));
    const targetHeight = Math.max(0, number(config.towerTargetHeight, 0));
    const heightProgress = targetHeight > 0 ? clamp01(height / targetHeight) : 0;
    const heightPressure = 1 + Math.max(0, number(config.towerHeightPressureGain, 0)) * heightProgress;
    const severity = disabled ? 0 : maturity * heightPressure * Math.max(0, number(config.towerStructuralSeverity, 1));
    const balanceRisk = contactWidth === 0
        ? (disabled ? 0 : 1)
        : clamp01(((Math.abs(signedOffsetShare) - safeBalance) / (collapseBalance - safeBalance)) * severity);
    const links = Array.from(contactsBySupporter.values()).map(record => {
        const xs = Array.from(new Set(record.xs)).sort((left, right) => left - right);
        const center = xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);
        return {
            supporter: record.supporter,
            width: xs.length,
            center,
            rawWeight: xs.length / (1 + Math.abs(center - carriedCenter))
        };
    }).sort((left, right) => {
        const leftKey = left.supporter ? left.supporter.key : "ground";
        const rightKey = right.supporter ? right.supporter.key : "ground";
        return leftKey.localeCompare(rightKey);
    });
    const totalWeight = links.reduce((sum, link) => sum + link.rawWeight, 0);
    links.forEach(link => { link.weight = totalWeight > 0 ? link.rawWeight / totalWeight : 0; });
    const pathConcentration = links.reduce((sum, link) => sum + link.weight * link.weight, 0);
    const redundancyFactor = 1 + Math.max(0, number(config.towerRedundancyBonus, 0.45)) * (1 - pathConcentration);
    const contactShare = contactWidth / Math.max(1, number(config.towerSiteWidth, contactWidth || 1));
    const availableSupportShare = Math.min(1, contactShare * redundancyFactor);
    const requiredSupportShare = Math.pow(carriedLoadShare, Math.max(0.05, number(config.towerStructuralLoadExponent, 0.8)));
    const supportShortfall = contactWidth === 0
        ? 1
        : Math.max(0, requiredSupportShare - availableSupportShare) / Math.max(requiredSupportShare, 0.0001);
    const integrityRisk = disabled ? 0 : clamp01(supportShortfall * severity);
    let direction = "center";
    if (balanceRisk > 0.0001) {
        if (signedOffsetShare > 0.05) direction = "right";
        else if (signedOffsetShare < -0.05) direction = "left";
    }

    return {
        pivotX: supportCenter,
        pivotY: group.minY,
        carriedLoadShare,
        carriedCenter,
        effectiveSupportWidth: contactWidth * redundancyFactor,
        contactWidth,
        pathCount: links.length,
        pathConcentration,
        balanceRisk,
        integrityRisk,
        direction,
        signedBalanceRisk: direction === "center" ? 0 : balanceRisk * (direction === "right" ? 1 : -1),
        supportLinks: links,
        supportShortfall,
        heightProgress
    };
}

function analyseGroups(groups, config, height, disabled) {
    const compare = (left, right) => right.maxY - left.maxY || left.key.localeCompare(right.key);
    const queue = groups.filter(group => group.pendingDependents === 0).sort(compare);

    while (queue.length > 0) {
        const group = queue.shift();
        group.interface = interfaceFor(group, config, height, disabled);
        group.supportLinks = group.interface.supportLinks;
        for (const link of group.supportLinks) {
            if (link.supporter) {
                link.supporter.loadMass += group.loadMass * link.weight;
                link.supporter.loadMoment += group.loadMoment * link.weight;
            }
        }
        const supporters = Array.from(new Set(group.supportLinks.map(link => link.supporter).filter(Boolean))).sort(compare);
        for (const supporter of supporters) {
            supporter.pendingDependents -= 1;
            if (supporter.pendingDependents === 0) {
                queue.push(supporter);
            }
        }
        queue.sort(compare);
    }

    for (const group of groups) {
        if (!group.interface) {
            group.interface = interfaceFor(group, config, height, disabled);
            group.supportLinks = group.interface.supportLinks;
        }
    }
}

function buildStructuralPose(groups, config) {
    const transforms = new Map();
    const poseMaxAngle = Math.max(0, number(config.towerPoseMaxAngleDeg, config.towerMaxTiltAngleDeg ?? 18));
    const poseMaxDip = Math.max(0, number(config.towerPoseMaxDipUnits, 0.18));

    const transformFor = group => {
        if (transforms.has(group)) {
            return transforms.get(group);
        }
        let offsetX = 0;
        let offsetY = 0;
        let angle = 0;
        let failureWeight = 0;
        let totalWeight = 0;
        for (const link of group.supportLinks || []) {
            if (!link.supporter) {
                continue;
            }
            const supporter = transformFor(link.supporter);
            offsetX += supporter.offsetX * link.weight;
            offsetY += supporter.offsetY * link.weight;
            angle += supporter.angle * link.weight;
            failureWeight += supporter.failureWeight * link.weight;
            totalWeight += link.weight;
        }
        if (totalWeight > 0) {
            offsetX /= totalWeight;
            offsetY /= totalWeight;
            angle /= totalWeight;
            failureWeight /= totalWeight;
        }
        const localAngle = group.interface.signedBalanceRisk * poseMaxAngle;
        const localDip = group.interface.integrityRisk * poseMaxDip;
        const centerX = group.mass > 0 ? group.moment / group.mass : group.interface.pivotX;
        const centerY = (group.minY + group.maxY + 1) * 0.5;
        const radians = -localAngle * Math.PI / 180;
        const dx = centerX - group.interface.pivotX;
        const dy = centerY - group.interface.pivotY;
        const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
        const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
        const transform = {
            offsetX: offsetX + rotatedX - dx,
            offsetY: offsetY + rotatedY - dy - localDip,
            angle: angle + localAngle,
            failureWeight: Math.max(failureWeight, group.interface.balanceRisk, group.interface.integrityRisk)
        };
        transforms.set(group, transform);
        return transform;
    };

    const poseByEntry = new Map();
    for (const group of groups) {
        const transform = transformFor(group);
        for (const member of group.members) {
            const centerX = member.mass > 0 ? member.moment / member.mass : 0;
            const centerY = (member.minY + member.maxY + 1) * 0.5;
            const radians = -transform.angle * Math.PI / 180;
            const dx = centerX - group.interface.pivotX;
            const dy = centerY - group.interface.pivotY;
            const rotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
            const rotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
            poseByEntry.set(member.entryIndex, {
                blockId: blockId(member.entry),
                offsetXUnits: transform.offsetX + rotatedX - dx,
                offsetYUnits: transform.offsetY + rotatedY - dy,
                rotationDeg: transform.angle,
                failureWeight: transform.failureWeight
            });
        }
    }

    return Array.from(poseByEntry.entries()).sort((left, right) => left[0] - right[0]).map(([, pose]) => pose);
}

function selectCritical(groups) {
    return groups.slice().sort((left, right) => {
        const leftRisk = left.interface.balanceRisk + left.interface.integrityRisk;
        const rightRisk = right.interface.balanceRisk + right.interface.integrityRisk;
        if (rightRisk !== leftRisk) return rightRisk - leftRisk;
        if (right.interface.carriedLoadShare !== left.interface.carriedLoadShare) {
            return right.interface.carriedLoadShare - left.interface.carriedLoadShare;
        }
        return left.key.localeCompare(right.key);
    })[0] || null;
}

function evaluate(entries, config = {}) {
    if (!entries || entries.length === 0) {
        return {
            stability: 100,
            diagnostics: {
                balance: 100,
                integrity: 100,
                criticalRisk: 0,
                criticalSupport: null,
                comOffset: 0,
                laneImbalance: 0,
                overhangPenalty: 0,
                tiltScore: 0,
                tiltAngleDeg: 0,
                leanDirection: "center",
                slenderness: 0,
                supportRatio: 1,
                heightProgress: 0,
                collapsed: false
            },
            structuralPose: [],
            analysis: { groups: [] }
        };
    }

    const nodes = buildNodes(entries);
    const height = topHeight(entries);
    const disabled = number(config.towerStabilityPressureApplied, 1) <= 0;
    const groups = buildGroups(nodes);
    analyseGroups(groups, config, height, disabled);
    const critical = selectCritical(groups);
    const maxBalanceRisk = groups.reduce((value, group) => Math.max(value, group.interface.balanceRisk), 0);
    const maxIntegrityRisk = groups.reduce((value, group) => Math.max(value, group.interface.integrityRisk), 0);
    const balance = Math.round(100 * (1 - maxBalanceRisk));
    const integrity = Math.round(100 * (1 - maxIntegrityRisk));
    const collapsed = maxBalanceRisk >= 1 || maxIntegrityRisk >= 1;
    const stability = collapsed ? 0 : Math.min(balance, integrity);
    const maxTilt = Math.max(0, number(config.towerMaxTiltAngleDeg, 18));
    const signedBalanceRisk = critical ? critical.interface.signedBalanceRisk : 0;
    const criticalSupport = critical ? {
        id: critical.members.map(member => blockId(member.entry)).filter(Boolean).sort()[0] || null,
        pivotX: critical.interface.pivotX,
        pivotY: critical.interface.pivotY,
        direction: critical.interface.direction,
        balanceRisk: critical.interface.balanceRisk,
        integrityRisk: critical.interface.integrityRisk,
        carriedLoadShare: critical.interface.carriedLoadShare,
        effectiveSupportWidth: critical.interface.effectiveSupportWidth,
        pathCount: critical.interface.pathCount
    } : null;

    return {
        stability,
        diagnostics: {
            balance,
            integrity,
            criticalRisk: Math.max(maxBalanceRisk, maxIntegrityRisk),
            heightProgress: critical ? critical.interface.heightProgress : 0,
            criticalSupport,
            collapsed,
            comOffset: signedBalanceRisk,
            laneImbalance: 0,
            overhangPenalty: 0,
            tiltScore: signedBalanceRisk,
            tiltAngleDeg: signedBalanceRisk * maxTilt,
            leanDirection: critical ? critical.interface.direction : "center",
            slenderness: critical && critical.interface.contactWidth > 0
                ? number(config.towerSiteWidth, critical.interface.contactWidth) / critical.interface.contactWidth
                : 0,
            supportRatio: critical ? 1 - critical.interface.supportShortfall : 1
        },
        structuralPose: buildStructuralPose(groups, config),
        analysis: {
            groups: groups.map(group => ({
                key: group.key,
                carriedLoadShare: group.interface.carriedLoadShare,
                pathConcentration: group.interface.pathConcentration,
                pivotY: group.interface.pivotY,
                balanceRisk: group.interface.balanceRisk,
                integrityRisk: group.interface.integrityRisk
            }))
        }
    };
}

function structuralLean(diagnostics) {
    const d = diagnostics || {};
    if (Number.isFinite(Number(d.tiltScore))) {
        return Number(d.tiltScore);
    }
    return (Number(d.comOffset) || 0) + (Number(d.laneImbalance) || 0);
}

function balanceDelta(before, after, config) {
    const collapse = Math.max(0.0001, Number((config || {}).towerCollapseTiltScore) || 1);
    const leanBefore = Math.abs(structuralLean(before));
    const leanAfter = Math.abs(structuralLean(after));
    const points = ((leanBefore - leanAfter) / collapse) * 100;
    return Math.max(-100, Math.min(100, Math.round(points)));
}

module.exports = {
    cellsFor, topHeight, settleBlock, isPlacementLegal, supportedCellsGained,
    evaluate, structuralLean, balanceDelta
};
