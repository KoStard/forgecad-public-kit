#!/usr/bin/env node

import { runCaptureCli } from './forge-capture';

void runCaptureCli({
  command: 'cli/forge-record.ts',
  defaultFormat: 'mp4',
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
