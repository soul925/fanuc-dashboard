// services/subscriber.js

const {
    ClientSubscription,
    TimestampsToReturn,
    AttributeIds,
    ClientMonitoredItem
} = require("node-opcua");

let subscription = null;
const monitoredItems = new Map();

/**
 * Create subscription
 */
async function createSubscription(session) {

    if (subscription) {
        return subscription;
    }

    subscription = ClientSubscription.create(session, {

        requestedPublishingInterval: 500,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 20,

        maxNotificationsPerPublish: 100,

        publishingEnabled: true,

        priority: 10

    });

    subscription.on("started", () => {

        console.log("Subscription Started");

    });

    subscription.on("terminated", () => {

        console.log("Subscription Terminated");

        subscription = null;

    });

    return subscription;

}

/**
 * Subscribe to one node
 */
async function subscribeNode(session, nodeId, callback) {

    const sub = await createSubscription(session);

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

        callback({

            nodeId,

            value: dataValue.value.value,

            dataType: dataValue.value.dataType,

            sourceTimestamp: dataValue.sourceTimestamp,

            serverTimestamp: dataValue.serverTimestamp

        });

    });

    monitoredItems.set(nodeId, item);

}

/**
 * Stop monitoring one node
 */
async function unsubscribeNode(nodeId) {

    const item = monitoredItems.get(nodeId);

    if (!item) return;

    await item.terminate();

    monitoredItems.delete(nodeId);

}

/**
 * Stop everything
 */
async function terminateSubscription() {

    if (!subscription) return;

    await subscription.terminate();

    monitoredItems.clear();

}

module.exports = {

    createSubscription,

    subscribeNode,

    unsubscribeNode,

    terminateSubscription

};