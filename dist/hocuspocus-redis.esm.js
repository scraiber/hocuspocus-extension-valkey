import crypto from "node:crypto";
import { SkipFurtherHooksError } from "@hocuspocus/common";
import { IncomingMessage, MessageReceiver, OutgoingMessage, isTransactionOrigin } from "@hocuspocus/server";
import { ExecutionError, Redlock } from "@sesamecare-oss/redlock";
import RedisClient from "iovalkey";

//#region packages/extension-redis/src/Redis.ts
var Redis = class {
	constructor(configuration) {
		this.priority = 1e3;
		this.configuration = {
			port: 6379,
			host: "127.0.0.1",
			prefix: "hocuspocus",
			identifier: `host-${crypto.randomUUID()}`,
			lockTimeout: 1e3,
			disconnectDelay: 1e3
		};
		this.redisTransactionOrigin = { source: "redis" };
		this.locks = /* @__PURE__ */ new Map();
		this.pendingAfterStoreDocumentResolves = /* @__PURE__ */ new Map();
		this.handleIncomingMessage = async (channel, data) => {
			const [identifier, messageBuffer] = this.decodeMessage(data);
			if (identifier === this.configuration.identifier) return;
			const message = new IncomingMessage(messageBuffer);
			const documentName = message.readVarString();
			message.writeVarString(documentName);
			const document = this.instance.documents.get(documentName);
			if (!document) return;
			await new MessageReceiver(message, this.redisTransactionOrigin).apply(document, void 0, (reply) => {
				return this.pub.publish(this.pubKey(document.name), this.encodeMessage(reply));
			});
		};
		this.configuration = {
			...this.configuration,
			...configuration
		};
		const { port, host, options, nodes, redis, createClient } = this.configuration;
		if (typeof createClient === "function") {
			this.pub = createClient();
			this.sub = createClient();
		} else if (redis) {
			this.pub = redis.duplicate();
			this.sub = redis.duplicate();
		} else if (nodes && nodes.length > 0) {
			this.pub = new RedisClient.Cluster(nodes, options);
			this.sub = new RedisClient.Cluster(nodes, options);
		} else {
			this.pub = new RedisClient(port, host, options ?? {});
			this.sub = new RedisClient(port, host, options ?? {});
		}
		this.sub.on("messageBuffer", this.handleIncomingMessage);
		this.redlock = new Redlock([this.pub], { retryCount: 0 });
		const identifierBuffer = Buffer.from(this.configuration.identifier, "utf-8");
		this.messagePrefix = Buffer.concat([Buffer.from([identifierBuffer.length]), identifierBuffer]);
	}
	async onConfigure({ instance }) {
		this.instance = instance;
	}
	getKey(documentName) {
		return `${this.configuration.prefix}:${documentName}`;
	}
	pubKey(documentName) {
		return this.getKey(documentName);
	}
	subKey(documentName) {
		return this.getKey(documentName);
	}
	lockKey(documentName) {
		return `${this.getKey(documentName)}:lock`;
	}
	encodeMessage(message) {
		return Buffer.concat([this.messagePrefix, Buffer.from(message)]);
	}
	decodeMessage(buffer) {
		const identifierLength = buffer[0];
		return [buffer.toString("utf-8", 1, identifierLength + 1), buffer.slice(identifierLength + 1)];
	}
	/**
	* Once a document is loaded, subscribe to the channel in Redis.
	*/
	async afterLoadDocument({ documentName, document }) {
		return new Promise((resolve, reject) => {
			this.sub.subscribe(this.subKey(documentName), async (error) => {
				if (error) {
					reject(error);
					return;
				}
				this.publishFirstSyncStep(documentName, document);
				this.requestAwarenessFromOtherInstances(documentName);
				resolve(void 0);
			});
		});
	}
	/**
	* Publish the first sync step through Redis.
	*/
	async publishFirstSyncStep(documentName, document) {
		const syncMessage = new OutgoingMessage(documentName).createSyncMessage().writeFirstSyncStepFor(document);
		return this.pub.publish(this.pubKey(documentName), this.encodeMessage(syncMessage.toUint8Array()));
	}
	/**
	* Let’s ask Redis who is connected already.
	*/
	async requestAwarenessFromOtherInstances(documentName) {
		const awarenessMessage = new OutgoingMessage(documentName).writeQueryAwareness();
		return this.pub.publish(this.pubKey(documentName), this.encodeMessage(awarenessMessage.toUint8Array()));
	}
	/**
	* Before the document is stored, make sure to set a lock in Redis.
	* That’s meant to avoid conflicts with other instances trying to store the document.
	*/
	async onStoreDocument({ documentName }) {
		const resource = this.lockKey(documentName);
		const ttl = this.configuration.lockTimeout;
		try {
			const lock = await this.redlock.acquire([resource], ttl);
			const oldLock = this.locks.get(resource);
			if (oldLock?.release) await oldLock.release;
			this.locks.set(resource, { lock });
		} catch (error) {
			if (error instanceof ExecutionError && error.message === "The operation was unable to achieve a quorum during its retry window.") throw new SkipFurtherHooksError("Another instance is already storing this document");
			console.error("unexpected error:", error);
			throw error;
		}
	}
	/**
	* Release the Redis lock, so other instances can store documents.
	*/
	async afterStoreDocument({ documentName, lastTransactionOrigin }) {
		const lockKey = this.lockKey(documentName);
		const lock = this.locks.get(lockKey);
		if (lock) try {
			lock.release = lock.lock.release();
			await lock.release;
		} catch {} finally {
			this.locks.delete(lockKey);
		}
		if (isTransactionOrigin(lastTransactionOrigin) && lastTransactionOrigin.source === "local") {
			const pending = this.pendingAfterStoreDocumentResolves.get(documentName);
			if (pending) {
				clearTimeout(pending.timeout);
				pending.resolve();
				this.pendingAfterStoreDocumentResolves.delete(documentName);
			}
			let resolveFunction = () => {};
			const delayedPromise = new Promise((resolve) => {
				resolveFunction = resolve;
			});
			const timeout = setTimeout(() => {
				this.pendingAfterStoreDocumentResolves.delete(documentName);
				resolveFunction();
			}, this.configuration.disconnectDelay);
			this.pendingAfterStoreDocumentResolves.set(documentName, {
				timeout,
				resolve: resolveFunction
			});
			await delayedPromise;
		}
	}
	/**
	* Handle awareness update messages received directly by this Hocuspocus instance.
	*/
	async onAwarenessUpdate({ documentName, awareness, added, updated, removed, document }) {
		if ((document?.connections.size || 0) === 0) return;
		const changedClients = added.concat(updated, removed);
		const message = new OutgoingMessage(documentName).createAwarenessUpdateMessage(awareness, changedClients);
		return this.pub.publish(this.pubKey(documentName), this.encodeMessage(message.toUint8Array()));
	}
	/**
	* if the ydoc changed, we'll need to inform other Hocuspocus servers about it.
	*/
	async onChange(data) {
		if (isTransactionOrigin(data.transactionOrigin) && data.transactionOrigin.source === "redis") return;
		return this.publishFirstSyncStep(data.documentName, data.document);
	}
	/**
	* Delay unloading to allow syncs to finish
	*/
	async beforeUnloadDocument(data) {
		return new Promise((resolve) => {
			setTimeout(() => {
				resolve();
			}, this.configuration.disconnectDelay);
		});
	}
	async afterUnloadDocument(data) {
		if (data.instance.documents.has(data.documentName)) return;
		this.sub.unsubscribe(this.subKey(data.documentName), (error) => {
			if (error) console.error(error);
		});
	}
	async beforeBroadcastStateless(data) {
		const message = new OutgoingMessage(data.documentName).writeBroadcastStateless(data.payload);
		return this.pub.publish(this.pubKey(data.documentName), this.encodeMessage(message.toUint8Array()));
	}
	/**
	* Kill the Redlock connection immediately.
	*/
	async onDestroy() {
		await this.redlock.quit();
		this.pub.disconnect(false);
		this.sub.disconnect(false);
	}
};

//#endregion
export { Redis };
//# sourceMappingURL=hocuspocus-redis.esm.js.map