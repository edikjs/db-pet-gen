import 'dotenv/config';
export { main } from './cli/index';
import { main } from './cli/index';

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
