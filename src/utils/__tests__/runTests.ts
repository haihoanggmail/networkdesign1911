import { createTestRunner } from './testHarness';
import { runRackAndAirflowTests } from './rackAndAirflow.test';
import { runCableRoutingAndSpatialTests } from './cableRoutingAndSpatial.test';
import { runPowerAndValidatorTests } from './powerAndValidator.test';
import { runBomExcelAndTemplatesTests } from './bomExcelAndTemplates.test';
import { runStorageSecurityAndPolicyTests } from './storageSecurityAndPolicy.test';
import { runExportersAnd3DTests } from './exportersAnd3D.test';
import { runTrackingTests } from './tracking.test';
import { runPortCompatibilityTests } from './portCompatibility.test';
import { runSprint3FeaturesTests } from './sprint3Features.test';
import { runCadEngineTests } from '../../cad/tests/cadEngine.test';

async function main() {
  const { runTest, getPassedCount } = createTestRunner();

  await runRackAndAirflowTests(runTest);
  await runCableRoutingAndSpatialTests(runTest);
  await runPowerAndValidatorTests(runTest);
  await runBomExcelAndTemplatesTests(runTest);
  await runStorageSecurityAndPolicyTests(runTest);
  await runExportersAnd3DTests(runTest);
  await runTrackingTests(runTest);
  await runPortCompatibilityTests(runTest);
  await runSprint3FeaturesTests(runTest);
  await runCadEngineTests(runTest);

  console.log(`\nALL ${getPassedCount()} TEST SUITES PASSED`);
}

main().catch(err => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
