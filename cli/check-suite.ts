#!/usr/bin/env node
/**
 * Repo invariant suite.
 *
 * This is the closest thing ForgeCAD currently has to a traditional unit-test
 * entrypoint: a single assertion-based runner over the curated CLI checks.
 */
import { runCheckApiContractsCli } from './check-api-contracts';
import { runCheckTextCli } from './check-text';
import { runCheckBrepExportCli } from './check-brep-export';
import { runCheckCompilerCli } from './check-compiler';
import { runCheckDimensionsCli } from './check-dimensions';
import { runCheckExamplesCli } from './check-examples';
import { runCheckJsModulesCli } from './check-js-modules';
import { runCheckPlacementReferencesCli } from './check-placement-references';
import { runCheckQueryPropagationCli } from './check-query-propagation';
import { runCheckConstraintsCli } from './check-constraints';
import { runCheckTransformsCli } from './check-transforms';

export async function runCheckSuiteCli(): Promise<void> {
  await runCheckConstraintsCli([]);
  await runCheckTransformsCli();
  await runCheckDimensionsCli();
  await runCheckPlacementReferencesCli();
  await runCheckJsModulesCli();
  await runCheckBrepExportCli();
  await runCheckCompilerCli([]);
  await runCheckQueryPropagationCli([]);
  await runCheckExamplesCli([]);
  await runCheckApiContractsCli();
  await runCheckTextCli();
  console.log('✓ Invariant suite passed');
}
