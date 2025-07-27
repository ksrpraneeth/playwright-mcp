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

import { z } from 'zod';
import { defineTabTool } from './tool.js';

// Type declaration for window.changeDetector
declare global {
  interface Window {
    changeDetector: any;
  }
}

// Schema for threshold configuration
const thresholdsSchema = z.object({
  major: z.object({
    elementDelta: z.number().optional(),
    dialogDelta: z.number().optional(),
    overlayDelta: z.number().optional(),
    formDelta: z.number().optional(),
    zIndexDelta: z.number().optional(),
    viewportDelta: z.number().optional()
  }).optional(),
  minor: z.object({
    elementDelta: z.number().optional(),
    viewportDelta: z.number().optional()
  }).optional()
});

// Change detector JavaScript code with comprehensive logging
const changeDetectorJS = `
window.changeDetector = {
  baseline: null,
  thresholds: {
    major: { elementDelta: 100, dialogDelta: 1, overlayDelta: 1, formDelta: 1, zIndexDelta: 500, viewportDelta: 30 },
    minor: { elementDelta: 20, viewportDelta: 5 }
  },
  
  log: function(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMsg = \`[\${timestamp}] ChangeDetector [\${level.toUpperCase()}]: \${message}\`;
    console.log(logMsg, data ? JSON.stringify(data, null, 2) : '');
  },
  
  getMetrics: function() {
    this.log('debug', 'Collecting page metrics');
    const bodyRect = document.body.getBoundingClientRect();
    const metrics = {
      elements: document.querySelectorAll('*').length,
      url: location.href,
      dialogs: document.querySelectorAll('[role="dialog"],.modal,.popup,[class*="modal"]').length,
      overlays: document.querySelectorAll('.overlay,[class*="overlay"],.backdrop').length,
      forms: document.querySelectorAll('form').length,
      inputs: document.querySelectorAll('input,textarea,select').length,
      buttons: document.querySelectorAll('button,input[type="submit"]').length,
      links: document.querySelectorAll('a[href]').length,
      viewportHeight: bodyRect.height,
      visibleElements: Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      }).length,
      maxZIndex: Math.max(0, ...Array.from(document.querySelectorAll('*')).map(el => parseInt(getComputedStyle(el).zIndex) || 0)),
      fixedElements: document.querySelectorAll('[style*="position: fixed"],[style*="position:fixed"]').length,
      absoluteElements: document.querySelectorAll('[style*="position: absolute"],[style*="position:absolute"]').length
    };
    this.log('debug', 'Metrics collected', metrics);
    return metrics;
  },
  
  detectChanges: function() {
    this.log('info', 'Starting change detection');
    const current = this.getMetrics();
    
    if (!this.baseline) {
      this.baseline = current;
      this.log('info', 'Baseline set for first time');
      return { 
        changed: false, 
        level: 'none', 
        reason: 'Baseline initialized', 
        shouldTakeScreenshot: false, 
        shouldTakeSnapshot: false,
        suggestedFilename: 'baseline_set.png',
        reasons: [],
        majorReasons: [],
        minorReasons: [],
        metrics: { current, delta: {}, baseline: this.baseline }
      };
    }
    
    const delta = {
      elements: Math.abs(current.elements - this.baseline.elements),
      dialogs: current.dialogs - this.baseline.dialogs,
      overlays: current.overlays - this.baseline.overlays,
      forms: Math.abs(current.forms - this.baseline.forms),
      inputs: Math.abs(current.inputs - this.baseline.inputs),
      buttons: Math.abs(current.buttons - this.baseline.buttons),
      links: Math.abs(current.links - this.baseline.links),
      viewportHeight: Math.abs(current.viewportHeight - this.baseline.viewportHeight),
      visibleElements: Math.abs(current.visibleElements - this.baseline.visibleElements),
      zIndex: current.maxZIndex - this.baseline.maxZIndex,
      urlChanged: current.url !== this.baseline.url,
      fixedElements: Math.abs(current.fixedElements - this.baseline.fixedElements),
      absoluteElements: Math.abs(current.absoluteElements - this.baseline.absoluteElements)
    };
    
    this.log('debug', 'Change deltas calculated', delta);
    
    const majorReasons = [];
    const minorReasons = [];
    
    if (delta.urlChanged) majorReasons.push('URL changed');
    if (delta.dialogs > 0) majorReasons.push(\`\${delta.dialogs} dialog(s) appeared\`);
    if (delta.overlays > 0) majorReasons.push(\`\${delta.overlays} overlay(s) appeared\`);
    if (delta.forms >= this.thresholds.major.formDelta) majorReasons.push(\`Form count changed by \${delta.forms}\`);
    if (delta.elements >= this.thresholds.major.elementDelta) majorReasons.push(\`\${delta.elements} elements changed\`);
    if (delta.zIndex >= this.thresholds.major.zIndexDelta) majorReasons.push(\`Z-index increased by \${delta.zIndex}\`);
    if (delta.fixedElements > 0) majorReasons.push(\`\${delta.fixedElements} fixed elements changed\`);
    if (delta.absoluteElements > 0) majorReasons.push(\`\${delta.absoluteElements} absolute elements changed\`);
    
    const percentChange = {
      elements: (delta.elements / (this.baseline.elements || 1)) * 100,
      viewport: (delta.viewportHeight / (this.baseline.viewportHeight || 1)) * 100,
      visible: (delta.visibleElements / (this.baseline.visibleElements || 1)) * 100
    };
    
    if (percentChange.viewport >= this.thresholds.major.viewportDelta) {
      majorReasons.push(\`Viewport height changed \${percentChange.viewport.toFixed(1)}%\`);
    }
    
    if (majorReasons.length === 0) {
      if (delta.elements >= this.thresholds.minor.elementDelta) minorReasons.push(\`\${delta.elements} elements changed\`);
      if (percentChange.visible >= this.thresholds.minor.viewportDelta) minorReasons.push(\`\${percentChange.visible.toFixed(1)}% visibility changes\`);
      if (delta.buttons > 0) minorReasons.push(\`\${delta.buttons} button(s) changed\`);
      if (delta.inputs > 0) minorReasons.push(\`\${delta.inputs} input(s) changed\`);
    }
    
    const level = majorReasons.length > 0 ? 'major' : minorReasons.length > 0 ? 'minor' : 'none';
    const shouldTakeScreenshot = level !== 'none';
    const shouldTakeSnapshot = majorReasons.some(r => 
      r.includes('dialog') || 
      r.includes('overlay') || 
      r.includes('URL changed') ||
      r.includes('Form count changed')
    );
    
    let suggestedFilename = 'no_change.png';
    if (level === 'major') {
      const reason = majorReasons[0].toLowerCase().replace(/[^a-z0-9]/g, '_');
      suggestedFilename = \`major_change_\${reason}_\${Date.now()}.png\`;
    } else if (level === 'minor') {
      suggestedFilename = \`minor_change_\${Date.now()}.png\`;
    }
    
    const result = {
      changed: level !== 'none',
      level: level,
      reasons: [...majorReasons, ...minorReasons],
      majorReasons: majorReasons,
      minorReasons: minorReasons,
      shouldTakeScreenshot: shouldTakeScreenshot,
      shouldTakeSnapshot: shouldTakeSnapshot,
      suggestedFilename: suggestedFilename,
      metrics: { current, delta, baseline: this.baseline, percentChange }
    };
    
    this.log('info', \`Change detection complete: \${level} level\`, { 
      reasons: result.reasons, 
      shouldTakeScreenshot, 
      shouldTakeSnapshot,
      filename: suggestedFilename
    });
    
    this.baseline = current;
    return result;
  },
  
  updateThresholds: function(newThresholds) {
    this.log('info', 'Updating thresholds', newThresholds);
    if (newThresholds.major) {
      Object.assign(this.thresholds.major, newThresholds.major);
    }
    if (newThresholds.minor) {
      Object.assign(this.thresholds.minor, newThresholds.minor);
    }
    this.log('info', 'Thresholds updated', this.thresholds);
    return { success: true, thresholds: this.thresholds };
  },
  
  resetBaseline: function() {
    this.log('info', 'Resetting baseline');
    const oldBaseline = this.baseline;
    this.baseline = null;
    return { success: true, message: 'Baseline reset', previousBaseline: oldBaseline };
  }
};

window.changeDetector.log('info', 'Change detector initialized successfully');
`;

// Initialize change detector tool
export const initChangeDetector = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_init_change_detector',
    title: 'Initialize Change Detector',
    description: 'Initialize advanced change detection system for monitoring UI changes',
    inputSchema: z.object({
      thresholds: thresholdsSchema.optional().describe('Optional threshold configuration for major and minor changes')
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    try {
      // Inject change detector JavaScript
      await tab.page.evaluate(() => {
        // Check if already initialized
        if (typeof window.changeDetector !== 'undefined') {
          console.log('[ChangeDetector] Already initialized, reinitializing...');
        }
      });

      const result = await tab.page.evaluate(changeDetectorJS);
      
      // Apply custom thresholds if provided
      if (params.thresholds) {
        await tab.page.evaluate((thresholds) => {
          window.changeDetector.updateThresholds(thresholds);
        }, params.thresholds);
      }

      response.addResult('Change detector initialized successfully with logging enabled. Check browser console for detailed logs.');
      response.addCode(`// Change detector available at window.changeDetector\n// Logging enabled with levels: info, debug\n// Thresholds configured: ${JSON.stringify(params.thresholds || 'default')}`);
    } catch (error) {
      response.addResult(`Failed to initialize change detector: ${(error as Error).message}`);
      throw error;
    }
  }
});

// Detect changes tool
export const detectChanges = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_detect_changes',
    title: 'Detect Changes',
    description: 'Detect UI changes since last baseline and provide recommendations',
    inputSchema: z.object({}),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    try {
      // Check if change detector is initialized
      const isInitialized = await tab.page.evaluate(() => {
        return typeof window.changeDetector !== 'undefined';
      });

      if (!isInitialized) {
        response.addResult('Change detector not initialized. Please call browser_init_change_detector first.');
        return;
      }

      const result = await tab.page.evaluate(() => {
        return window.changeDetector.detectChanges();
      });

      response.addResult(`Change detection completed: ${result.level} level changes detected`);
      
      if (result.changed) {
        response.addResult(`Reasons: ${result.reasons.join(', ')}`);
        response.addResult(`Recommendations: ${result.shouldTakeScreenshot ? 'Take screenshot' : 'No screenshot needed'}, ${result.shouldTakeSnapshot ? 'Take DOM snapshot' : 'No DOM snapshot needed'}`);
        response.addResult(`Suggested filename: ${result.suggestedFilename}`);
      } else {
        response.addResult('No significant changes detected');
      }

      response.addCode(`// Change detection result:\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      response.addResult(`Failed to detect changes: ${(error as Error).message}`);
      throw error;
    }
  }
});

// Reset baseline tool
export const resetChangeBaseline = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_reset_change_baseline',
    title: 'Reset Change Baseline',
    description: 'Reset the change detection baseline for fresh detection',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    try {
      const isInitialized = await tab.page.evaluate(() => {
        return typeof window.changeDetector !== 'undefined';
      });

      if (!isInitialized) {
        response.addResult('Change detector not initialized. Please call browser_init_change_detector first.');
        return;
      }

      const result = await tab.page.evaluate(() => {
        return window.changeDetector.resetBaseline();
      });

      response.addResult('Change detection baseline reset successfully');
      response.addCode(`// Reset result:\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      response.addResult(`Failed to reset baseline: ${(error as Error).message}`);
      throw error;
    }
  }
});

// Update thresholds tool
export const updateChangeThresholds = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_update_change_thresholds',
    title: 'Update Change Thresholds',
    description: 'Update change detection thresholds dynamically',
    inputSchema: z.object({
      thresholds: thresholdsSchema.describe('New threshold values for major and minor changes')
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    try {
      const isInitialized = await tab.page.evaluate(() => {
        return typeof window.changeDetector !== 'undefined';
      });

      if (!isInitialized) {
        response.addResult('Change detector not initialized. Please call browser_init_change_detector first.');
        return;
      }

      const result = await tab.page.evaluate((thresholds) => {
        return window.changeDetector.updateThresholds(thresholds);
      }, params.thresholds);

      response.addResult('Change detection thresholds updated successfully');
      response.addCode(`// Updated thresholds:\n${JSON.stringify(result.thresholds, null, 2)}`);
    } catch (error) {
      response.addResult(`Failed to update thresholds: ${(error as Error).message}`);
      throw error;
    }
  }
});

export default [
  initChangeDetector,
  detectChanges,
  resetChangeBaseline,
  updateChangeThresholds,
];