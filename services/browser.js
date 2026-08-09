const {
    BrowseDirection,
    NodeClass,
    AttributeIds
} = require("node-opcua");

const cache = require("./cache");

/*=========================================
    GET AVAILABLE WIDGETS
=========================================*/

function getWidgetTypes(dataType, writable) {

    const widgets = ["card"];

    switch (String(dataType)) {

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

            widgets.push("text");

            break;

        default:

            widgets.push("text");

    }

    return widgets;

}

/*=========================================
    BROWSE OPC UA TREE
=========================================*/

async function browseNode(
    robotId,
    session,
    nodeId = "ObjectsFolder",
    visited = new Set()
) {

    if (visited.has(nodeId.toString())) {
        return [];
    }

    visited.add(nodeId.toString());

    let result;

    try {

        result = await session.browse({

            nodeId,

            referenceTypeId: "HierarchicalReferences",

            browseDirection: BrowseDirection.Forward,

            includeSubtypes: true,

            nodeClassMask: 0,

            resultMask: 63

        });

         console.log(
        "Browsing:",
        nodeId.toString(),
        "->",
        result.references?.length || 0,
        "children"
        );
    }

    catch (err) {

        console.log("Browse Error:", err.message);

        return [];

    }

    const children = [];

    for (const ref of result.references || []) {

    console.log(
        ref.browseName?.name,
        ref.nodeId.toString(),
        NodeClass[ref.nodeClass]
    );

    const node = {

        nodeId: ref.nodeId.toString(),

        browseName: ref.browseName?.name || "",

        displayName: ref.displayName?.text || "",

        nodeClass: NodeClass[ref.nodeClass],

        value: null,

        dataType: null,

        writable: false,

        widgetTypes: [],

        children: []

    };

        if (ref.nodeClass === NodeClass.Variable) {

            try {

                const value = await session.read({

                    nodeId: ref.nodeId,

                    attributeId: AttributeIds.Value

                });

                node.value = value.value?.value ?? null;

                node.dataType = value.value?.dataType?.key ||
                                value.value?.dataType?.toString() ||
                                "";

            }

            catch {}

            try {

                const access = await session.read({

                    nodeId: ref.nodeId,

                    attributeId: AttributeIds.AccessLevel

                });

                node.writable =
                    ((access.value.value || 0) & 2) !== 0;

            }

            catch {}

            node.widgetTypes = getWidgetTypes(
                node.dataType,
                node.writable
            );

        }

        cache.addNode(robotId, node);

        node.children = await browseNode(

            robotId,

            session,

            ref.nodeId,

            visited

        );

        children.push(node);

    }

    return children;

}

module.exports = {

    browseNode

};