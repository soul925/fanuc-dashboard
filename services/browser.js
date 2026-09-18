// services/browser.js

const {
    BrowseDirection,
    NodeClass,
    DataType,
    AttributeIds,
    makeNodeId
} = require("node-opcua");

const cache = require("./cache");
const logger = require("./logger");

/**
 * Get recommended widget types based on DataType and Writable flags
 */
function getWidgetTypes(dataType, writable) {
    const widgets = ["card"];
    const typeStr = String(dataType || "");

    switch (typeStr) {
        case "Boolean":
        case "1":
            widgets.push("led");
            if (writable) {
                widgets.push("switch");
                widgets.push("button");
            }
            break;

        case "Double":
        case "Float":
        case "Int16":
        case "Int32":
        case "UInt16":
        case "UInt32":
        case "Byte":
        case "SByte":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
        case "10":
            widgets.push("gauge");
            widgets.push("progress");
            widgets.push("chart");
            break;

        case "String":
        case "12":
        default:
            widgets.push("text");
    }

    return widgets;
}

/**
 * Helper to safely format OPC UA data values
 */
function formatNodeValue(rawVal) {
    if (rawVal === undefined || rawVal === null) return "null";
    if (typeof rawVal === "object") {
        if (Array.isArray(rawVal)) {
            return JSON.stringify(rawVal);
        }
        if (rawVal instanceof Date) {
            return rawVal.toISOString();
        }
        return JSON.stringify(rawVal);
    }
    return String(rawVal);
}

/**
 * Browse immediate children of a specific node for the Browser Navigator Panel.
 * Fast, responsive, and returns rich metadata for table display.
 */
async function browseChildren(robotId, session, targetNodeId = "ObjectsFolder") {
    if (!session) {
        throw new Error(`Robot ${robotId} has no active OPC UA session.`);
    }

    const startNode = targetNodeId || "ObjectsFolder";

    // 1. Read Current Node Information
    let currentNode = {
        nodeId: startNode.toString(),
        browseName: startNode.toString(),
        displayName: startNode.toString(),
        nodeClass: "Object",
        dataType: "--",
        value: null,
        writable: false,
        accessLevel: "--"
    };

    try {
        const [readDisp, readBrowse, readClass, readVal, readAccess] = await session.read([
            { nodeId: startNode, attributeId: AttributeIds.DisplayName },
            { nodeId: startNode, attributeId: AttributeIds.BrowseName },
            { nodeId: startNode, attributeId: AttributeIds.NodeClass },
            { nodeId: startNode, attributeId: AttributeIds.Value },
            { nodeId: startNode, attributeId: AttributeIds.AccessLevel }
        ]);

        if (readDisp.value && readDisp.value.value) {
            currentNode.displayName = readDisp.value.value.text || readDisp.value.value.toString();
        }
        if (readBrowse.value && readBrowse.value.value) {
            currentNode.browseName = readBrowse.value.value.name || readBrowse.value.value.toString();
        }
        if (readClass.value && readClass.value.value !== undefined) {
            currentNode.nodeClass = NodeClass[readClass.value.value] || "Object";
        }
        if (readVal.value && readVal.value.value !== undefined) {
            currentNode.value = readVal.value.value;
            currentNode.dataType = readVal.value.dataType !== undefined
                ? (DataType[readVal.value.dataType] || String(readVal.value.dataType))
                : "--";
        }
        if (readAccess.value && readAccess.value.value !== undefined) {
            const acc = readAccess.value.value || 0;
            currentNode.writable = (acc & 2) !== 0;
            currentNode.accessLevel = (acc & 1 ? "Read " : "") + (acc & 2 ? "Write" : "");
        }
    } catch {}

    // 2. Browse Immediate References
    let browseResult;
    try {
        browseResult = await session.browse({
            nodeId: startNode,
            referenceTypeId: "HierarchicalReferences",
            browseDirection: BrowseDirection.Forward,
            includeSubtypes: true,
            nodeClassMask: 0,
            resultMask: 63
        });
    } catch (err) {
        logger.error(`[OPC UA Browse Error] Node ${startNode}: ${err.message}`, { robotId, module: "OPCUA" });
        throw new Error(`Failed to browse node "${startNode}": ${err.message}`);
    }

    const references = browseResult.references || [];
    const children = [];

    // Batch read values for all variable references for maximum speed
    const variableIndices = [];
    const readRequests = [];

    for (let i = 0; i < references.length; i++) {
        const ref = references[i];
        const refNodeIdStr = ref.nodeId.toString();
        const className = NodeClass[ref.nodeClass] || "Unknown";

        const childNode = {
            nodeId: refNodeIdStr,
            browseName: ref.browseName?.name || refNodeIdStr,
            displayName: ref.displayName?.text || ref.browseName?.name || refNodeIdStr,
            nodeClass: className,
            dataType: "--",
            value: "--",
            rawVal: null,
            writable: false,
            hasChildren: className === "Object" || className === "Folder" || className === "View" || className === "ObjectType"
        };

        if (ref.nodeClass === NodeClass.Variable) {
            variableIndices.push(i);
            readRequests.push(
                { nodeId: ref.nodeId, attributeId: AttributeIds.Value },
                { nodeId: ref.nodeId, attributeId: AttributeIds.AccessLevel }
            );
        }

        children.push(childNode);
    }

    if (readRequests.length > 0) {
        try {
            const dataValues = await session.read(readRequests);
            for (let v = 0; v < variableIndices.length; v++) {
                const childIdx = variableIndices[v];
                const valRes = dataValues[v * 2];
                const accessRes = dataValues[v * 2 + 1];

                if (valRes && valRes.value) {
                    const raw = valRes.value.value;
                    children[childIdx].rawVal = raw;
                    children[childIdx].value = formatNodeValue(raw);
                    if (valRes.value.dataType !== undefined) {
                        children[childIdx].dataType = DataType[valRes.value.dataType] || String(valRes.value.dataType);
                    }
                }

                if (accessRes && accessRes.value && accessRes.value.value !== undefined) {
                    const acc = accessRes.value.value || 0;
                    children[childIdx].writable = (acc & 2) !== 0;
                }
            }
        } catch (err) {
            logger.warn(`[OPC UA Batch Read] Could not read variable values: ${err.message}`, { robotId, module: "OPCUA" });
        }
    }

    // Cache discovered nodes for search & telemetry
    for (const c of children) {
        cache.addNode(robotId, {
            nodeId: c.nodeId,
            browseName: c.browseName,
            displayName: c.displayName,
            nodeClass: c.nodeClass,
            dataType: c.dataType,
            value: c.rawVal,
            writable: c.writable,
            widgetTypes: getWidgetTypes(c.dataType, c.writable)
        });
    }

    return {
        currentNode,
        childrenCount: children.length,
        children
    };
}

/**
 * Browse OPC UA Tree down to maxDepth for the Left-hand Namespace Tree.
 */
async function browseTree(robotId, session, rootNodeId = "ObjectsFolder", currentDepth = 0, maxDepth = 3, visited = new Set()) {
    if (!session) return [];
    const nodeKey = rootNodeId.toString();

    if (visited.has(nodeKey) || currentDepth > maxDepth) {
        return [];
    }
    visited.add(nodeKey);

    let result;
    try {
        result = await session.browse({
            nodeId: rootNodeId,
            referenceTypeId: "HierarchicalReferences",
            browseDirection: BrowseDirection.Forward,
            includeSubtypes: true,
            nodeClassMask: 0,
            resultMask: 63
        });
    } catch (err) {
        return [];
    }

    const nodes = [];
    for (const ref of result.references || []) {
        const className = NodeClass[ref.nodeClass] || "Unknown";
        const node = {
            nodeId: ref.nodeId.toString(),
            browseName: ref.browseName?.name || "",
            displayName: ref.displayName?.text || ref.browseName?.name || ref.nodeId.toString(),
            nodeClass: className,
            dataType: "--",
            value: null,
            writable: false,
            children: []
        };

        // If folder or object, recursively fetch tree down to maxDepth
        if (ref.nodeClass === NodeClass.Object || ref.nodeClass === NodeClass.Folder || ref.nodeClass === NodeClass.View) {
            node.children = await browseTree(
                robotId,
                session,
                ref.nodeId,
                currentDepth + 1,
                maxDepth,
                visited
            );
        }

        nodes.push(node);
    }

    return nodes;
}

/**
 * Detailed property inspection for a selected node.
 */
async function readNodeDetails(robotId, session, nodeId) {
    if (!session) {
        throw new Error(`Robot ${robotId} is not connected.`);
    }

    const [valRes, dispRes, browseRes, classRes, descRes, accessRes, userAccessRes] = await session.read([
        { nodeId, attributeId: AttributeIds.Value },
        { nodeId, attributeId: AttributeIds.DisplayName },
        { nodeId, attributeId: AttributeIds.BrowseName },
        { nodeId, attributeId: AttributeIds.NodeClass },
        { nodeId, attributeId: AttributeIds.Description },
        { nodeId, attributeId: AttributeIds.AccessLevel },
        { nodeId, attributeId: AttributeIds.UserAccessLevel }
    ]);

    const className = classRes.value?.value !== undefined ? (NodeClass[classRes.value.value] || "Unknown") : "--";
    const rawVal = valRes.value?.value ?? null;
    const dataTypeStr = valRes.value?.dataType !== undefined ? (DataType[valRes.value.dataType] || String(valRes.value.dataType)) : "--";
    const accessLevel = accessRes.value?.value || 0;
    const isWritable = (accessLevel & 2) !== 0;

    return {
        nodeId: nodeId.toString(),
        displayName: dispRes.value?.value?.text || "--",
        browseName: browseRes.value?.value?.name || "--",
        description: descRes.value?.value?.text || "--",
        nodeClass: className,
        dataType: dataTypeStr,
        statusCode: valRes.statusCode?.name || "Good",
        sourceTimestamp: valRes.sourceTimestamp ? valRes.sourceTimestamp.toISOString() : "--",
        serverTimestamp: valRes.serverTimestamp ? valRes.serverTimestamp.toISOString() : "--",
        accessLevel: (accessLevel & 1 ? "Read " : "") + (accessLevel & 2 ? "Write" : "--"),
        writable: isWritable,
        value: rawVal,
        formattedValue: formatNodeValue(rawVal)
    };
}

module.exports = {
    browseChildren,
    browseTree,
    readNodeDetails,
    getWidgetTypes,
    formatNodeValue
};
