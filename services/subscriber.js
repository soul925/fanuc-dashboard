// services/subscriber.js

const {
    ClientSubscription,
    TimestampsToReturn,
    AttributeIds,
    ClientMonitoredItem
} = require("node-opcua");
const logger = require("./logger");

/**
 * Per-Robot Subscriptions Map
 * Key: robotId -> Value: {
 *    subscription: ClientSubscription,
 *    monitoredItems: Map<nodeId, ClientMonitoredItem>
 * }
 */
const robotSubscriptions = new Map();

/**
 * Create or retrieve an existing subscription for a specific robot.
 */
async function createSubscription(robotId, session) {
    if (!robotId || !session) {
        throw new Error("robotId and session are required to create subscription");
    }

    if (robotSubscriptions.has(robotId)) {
        const entry = robotSubscriptions.get(robotId);
        if (entry.subscription && !entry.subscription.isTerminated) {
            return entry.subscription;
        }
    }

    const subscription = ClientSubscription.create(session, {
        requestedPublishingInterval: 500,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 20,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
    });

    const entry = {
        subscription,
        monitoredItems: new Map()
    };
    robotSubscriptions.set(robotId, entry);

    subscription.on("started", () => {
        console.log(`Robot ${robotId} → Subscription Active`);
        logger.info(`[OPC UA] Robot ${robotId} → Subscription Active`, { robotId, module: "Subscriber" });
    });

    subscription.on("terminated", () => {
        console.log(`Robot ${robotId} → Subscription Terminated`);
        logger.info(`[OPC UA] Robot ${robotId} → Subscription Terminated`, { robotId, module: "Subscriber" });
        robotSubscriptions.delete(robotId);
    });

    return subscription;
}

/**
 * Subscribe to a single OPC UA node for a specific robot.
 */
async function subscribeNode(robotId, session, nodeId, callback) {
    // Support signature overload: subscribeNode(session, nodeId, callback)
    if (typeof robotId !== "string" && session && typeof session !== "string") {
        callback = nodeId;
        nodeId = session;
        session = robotId;
        robotId = "default";
    }

    const sub = await createSubscription(robotId, session);
    const entry = robotSubscriptions.get(robotId);

    // If already monitoring this node on this robot, return
    if (entry.monitoredItems.has(nodeId)) {
        return entry.monitoredItems.get(nodeId);
    }

    const item = ClientMonitoredItem.create(
        sub,
        {
            nodeId,
            attributeId: AttributeIds.Value
        },
        {
            samplingInterval: 500,
            discardOldest: true,
            queueSize: 100
        },
        TimestampsToReturn.Both
    );

    item.on("changed", (dataValue) => {
        if (typeof callback === "function") {
            callback({
                robotId,
                nodeId,
                value: dataValue.value?.value ?? null,
                dataType: dataValue.value?.dataType ?? null,
                sourceTimestamp: dataValue.sourceTimestamp,
                serverTimestamp: dataValue.serverTimestamp
            });
        }
    });

    entry.monitoredItems.set(nodeId, item);
    console.log(`Robot ${robotId} → Monitored Item Added (${nodeId})`);
    return item;
}

/**
 * Stop monitoring one node on a specific robot.
 */
async function unsubscribeNode(robotId, nodeId) {
    const entry = robotSubscriptions.get(robotId);
    if (!entry) return;

    const item = entry.monitoredItems.get(nodeId);
    if (!item) return;

    try {
        await item.terminate();
    } catch {}

    entry.monitoredItems.delete(nodeId);
    console.log(`Robot ${robotId} → Monitored Item Removed (${nodeId})`);
}

/**
 * Terminate subscription and clear all monitored items for a specific robot.
 */
async function terminateSubscription(robotId) {
    if (!robotId) {
        // If called without robotId, terminate all robot subscriptions
        const allIds = Array.from(robotSubscriptions.keys());
        for (const id of allIds) {
            await terminateSubscription(id);
        }
        return;
    }

    const entry = robotSubscriptions.get(robotId);
    if (!entry) return;

    for (const [nodeId, item] of entry.monitoredItems.entries()) {
        try {
            await item.terminate();
        } catch {}
    }
    entry.monitoredItems.clear();

    if (entry.subscription) {
        try {
            await entry.subscription.terminate();
        } catch {}
    }

    robotSubscriptions.delete(robotId);
    console.log(`Robot ${robotId} → Subscription Terminated`);
}

/**
 * Check if a robot has an active subscription.
 */
function hasActiveSubscription(robotId) {
    return robotSubscriptions.has(robotId);
}

module.exports = {
    createSubscription,
    subscribeNode,
    unsubscribeNode,
    terminateSubscription,
    hasActiveSubscription
};