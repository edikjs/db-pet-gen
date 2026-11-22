import 'dotenv/config';
import {
  createArtifactSink,
  createCheckpointer,
  createModelPort,
  createRunStore,
  createTraceAdapter,
} from './adapters';
import { main } from './cli';
import { loadConfig } from './config';
import { createGenerateWorkflow } from './workflows';

export { main } from './cli';

/** The only place where concrete adapters meet the use case. */
export function bootstrap(): (argv?: string[]) => Promise<number> {
  const config = loadConfig();
  const workflow = createGenerateWorkflow({
    model: createModelPort(config.chat),
    runStore: createRunStore(config.runsDir),
    checkpoints: createCheckpointer(),
    artifacts: createArtifactSink(),
    trace: createTraceAdapter(config.observability),
  });
  return (argv = process.argv) => main(argv, { workflow });
}

if (require.main === module) {
  void bootstrap()().then((code) => {
    process.exitCode = code;
  });
}
