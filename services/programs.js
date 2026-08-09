const opcua = require("./opcua");

exports.getProgram = async (robotId) => {
    const status = await opcua.readStatus(robotId);

    return {
        success: true,
        currentProgram: status.program
    };
};