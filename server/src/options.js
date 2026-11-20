export function parseOptions(argv, {flags=[],values=[]}={}){
 const result={};
 for(let index=0;index<argv.length;index++){
  const name=argv[index];if(flags.includes(name)){result[name]=true;continue;}
  if(values.includes(name)&&argv[index+1]&&!argv[index+1].startsWith('--')){result[name]=argv[++index];continue;}
  throw new Error('INVALID_COMMAND_OPTION');
 }
 return result;
}
export function positiveInteger(value,fallback,max=10000){
 const number=Number(value??fallback);if(!Number.isSafeInteger(number)||number<1||number>max)throw new Error('INVALID_INTEGER_SETTING');return number;
}
