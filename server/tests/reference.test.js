import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {referenceProvenance} from '../src/evaluation/reference.js';
import {calculateMetrics} from '../src/evaluation/metrics.js';
const id='8f625366-d1ce-4a0f-820f-f3f37bed0001';
const labels=[{id,role:'Operations',city:'Unknown'}];
const metadata={label_origin:'ai_assisted',annotator:'Codex',human_validated:false,label_file_sha256:createHash('sha256').update(JSON.stringify(labels)).digest('hex')};
it('preserves AI-assisted provenance and rejects relabeling it as human',()=>{
 expect(referenceProvenance(labels,metadata).label_origin).toBe('ai_assisted');
 expect(()=>referenceProvenance(labels,metadata,'human')).toThrow('LABEL_ORIGIN_CONFLICT');
});
it('rejects changed labels against a frozen annotation hash',()=>{
 expect(()=>referenceProvenance([{...labels[0],city:'Pune'}],metadata)).toThrow('LABEL_METADATA_HASH_MISMATCH');
});
it('does not claim human accuracy for AI-assisted reference agreement',()=>{
 const result=calculateMetrics([{job_id:id,predicted_role:'Operations',predicted_city:'Unknown'}],labels,[],{labelOrigin:'ai_assisted'});
 expect(result.role_agreement).toBe(1);expect(result.role_accuracy).toBeNull();expect(result.human_validated).toBe(false);
});
it('reports partial coverage explicitly instead of silently dropping missing predictions',()=>{
 const id2='8f625366-d1ce-4a0f-820f-f3f37bed0002',rows=[{job_id:id,predicted_role:'Operations',predicted_city:'Unknown'},{job_id:id2,predicted_role:null,predicted_city:null}];
 const fullLabels=[...labels,{...labels[0],id:id2}];
 expect(()=>calculateMetrics(rows,fullLabels,[])).toThrow('EVALUATION_PREDICTIONS_MISSING');
 const result=calculateMetrics(rows,fullLabels,[],{allowPartial:true,labelOrigin:'ai_assisted'});
 expect(result.sample_size).toBe(2);expect(result.evaluated_posts).toBe(1);expect(result.prediction_coverage).toBe(.5);expect(result.complete_predictions).toBe(false);
});

it('discloses Unknown-city dominance rather than suggesting broad city accuracy',()=>{
 const result=calculateMetrics([{job_id:id,predicted_role:'Operations',predicted_city:'Unknown'}],labels,[],{labelOrigin:'ai_assisted'});
 expect(result.city_label_distribution.evaluated_unknown).toBe(1);expect(result.city_label_distribution.known_city_agreement).toBeNull();
});
