import {writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
if(!process.env.DATABASE_CA_PEM||!process.env.GITHUB_ENV)throw new Error('Database CA secret and GitHub environment are required');
const path=join(tmpdir(),'fresherjobs-database-ca.pem');
await writeFile(path,process.env.DATABASE_CA_PEM,{mode:0o600});
await appendFile(process.env.GITHUB_ENV,'DATABASE_CA_FILE='+path.replaceAll('\\','/')+'\n');
