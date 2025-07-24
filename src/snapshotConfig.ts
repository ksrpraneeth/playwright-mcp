/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Global configuration for snapshot inclusion.
 * Set PLAYWRIGHT_MCP_INCLUDE_SNAPSHOTS=false to disable automatic snapshots
 * for better performance.
 */
export const snapshotConfig = {
  includeSnapshots: process.env.PLAYWRIGHT_MCP_INCLUDE_SNAPSHOTS !== 'false'
};

// Log the configuration on startup for debugging
if (process.env.PLAYWRIGHT_MCP_DEBUG) {
  console.error('[Playwright MCP] Snapshot inclusion:', snapshotConfig.includeSnapshots);
}