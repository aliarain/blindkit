import { parentPort, workerData } from 'node:worker_threads';
import { Ajv } from 'ajv';

const ajv = new Ajv({ strict: false, validateFormats: false, ownProperties: true });
try {
  const validate = ajv.compile(workerData.schema);
  const valid = validate(workerData.args) === true;
  parentPort!.postMessage({ valid, error: valid ? undefined : ajv.errorsText(validate.errors) });
} catch {
  parentPort!.postMessage({ valid: false, error: 'Schema validation failed' });
}
