import type { SDK } from "caido:plugin";

type GlobalConfig = {
  id: number;
  port: number;
  trafficCapture: number;
  inScope: number;
};
type ConfigRow = {
  id: number;
  port: number;
  traffic_capture: number;
  in_scope: number;
};

async function getGlobalConfig(sdk: SDK): Promise<GlobalConfig | undefined> {
  try {
    const db = await sdk.meta.db();

    const select = await db.prepare("SELECT * FROM global_config WHERE id=1");
    const config = await select.get<ConfigRow>();
    if (config) {
      return {
        id: config.id,
        inScope: config.in_scope,
        port: config.port,
        trafficCapture: config.traffic_capture,
      };
    }

    return undefined;
  } catch (err) {
    throw new Error(JSON.stringify(err));
  }
}
async function initDatabase(sdk: SDK) {
  const db = await sdk.meta.db();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS global_config (
      id INTEGER PRIMARY KEY,
      port INTEGER DEFAULT 20450,
      traffic_capture INTEGER DEFAULT 0,
      in_scope INTEGER DEFAULT 1 
    )
  `);
  const globalConfig = await getGlobalConfig(sdk);
  if (!globalConfig) {
    const stmt = await db.prepare(
      `INSERT INTO global_config 
      (id, port, traffic_capture, in_scope) 
      VALUES (1, 20450, 0, 1)`
    );
    await stmt.run();
  }
}

async function updateRow(sdk: SDK, attr: string, value: any) {
  const db = await sdk.meta.db();
  const statement = await db.prepare(
    `UPDATE global_config set ${attr} = (?) WHERE id = 1`
  );
  await statement.run(value);
}

async function updateSettings(sdk: SDK, config: GlobalConfig) {
  await updateRow(sdk, "in_scope", config.inScope);
  await updateRow(sdk, "traffic_capture", config.trafficCapture);
  await updateRow(sdk, "port", config.port);
}

export { getGlobalConfig, updateSettings, initDatabase };
