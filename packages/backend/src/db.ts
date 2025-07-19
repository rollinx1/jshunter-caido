import type { SDK } from "caido:plugin";

// Simplified configuration interface - only global settings
export interface Config {
    port: number;
    captureTraffic: boolean;
    scope: {
        id: string;
        name: string;
        allowlist: string[];
        denylist: string[];
    };
}

// Default configuration - scope is always reset to "none" on startup
export let config: Config = {
    port: 20450,
    captureTraffic: false,
    scope: {
        id: "none",
        name: "No scope selected",
        allowlist: [],
        denylist: []
    }
};

export class Database {
    private sdk: SDK;
    private db: any = null;

    constructor(sdk: SDK) {
        this.sdk = sdk;
    }

    async init(): Promise<void> {
        try {
            this.sdk.console.log("Database initialization started");

            // Get database instance - Caido handles the file location automatically
            this.db = await this.sdk.meta.db();
            this.sdk.console.log("Database instance created");

            // Create simple config table - NO scope storage
            await this.createTable();
            this.sdk.console.log("Database table created");

            // Load existing config or create default
            await this.loadConfig();
            this.sdk.console.log("Config loaded");

            this.sdk.console.log("Database initialization completed successfully");
        } catch (error) {
            this.sdk.console.error(`Database initialization failed: ${error}`);
            throw error;
        }
    }

    private async createTable(): Promise<void> {
        // Simple global config table - NO scope storage, only basic settings
        const createConfigTableSQL = `
            CREATE TABLE IF NOT EXISTS jshunter_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                port INTEGER NOT NULL DEFAULT 20450,
                capture_traffic INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `;

        await this.db.exec(createConfigTableSQL);
    }

    async loadConfig(): Promise<Config> {
        try {
            if (!this.db) {
                this.sdk.console.log("Database not available, using default config");
                return config;
            }

            this.sdk.console.log("Loading global config from database");

            const stmt = await this.db.prepare("SELECT * FROM jshunter_config WHERE id = 1");
            const result = await stmt.get();

            if (result) {
                this.sdk.console.log(`Loaded config from database: ${JSON.stringify(result)}`);
                config.port = result.port;
                config.captureTraffic = result.capture_traffic === 1;
                // baseUrl removed - always use localhost
            } else {
                // No config exists, create default
                this.sdk.console.log("No config found, creating default");
                // Config is already set to default values, just save the basic settings
                await this.saveConfig({
                    port: config.port,
                    captureTraffic: config.captureTraffic
                });
            }

            return config;
        } catch (error) {
            this.sdk.console.error(`Error loading config: ${error}`);
            // Don't throw here, return default config as fallback
            return config;
        }
    }

    async saveConfig(newConfig: Partial<Config>): Promise<Config> {
        try {
            this.sdk.console.log(`Saving global config: ${JSON.stringify(newConfig)}`);

            // Update current config in memory
            config = { ...config, ...newConfig };

            this.sdk.console.log(`Updated in-memory config: ${JSON.stringify(config)}`);

            if (!this.db) {
                this.sdk.console.log("Database not available, config only updated in memory");
                return config;
            }

            // Only save basic settings to database - NO scope
            const stmt = await this.db.prepare(`
                INSERT OR REPLACE INTO jshunter_config 
                (id, port, capture_traffic, updated_at)
                VALUES (1, ?, ?, datetime('now'))
            `);

            await stmt.run(
                config.port,
                config.captureTraffic ? 1 : 0
            );

            this.sdk.console.log("Config saved to database (scope handled in memory only)");
            return config;
        } catch (error) {
            this.sdk.console.error(`Error saving config: ${error}`);
            throw error;
        }
    }

    getConfig(): Config {
        return { ...config };
    }
}
