import {it,expect} from 'vitest';
import {pastApplicationWindow} from '../src/eligibility-dates.js';
import {eligibility} from '../src/normalize.js';
const now=new Date('2026-11-20T00:00:00Z');
const job={title:'Junior Intern',description:'Learn with mentors.',posted_at:'2026-11-19T00:00:00Z',location_evidence:'India',experience_evidence:'Entry-level'};
it('rejects an explicit past internship application window despite a freshly updated feed date',()=>{
 const description="can start the work from home job/internship between 24th May'26 and 10th Jun'26";
 expect(pastApplicationWindow(description,now)).toBe(true);
 expect(eligibility({...job,description},now,30).reasons).toContain('past_application_window');
});
it('does not guess dates with missing years or reject future windows',()=>{
 expect(pastApplicationWindow('can start between 1st May and 10th June',now)).toBe(false);
 expect(pastApplicationWindow("can start between 1st Dec'26 and 10th Dec'26",now)).toBe(false);
});
it('rejects inactive networks and historical intake titles',()=>{
 expect(eligibility({...job,description:'Note: This is not an active job opening.'},now,30).reasons).toContain('not_an_active_job_opening');
 expect(eligibility({...job,title:'Free Internship 2021'},now,30).reasons).toContain('historical_intake');
});
it('distinguishes non-internship volunteer roles from unpaid internships',()=>{
 expect(eligibility({...job,title:'Volunteer sourcing support',description:'This is a volunteer position without any pay.'},now,30).reasons).toContain('volunteer_not_job_or_internship');
 expect(eligibility({...job,title:'Unpaid software internship'},now,30).status).toBe('eligible');
});
it('holds mandatory nonzero experience ranges for review',()=>{
 expect(eligibility({...job,description:'Experience: 1 to 8 yrs'},now,30).status).toBe('review');
 expect(eligibility({...job,description:'Requirements 1+ years experience in a relevant field'},now,30).status).toBe('review');
});
