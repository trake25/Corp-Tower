"use strict";

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

function interfaceRisk(group) {
    return Math.max(0, Number(group.balanceRisk) || 0, Number(group.integrityRisk) || 0);
}

function describeGroups(groups) {
    return groups.map(group => {
        const memberKeys = group.members.map(member => member.key).sort();
        const memberBlockIds = group.members.map(member => {
            return String(member.entry?.block?.id ?? member.entry?.blockId ?? "");
        }).filter(Boolean).sort();
        const supportLinks = (group.attributionSupportLinks || group.supportLinks).map(link => ({
            supporterKey: link.supporter ? link.supporter.key : "ground",
            weight: Number(link.weight) || 0,
            width: Number(link.width) || 0,
            center: Number(link.center) || 0
        }));
        const lateralLinks = (group.lateralLinks || []).map(link => ({
            supporterKey: link.supporter.key,
            weight: Number(link.weight) || 0,
            acceptedMass: Math.max(0, Number(link.acceptedMass) || 0),
            acceptedMoment: Number(link.acceptedMoment) || 0,
            contactFaces: Math.max(0, Number(link.contactFaces) || 0)
        }));
        const boundaryKey = String(group.interface.pivotY);

        return {
            key: group.key,
            signature: `${boundaryKey}:${memberKeys.join("|")}`,
            boundaryKey,
            memberKeys,
            memberBlockIds,
            carriedLoadShare: clamp01(group.interface.carriedLoadShare),
            supportedLoad: Math.max(0, Number(group.interface.supportedLoad) || 0),
            supportedMoment: Number(group.loadMoment) || 0,
            incomingLoad: Math.max(0, Number(group.incomingLoadMass ?? group.loadMass) || 0),
            supportCapacity: Math.max(0, Number(group.interface.supportCapacity) || 0),
            loadRatio: Math.max(0, Number(group.interface.loadRatio) || 0),
            balanceRisk: clamp01(group.interface.balanceRisk),
            integrityRisk: clamp01(group.interface.integrityRisk),
            risk: interfaceRisk(group.interface),
            pivotY: Number(group.interface.pivotY) || 0,
            supportLinks,
            lateralLinks
        };
    });
}

function affectedComponent(result, placedBlockId) {
    return (result?.components || []).find(component => (
        placedBlockId !== "" && (component.blockIds || []).includes(placedBlockId)
    )) || null;
}

function activeComponent(result) {
    return (result?.components || []).slice().sort((left, right) => {
        const heightDifference = Number(right.analysis?.height || 0) -
            Number(left.analysis?.height || 0);
        return heightDifference || Number(left.id) - Number(right.id);
    })[0] || null;
}

function matchingComponent(result, target, placedBlockId) {
    if (!target) return null;
    const targetIds = new Set((target.blockIds || []).filter(id => id !== placedBlockId));
    const ranked = (result?.components || []).map(component => ({
        component,
        overlap: (component.blockIds || []).filter(id => targetIds.has(id)).length
    })).sort((left, right) => {
        return right.overlap - left.overlap || Number(left.component.id) - Number(right.component.id);
    });
    return ranked[0]?.overlap > 0 ? ranked[0].component : null;
}

function componentRisk(component, result) {
    return clamp01(component?.diagnostics?.criticalRisk ?? result?.diagnostics?.criticalRisk ?? 0);
}

function overlapCount(left, right) {
    const rightKeys = new Set(right.memberKeys || []);
    return (left.memberKeys || []).reduce((count, key) => {
        return count + (rightKeys.has(key) ? 1 : 0);
    }, 0);
}

function matchInterface(beforeGroup, afterGroups) {
    const exact = afterGroups.filter(group => group.signature === beforeGroup.signature);
    const candidates = exact.length > 0
        ? exact
        : afterGroups.filter(group => group.boundaryKey === beforeGroup.boundaryKey);

    return candidates.slice().sort((left, right) => {
        const rightOverlap = overlapCount(beforeGroup, right);
        const leftOverlap = overlapCount(beforeGroup, left);

        if (rightOverlap !== leftOverlap) {
            return rightOverlap - leftOverlap;
        }

        return left.key.localeCompare(right.key);
    })[0] || null;
}

function supportShareToPlaced(group, byKey, placedKeys, visiting = new Set(), lateralUsed = false) {
    if (placedKeys.has(group.key)) {
        return 1;
    }

    const visitKey = `${group.key}:${lateralUsed ? 1 : 0}`;
    if (visiting.has(visitKey)) {
        return 0;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(visitKey);

    const downwardShare = group.supportLinks.reduce((share, link) => {
        const supporter = byKey.get(link.supporterKey);

        if (!supporter) {
            return share;
        }

        return share + clamp01(link.weight) * supportShareToPlaced(
            supporter, byKey, placedKeys, nextVisiting, lateralUsed
        );
    }, 0);
    if (lateralUsed) return downwardShare;

    return downwardShare + (group.lateralLinks || []).reduce((share, link) => {
        const supporter = byKey.get(link.supporterKey);
        if (!supporter) return share;
        return share + clamp01(link.weight) * supportShareToPlaced(
            supporter, byKey, placedKeys, nextVisiting, true
        );
    }, 0);
}

function comparisonInterface(group) {
    if (!group) {
        return null;
    }

    return {
        key: group.key,
        signature: group.signature,
        risk: group.risk,
        carriedLoadShare: group.carriedLoadShare,
        boundaryKey: group.boundaryKey
    };
}

function comparePlacement(beforeResult, afterResult, placedEntry) {
    let beforeGroups = Array.isArray(beforeResult?.analysis?.groups)
        ? beforeResult.analysis.groups
        : [];
    let afterGroups = Array.isArray(afterResult?.analysis?.groups)
        ? afterResult.analysis.groups
        : [];
    const placedBlockId = String(placedEntry?.block?.id ?? placedEntry?.blockId ?? "");
    const afterComponent = affectedComponent(afterResult, placedBlockId);
    const activeAfterComponent = activeComponent(afterResult);
    const beforeComponent = matchingComponent(beforeResult, afterComponent, placedBlockId);

    if (afterComponent && afterGroups.some(group => group.componentId !== undefined)) {
        afterGroups = afterGroups.filter(group => group.componentId === afterComponent.id);
    }
    if (beforeComponent && beforeGroups.some(group => group.componentId !== undefined)) {
        beforeGroups = beforeGroups.filter(group => group.componentId === beforeComponent.id);
    } else if (afterComponent && beforeResult?.components?.length > 0) {
        beforeGroups = [];
    }
    const placedKeys = new Set(afterGroups.filter(group => {
        return placedBlockId !== "" && (group.memberBlockIds || []).includes(placedBlockId);
    }).map(group => group.key));
    const afterByKey = new Map(afterGroups.map(group => [group.key, group]));
    const improvements = [];

    for (const beforeGroup of beforeGroups) {
        const afterGroup = matchInterface(beforeGroup, afterGroups);

        if (!afterGroup) {
            continue;
        }

        const directSupportShare = clamp01(supportShareToPlaced(
            afterGroup, afterByKey, placedKeys
        ));
        const riskReduction = Math.max(0, beforeGroup.risk - afterGroup.risk);

        if (directSupportShare <= 0 || riskReduction <= 0) {
            continue;
        }

        improvements.push({
            before: beforeGroup,
            after: afterGroup,
            directSupportShare,
            riskReduction,
            weightedImprovement: riskReduction * beforeGroup.carriedLoadShare * directSupportShare
        });
    }

    improvements.sort((left, right) => {
        if (right.before.risk !== left.before.risk) {
            return right.before.risk - left.before.risk;
        }
        if (right.before.carriedLoadShare !== left.before.carriedLoadShare) {
            return right.before.carriedLoadShare - left.before.carriedLoadShare;
        }
        return left.before.key.localeCompare(right.before.key);
    });

    const critical = improvements[0] || null;
    const rawStructuralUtility = improvements.reduce((total, improvement) => {
        return total + improvement.weightedImprovement;
    }, 0);
    const beforeRisk = afterComponent
        ? componentRisk(beforeComponent, null)
        : componentRisk(null, beforeResult);
    const afterRisk = componentRisk(afterComponent, afterResult);
    const riskIncrease = clamp01(afterRisk - beforeRisk);

    return {
        riskIncrease,
        rawStructuralUtility,
        structuralValue: clamp01(rawStructuralUtility),
        benefitedLoadShare: clamp01(improvements.reduce((total, improvement) => {
            return total + improvement.before.carriedLoadShare * improvement.directSupportShare;
        }, 0)),
        directSupportShare: critical ? critical.directSupportShare : 0,
        isActiveTower: Boolean(
            afterComponent && activeAfterComponent && afterComponent.id === activeAfterComponent.id
        ),
        affectedBeforeRisk: beforeRisk,
        affectedAfterRisk: afterRisk,
        affectedBeforeStability: Number(afterComponent
            ? beforeComponent?.stability ?? 100
            : beforeResult?.stability ?? 100),
        affectedAfterStability: Number(afterComponent?.stability ?? afterResult?.stability ?? 100),
        criticalInterfaceBefore: comparisonInterface(critical?.before),
        criticalInterfaceAfter: comparisonInterface(critical?.after),
        criticalRiskReduction: critical ? critical.riskReduction : 0,
        criticalSaveCandidate: Boolean(critical),
        repairClaimKey: critical?.before.signature || null
    };
}

module.exports = { describeGroups, comparePlacement };
