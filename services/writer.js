//==================================================
// services/writer.js
//==================================================

const {
    DataType,
    Variant,
    VariantArrayType,
    AttributeIds
} = require("node-opcua");

/*=========================================
    WRITE NODE
=========================================*/

async function writeNode(
    session,
    nodeId,
    value,
    dataType = DataType.String
) {

    try {

        const variant = Array.isArray(value)
            ? new Variant({
                dataType,
                arrayType: VariantArrayType.Array,
                value
            })
            : new Variant({
                dataType,
                value
            });

        const statusCode = await session.write({

            nodeId,

            attributeId: AttributeIds.Value,

            value: {
                value: variant
            }

        });

        console.log("=================================");
        console.log("WRITE NODE");
        console.log("Node      :", nodeId);
        console.log("Value     :", value);
        console.log("Data Type :", dataType);
        console.log("Status    :", statusCode.toString());
        console.log("Result    :", statusCode);
        console.log("=================================");

        return {

            success: statusCode.isGood(),

            nodeId,

            value,

            statusCode: statusCode.toString()

        };

    }

    catch (err) {

        console.error("=================================");
        console.error("WRITE ERROR");
        console.error(err);
        console.error("=================================");

        return {

            success: false,

            nodeId,

            error: err.message

        };

    }

}

/*=========================================
    EXPORTS
=========================================*/

module.exports = {

    writeNode

};