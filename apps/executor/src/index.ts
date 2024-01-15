import { createConfigFromEnvironment } from "./config";
import { Executor } from "./executor";
import { delay } from "./utils";

const main = async () => {
  // Temporary delay to allow for networks to start
  await delay(10000);

  const config = createConfigFromEnvironment();
  const executor = new Executor(config);

  process.on("SIGINT", () => executor.stopExecutor());
  await executor.startExecutor();
};

main();
