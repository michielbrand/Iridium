import * as Bluebird from "bluebird";
import * as MongoDB from "mongodb";
import * as _ from "lodash";
import * as http from "http";
import * as events from "events";

import {Configuration} from "./Configuration";
import {Plugin} from "./Plugins";
import {Model} from "./Model";
import {Instance} from "./Instance";

import {MiddlewareFactory} from "./Middleware";
import * as ExpressMiddleware from "./middleware/Express";
import {ExpressMiddlewareFactory} from "./middleware/Express";

import {Cache} from "./Cache";
import {NoOpCache} from "./caches/NoOpCache";
import {MemoryCache} from "./caches/MemoryCache";

import {BuildUrl} from "./utils/UrlBuilder";

/**
 * The Iridium Core, responsible for managing the connection to the database as well
 * as any plugins you are making use of.
 *
 * Generally you will subclass this to provide your own custom core with the models you
 * make use of within your application.
 */
export class Core {
    /**
     * Creates a new Iridium Core instance connected to the specified MongoDB instance
     * @param {Iridium.IridiumConfiguration} config The config object defining the database to connect to
     * @constructs Core
     */
    constructor(config: Configuration);
    /**
     * Creates a new Iridium Core instance connected to the specified MongoDB instance
     * @param {String} url The URL of the MongoDB instance to connect to
     * @param {Iridium.IridiumConfiguration} config The config object made available as settings
     * @constructs Core
     */
    constructor(uri: string, config?: Configuration);
    constructor(uri: string | Configuration, config?: Configuration) {
        if (typeof uri === "string") {
            this._url = uri;
            this._config = config;
        } else if (uri) {
            this._config = uri;
        } else {
            throw new Error("Expected either a URI or config object to be supplied when initializing Iridium");
        }
    }

    private mongoConnectAsyc = Bluebird.promisify<MongoDB.MongoClient, string, MongoDB.MongoClientOptions>(MongoDB.MongoClient.connect);

    private _plugins: Plugin[] = [];
    private _url: string;
    private _config: Configuration|undefined;
    private _connection: MongoDB.Db|undefined;
    private _client: MongoDB.MongoClient | undefined;
    private _cache: Cache = new NoOpCache();

    private _connectPromise: Bluebird<MongoDB.MongoClient>|undefined;

    /**
     * Gets the plugins registered with this Iridium Core
     * @returns {Iridium.Plugin[]}
     */
    get plugins(): Plugin[] {
        return this._plugins;
    }

    /**
     * Gets the configuration specified in the construction of this
     * Iridium Core.
     * @returns {Iridium.Configuration}
     */
    get settings(): Configuration|undefined {
        return this._config;
    }

    /**
     * Gets the currently active database connection for this Iridium
     * Core.
     * @returns {MongoDB.Db}
     */
    get connection(): MongoDB.Db {
        if (!this._connection) throw new Error("Iridium Core not connected to a database.");
        return this._connection;
    }

    /**
     * Gets the currently active database client for this Iridium
     * Core.
     * @returns {MongoDB.MongoClient}
   */
    get client(): MongoDB.MongoClient {
        if (!this._client)
        throw new Error("Iridium Core not connected to a client.");
        return this._client;
    }

    /**
     * Gets the URL used to connect to MongoDB
     * @returns {String}
     */
    get url(): string {
        if (this._url) return this._url;
        if (!this._config) throw new Error("No URL or configuration provided");

        return BuildUrl(this._config);
    }

    /**
     * Gets the cache used to store objects retrieved from the database for performance reasons
     * @returns {cache}
     */
    get cache(): Cache {
        return this._cache;
    }

    set cache(value: Cache) {
        this._cache = value;
    }

    /**
     * Registers a new plugin with this Iridium Core
     * @param {Iridium.Plugin} plugin The plugin to register with this Iridium Core
     * @returns {Iridium.Core}
     */
    register(plugin: Plugin): Core {
        this.plugins.push(plugin);
        return this;
    }

    /**
     * Connects to the database server specified in the provided configuration
     * @param {function} [callback] A callback to be triggered once the connection is established.
     * @returns {Promise}
     */
    connect(callback?: (err: Error, core: Core) => any): Bluebird<Core> {
        return Bluebird.resolve().then(() => {
            if (this._client) return this._client;
            if (this._connectPromise) return this._connectPromise;
            return this._connectPromise = this.mongoConnectAsyc(this.url, this._config && this._config.options || {});
        }).then((client: MongoDB.MongoClient) => {
            this._client = client;
            return this.onConnecting(client.db());
        }).then(connection => {
            this._connection = connection
            this._connectPromise = undefined;
            return this.onConnected();
        }).then(() => {
            return this;
        }, (err) => {
            if (this._client) this._client.close();
            this._client = undefined;
            this._connection = undefined;
            this._connectPromise = undefined;
            return Bluebird.reject(err);
        }).nodeify(callback);
    }

    /**
     * Closes the active database connection
     * @type {Promise}
     */
    close(): Bluebird<Core> {
        return Bluebird.resolve().then(() => {
            if (!this._client) return this;
            let client: MongoDB.MongoClient = this._client;
            this._client = undefined;
            this._connection = undefined;
            client.close();
            return this;
        });
    }

    /**
     * Provides an express middleware which can be used to set the req.db property
     * to the current Iridium instance.
     * @returns {Iridium.ExpressMiddleware}
     */
    express(): ExpressMiddleware.ExpressMiddleware {
        return ExpressMiddlewareFactory(this);
    }

    /**
     * A method which is called whenever a new connection is made to the database.
     *
     * @param {MongoDB.Db} connection The underlying MongoDB connection which was created, you can modify or replace this if you wish.
     * @returns A promise for the connection, allowing you to perform any asynchronous initialization required by your application.
     *
     * In subclassed Iridium Cores this method can be overridden to manipulate the properties
     * of the underlying MongoDB connection object, such as authenticating. Until this method
     * resolves a connection object, Iridium will be unable to execute any queries. If you wish
     * to run Iridium queries then look at the onConnected method.
     */
    protected onConnecting(connection: MongoDB.Db): PromiseLike<MongoDB.Db> {
        return Bluebird.resolve(connection);
    }

    /**
     * A method which is called once a database connection has been established and accepted by Iridium
     *
     * In subclassed Iridium cores this method can be overridden to perform tasks whenever a
     * connection to the database has been established - such as setting up indexes for your
     * collections or seeding the database.
     */
    protected onConnected(): PromiseLike<void> {
        return Bluebird.resolve();
    }
}
