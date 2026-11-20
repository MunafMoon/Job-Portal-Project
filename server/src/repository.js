// Fingerprints are non-unique by design: similar titles can be separate requisitions.
export function safeFingerprintMatch(a, b) {
    return a.source !== b.source && a.fingerprint === b.fingerprint
        && a.description_hash === b.description_hash && a.description.length >= 200
        && a.posted_at !== null && b.posted_at !== null
        && Math.abs(Date.parse(a.posted_at) - Date.parse(b.posted_at)) <= 7 * 86400000;
}
export async function saveCandidate(db, job) {
    const identity = await db.query('select job_id from job_sources where source=$1 and source_job_id=$2', [job.source, job.source_job_id]);
    const canonical = await db.query('select id from jobs where canonical_url=$1 union select job_id as id from job_sources where canonical_url=$1', [job.canonical_url]);
    let id = identity.rows[0]?.job_id ?? canonical.rows[0]?.id;
    let duplicate = !identity.rowCount && Boolean(id);
    if (!id) {
        const matches = await db.query('select * from jobs where fingerprint=$1 and description_hash=$2', [job.fingerprint, job.description_hash]);
        const match = matches.rows.find(row => safeFingerprintMatch(job, { ...row, posted_at: row.posted_at?.toISOString() ?? null }));
        if (match) {
            id = match.id;
            duplicate = true;
        }
    }
    const values = [job.title, job.company, job.description, job.original_url, job.canonical_url, job.source, job.source_job_id, job.city, job.role, job.location_type, job.job_type, job.posted_at, job.fetched_at, job.location_evidence, job.fingerprint, job.description_hash, job.decision.status, JSON.stringify(job.decision.reasons), job.expires_at ?? null, job.experience_evidence ?? ''];
    if (!id) {
        const result = await db.query(`insert into jobs(title,company,description,original_url,canonical_url,source,source_job_id,city,role,location_type,job_type,posted_at,fetched_at,location_evidence,fingerprint,description_hash,eligibility,review_reasons,last_seen_at,expires_at,experience_evidence)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$13,$19,$20) returning id`, values);
        id = result.rows[0].id;
    }
    else if (identity.rowCount) {
        // Update primary content only from its owning source; preserve independent provenance.
        await db.query(`update jobs set title=$1,company=$2,description=$3,original_url=$4,canonical_url=$5,
      city=case when description_hash=$16 and title=$1 and location_evidence=$14 and company=$2 and original_url=$4 and location_type=$10 then city else $8 end,
      role=case when description_hash=$16 and title=$1 and location_evidence=$14 and company=$2 and original_url=$4 and location_type=$10 then role else $9 end,
      tagging_content_hash=case when description_hash=$16 and title=$1 and location_evidence=$14 and company=$2 and original_url=$4 and location_type=$10 then tagging_content_hash else null end,location_type=$10,job_type=$11,posted_at=$12,fetched_at=$13,
      location_evidence=$14,fingerprint=$15,description_hash=$16,eligibility=$17,review_reasons=$18,
      last_seen_at=$13,expires_at=$19,experience_evidence=$20,active=true where id=$21 and source=$6 and source_job_id=$7`, [...values, id]);
    }
    await db.query(`insert into job_sources(source,source_job_id,job_id,original_url,canonical_url,last_seen_at)
    values($1,$2,$3,$4,$5,$6) on conflict(source,source_job_id) do update set
    original_url=excluded.original_url, canonical_url=excluded.canonical_url,last_seen_at=excluded.last_seen_at`, [job.source, job.source_job_id, id, job.original_url, job.canonical_url, job.fetched_at]);
    return duplicate ? 'duplicate' : identity.rowCount ? 'updated' : 'inserted';
}
