Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let node_crypto = require("node:crypto");
node_crypto = __toESM(node_crypto);
let _hocuspocus_common = require("@hocuspocus/common");
let _hocuspocus_server = require("@hocuspocus/server");
let _sesamecare_oss_redlock = require("@sesamecare-oss/redlock");
let iovalkey = require("iovalkey");
iovalkey = __toESM(iovalkey);

//#region packages/extension-redis/src/Redis.ts
var Redis = class {
	constructor(configuration) {
		this.priority = 1e3;
		this.configuration = {
			port: 6379,
			host: "127.0.0.1",
			prefix: "hocuspocus",
			identifier: `host-${node_crypto.default.randomUUID()}`,
			lockTimeout: 1e3,
			disconnectDelay: 1e3
		};
		this.redisTransactionOrigin = { source: "redis" };
		this.locks = /* @__PURE__ */ new Map();
		this.pendingAfterStoreDocumentResolves = /* @__PURE__ */ new Map();
		this.handleIncomingMessage = async (channel, data) => {
			const [identifier, messageBuffer] = this.decodeMessage(data);
			if (identifier === this.configuration.identifier) return;
			const message = new _hocuspocus_server.IncomingMessage(messageBuffer);
			const documentName = message.readVarString();
			message.writeVarString(documentName);
			const document = this.instance.documents.get(documentName);
			if (!document) return;
			await new _hocuspocus_server.MessageReceiver(message, this.redisTransactionOrigin).apply(document, void 0, (reply) => {
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
			this.pub = new iovalkey.default.Cluster(nodes, options);
			this.sub = new iovalkey.default.Cluster(nodes, options);
		} else {
			this.pub = new iovalkey.default(port, host, options ?? {});
			this.sub = new iovalkey.default(port, host, options ?? {});
		}
		this.sub.on("messageBuffer", this.handleIncomingMessage);
		this.redlock = new _sesamecare_oss_redlock.Redlock([this.pub], { retryCount: 0 });
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
		const syncMessage = new _hocuspocus_server.OutgoingMessage(documentName).createSyncMessage().writeFirstSyncStepFor(document);
		return this.pub.publish(this.pubKey(documentName), this.encodeMessage(syncMessage.toUint8Array()));
	}
	/**
	* Let’s ask Redis who is connected already.
	*/
	async requestAwarenessFromOtherInstances(documentName) {
		const awarenessMessage = new _hocuspocus_server.OutgoingMessage(documentName).writeQueryAwareness();
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
			if (error instanceof _sesamecare_oss_redlock.ExecutionError && error.message === "The operation was unable to achieve a quorum during its retry window.") throw new _hocuspocus_common.SkipFurtherHooksError("Another instance is already storing this document");
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
		if ((0, _hocuspocus_server.isTransactionOrigin)(lastTransactionOrigin) && lastTransactionOrigin.source === "local") {
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
		const message = new _hocuspocus_server.OutgoingMessage(documentName).createAwarenessUpdateMessage(awareness, changedClients);
		return this.pub.publish(this.pubKey(documentName), this.encodeMessage(message.toUint8Array()));
	}
	/**
	* if the ydoc changed, we'll need to inform other Hocuspocus servers about it.
	*/
	async onChange(data) {
		if ((0, _hocuspocus_server.isTransactionOrigin)(data.transactionOrigin) && data.transactionOrigin.source === "redis") return;
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
		const message = new _hocuspocus_server.OutgoingMessage(data.documentName).writeBroadcastStateless(data.payload);
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
exports.Redis = Redis;
//# sourceMappingURL=hocuspocus-redis.cjs.map