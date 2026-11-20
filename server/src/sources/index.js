import {remotive} from './remotive.js';
import {jobicy} from './jobicy.js';
import {remoteok} from './remoteok.js';
import {himalayas} from './himalayas.js';
const registry={remotive,jobicy,remoteok,himalayas};
export const defaultSources='remotive,jobicy,remoteok,himalayas';
export function enabledSources(value){
 const ids=[...new Set(value.split(',').map(value=>value.trim()).filter(Boolean))];
 if(!ids.length)throw new Error('At least one reviewed source must be enabled');
 return ids.map(id=>{if(!registry[id])throw new Error('Unknown or unreviewed source');return registry[id];});
}
