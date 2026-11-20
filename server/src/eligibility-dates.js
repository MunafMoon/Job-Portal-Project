const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function pastApplicationWindow(description,now){
 const match=description.match(/\bcan start\b[\s\S]{0,160}?\bbetween\b[\s\S]{0,100}?\band\s+(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*['\u2019]?\s*(\d{4}|\d{2})\b/i);
 if(!match)return false;
 const day=Number(match[1]),month=months.indexOf(match[2].toLowerCase()),rawYear=Number(match[3]),year=rawYear<100?2000+rawYear:rawYear;
 const end=new Date(Date.UTC(year,month,day));
 if(end.getUTCFullYear()!==year||end.getUTCMonth()!==month||end.getUTCDate()!==day)return false;
 return end.getTime()+86400000<=now.getTime();
}
