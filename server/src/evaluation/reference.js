import {createHash} from 'node:crypto';
const origins=['human','ai_assisted','unverified'];
export function referenceProvenance(labels,metadata,requestedOrigin,setId){
 const origin=requestedOrigin||metadata?.label_origin||'unverified';
 if(!origins.includes(origin))throw new Error('INVALID_LABEL_ORIGIN');
 if(metadata?.label_origin&&metadata.label_origin!=='unverified'&&metadata.label_origin!==origin)throw new Error('LABEL_ORIGIN_CONFLICT');
 if(metadata?.evaluation_set&&metadata.evaluation_set!==setId)throw new Error('LABEL_METADATA_SET_MISMATCH');
 const digest=createHash('sha256').update(JSON.stringify(labels)).digest('hex');
 if(metadata?.label_file_sha256&&metadata.label_file_sha256!==digest)throw new Error('LABEL_METADATA_HASH_MISMATCH');
 if(origin==='human'&&metadata?.human_validated===false)throw new Error('HUMAN_VALIDATION_NOT_ATTESTED');
 return {label_origin:origin,human_validated:origin==='human',annotator:metadata?.annotator||'operator supplied',label_file_sha256:digest,created_at:metadata?.created_at||new Date().toISOString()};
}
