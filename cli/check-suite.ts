#!/usr/bin/env node
/**
 * Repo invariant suite.
 *
 * This is the closest thing ForgeCAD currently has to a traditional unit-test
 * entrypoint: a single assertion-based runner over the curated CLI checks.
 */
import { runCheckApiContractsCli } from './check-api-contracts';
import { runCheckBrepExportCli } from './check-brep-export';
import { runCheckCompilerCli } from './check-compiler';
import { runCheckDimensionsCli } from './check-dimensions';
import { runCheckJsModulesCli } from './check-js-modules';
import { runCheckPlacementReferencesCli } from './check-placement-references';
import { runCheckQueryPropagationCli } from './check-query-propagation';
import { runCheckTransformsCli } from './check-transforms';

export async function runCheckSuiteCli(): Promise<void> {
  await runCheckTransformsCli();
  await runCheckDimensionsCli();
  await runCheckPlacementReferencesCli();
  await runCheckJsModulesCli();
  await runCheckBrepExportCli();
  await runCheckCompilerCli([]);
  await runCheckQueryPropagationCli([]);
  await runCheckApiContractsCli();
  console.log('✓ Invariant suite passed');
}
