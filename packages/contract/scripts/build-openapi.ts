import { writeFileSync } from 'node:fs';
import { OPENAPI_PATH, renderOpenApiYaml } from './openapiYaml';

writeFileSync(OPENAPI_PATH, renderOpenApiYaml());
console.log(`wrote ${OPENAPI_PATH}`);
