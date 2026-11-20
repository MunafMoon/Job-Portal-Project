import sanitizeHtml from 'sanitize-html';
import { createHash } from 'node:crypto';
export function plain(value) {
    return sanitizeHtml(value.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?\s*>/gi, ' '), { allowedTags: [], allowedAttributes: {} })
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
export function canonicalUrl(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Unsafe job URL');
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
        if (/^(utm_|fbclid$|gclid$)/i.test(key))
            url.searchParams.delete(key);
    url.searchParams.sort();
    // Preserve path case, slash and non-tracking query parameters: they can identify different jobs.
    return url.toString();
}
const hash = (s) => createHash('sha256').update(s).digest('hex');
const norm = (s) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function fingerprint(job) {
    return hash([job.company, job.title, job.location_evidence, job.location_type, job.job_type].map(norm).join('\u001f'));
}
export function descriptionHash(job) { return hash(norm(job.description)); }
export function eligibility(job, now, maxAgeDays) {
    const reasons = [];
    const text = job.title + ' ' + job.description;
    const location = job.location_evidence;
    if(/\b(?:couldn.t find|submit your profile|talent community|talent pool|expression of interest|future opportunities)\b/i.test(job.title))return {status:'rejected',reasons:['not_a_specific_opening']};
    if(/\((?:LATAM|US|USA|UK|Europe|Canada|Brazil|Australia|Singapore)\)|\b(?:remote in|based in)\s+(?:US|USA|UK|Europe|Canada|Brazil|Australia|Singapore)\b/i.test(job.title)&&!/\bIndia\b/i.test(job.title))reasons.push('title_location_conflict');
    if(/\b(?:at least|minimum(?: of)?|requires?|must have)\s+(?:one|1)\+?\s+years?\b/i.test(job.description))reasons.push('mandatory_experience_uncertain');
    if(/\b(?:seeking|looking for|are you)\s+(?:an?\s+)?experienced\b/i.test(job.description))reasons.push('professional_experience_uncertain');
    if(/\bvideo data entry\b/i.test(job.title)&&/head strap|record both hands/i.test(job.description))return {status:'rejected',reasons:['irrelevant_microtask']};

    if(job.expires_at && Date.parse(job.expires_at)<=now.getTime())return {status:'rejected',reasons:['expired']};
    if(/(?:excluding|except|not (?:available|open) (?:in|to))\s+India/i.test(location+' '+job.description))return {status:'rejected',reasons:['india_excluded']};
    if(location.startsWith('India timezone eligibility unconfirmed')) reasons.push('timezone_eligibility_uncertain');
    if(/senior|lead|principal|executive|director/i.test(job.experience_evidence||''))return {status:'rejected',reasons:['source_seniority']};
    if(/\b(?:record videos at home|paid surveys?|microtasks?|product testing for cash)\b/i.test(job.title))return {status:'rejected',reasons:['irrelevant_gig']};
    if (/\b(senior|sr\.?|lead|principal|staff|director|head of|manager)\b/i.test(job.title))
        return { status: 'rejected', reasons: ['senior_title'] };
    // A mandatory minimum of 2+ years is outside the fresher scope. Ignore preferred experience.
    if (/\b(?:minimum|at least|requires?|must have)\s+(?:of\s+)?(?:[2-9]|[1-9]\d)\+?\s+years?\b/i.test(text)
        || /\b(?:[2-9]|[1-9]\d)\+?\s+years?\s+(?:of\s+)?(?:professional\s+)?experience\s+(?:is\s+)?required\b/i.test(text))
        return { status: 'rejected', reasons: ['mandatory_experience'] };
    if (job.posted_at) {
        const age = now.getTime() - Date.parse(job.posted_at);
        if (age > maxAgeDays * 86400000)
            return { status: 'rejected', reasons: ['stale'] };
        if (age < -86400000)
            reasons.push('future_posted_at');
    }
    else
        reasons.push('missing_posted_at');
    if (/\b(unpaid survey|pay to apply|registration fee|commission only)\b/i.test(text))
        return { status: 'rejected', reasons: ['irrelevant_or_fee'] };
    const explicitlyIndia = /\bIndia\b/i.test(location);
    const worldwide = /^(worldwide|anywhere|global)$/i.test(location.trim());
    if (!explicitlyIndia && !worldwide) {
        if (/^(USA?|United States|Canada|UK|United Kingdom|Europe|European Union|Australia)(\s+only)?$/i.test(location.trim()))
            return { status: 'rejected', reasons: ['outside_india'] };
        reasons.push('india_eligibility_uncertain');
    }
    // Restrictions in the description override broad location metadata and need human review.
    if (/\b(?:only (?:candidates|applicants|residents)|must (?:be located|be based|reside|live)|residents? of|authorized to work|work authori[sz]ation|citizens? of|(?:US|USA|UK|Europe)[ -]only)\b/i.test(job.description))
        reasons.push('check_description_restrictions');
    if (!/^(Entry-level|Junior|Internship|Intern)$/i.test(job.experience_evidence||'') && !/\b(fresher|freshers|entry[ -]level|graduate|junior|intern|internship|no experience|0[–-]1 years?)\b/i.test(text))
        reasons.push('experience_uncertain');
    if (/\b(?:[2-9]|[1-9]\d)\+?\s*(?:-|to|–)?\s*\d*\s+years?\b/i.test(text))
        reasons.push('experience_requires_review');
    return { status: reasons.length ? 'review' : 'eligible', reasons };
}
