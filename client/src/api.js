export async function getJson(path, signal) {
  const response = await fetch(path,{signal,headers:{Accept:'application/json'}});
  let data;
  try { data = await response.json(); } catch { throw new Error('The jobs API is not responding. Make sure the backend is running.'); }
  if (!response.ok) throw new Error(data.error || 'Job data is unavailable. Please try again.');
  return data;
}
export function safeLink(value) {
  try { const url=new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export const typeLabel = value => ({
  full_time:'Full time',part_time:'Part time',contract:'Contract',freelance:'Freelance',internship:'Internship',Unknown:'Not specified',
}[value] || value);
export const cityLabel = value => value === 'Unknown' ? 'City not specified' : value;
export function displayDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not available yet';
  return new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
}
