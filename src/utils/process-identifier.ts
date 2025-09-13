/**
 * @deprecated This file is maintained for backward compatibility.
 * Please use the modular imports from './process/' directory instead.
 *
 * Migration guide:
 * - ProcessIdentifier -> import from './process/identifier.js'
 * - ProcessInfo, IdentifiedProcess -> import from './process/types.js'
 * - LRUCache -> import from './process/cache.js'
 * - ProcessTree -> import from './process/tree.js'
 * - ProcessRelationship -> import from './process/relationship.js'
 */

// Re-export everything from the new modular structure
export type { ProcessInfo, IdentifiedProcess } from './process/types.js';
export { ProcessIdentifier, identifyProcess, identifyProcessBatch, formatProcessDisplay } from './process/identifier.js';

// For direct imports of the old class names
export { ProcessTree } from './process/tree.js';
export { ProcessRelationship } from './process/relationship.js';
export { LRUCache } from './process/cache.js';