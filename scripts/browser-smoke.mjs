import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Uses an already installed Chrome. Start npm run dev in another terminal first.
const base = process.env.BROWSER_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  headless:true,
  ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'}),
});
await mkdir('artifacts',{recursive:true});
try {
  for (const [name,width] of [['desktop',1440],['mobile',390],['small-mobile',320]]) {
    const page = await browser.newPage({viewport:{width,height:1200}});
    const pageErrors = [];
    page.on('pageerror',error=>pageErrors.push(error.message));
    try {
      await page.goto(base,{waitUntil:'networkidle'});
      const response=await page.request.get(base+'/api/jobs');
      assert.equal(response.status(),200,'Jobs API must be available for live browser checks');
      const data=await response.json();
      await page.getByRole('heading',{name:'Find your kind of opportunity.',exact:true}).waitFor();
      if (data.jobs.length) await page.getByRole('heading',{name:data.jobs[0].title,exact:true}).first().waitFor();
      else await page.getByText('Good beginnings take a little care.',{exact:true}).waitFor();
      const size=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
      assert.ok(size.width<=size.viewport,'Horizontal overflow at '+width+'px');
      if (width===1440) {
        await page.getByRole('button',{name:'How it works',exact:true}).click();
        assert.ok(await page.locator('dialog').isVisible());
        await page.keyboard.press('Escape');
        if(data.jobs.length) {
          const card=page.getByRole('article').first();
          await card.getByRole('button',{name:'Job details',exact:true}).click();
          assert.ok(await card.locator('.job-full-details').isVisible());
          await card.getByRole('button',{name:'Less detail',exact:true}).click();
        }
      } else if (width===390) {
        await page.getByRole('button',{name:'Filters',exact:true}).click();
        assert.ok(await page.getByLabel('Opportunity type').isVisible());
        await page.getByLabel('Opportunity type').selectOption('internship');
        await page.waitForFunction(()=>location.search.includes('type=internship'));
        await page.getByRole('button',{name:'Reset',exact:true}).click();
        await page.waitForFunction(()=>!location.search.includes('type='));
      }
      await page.screenshot({path:'artifacts/frontend-'+name+'.png',fullPage:true});
      assert.equal(pageErrors.length,0,'Browser runtime errors found');
      console.log(JSON.stringify({screen:name,width,overflow:false,runtime_errors:0,jobs:data.pagination.total}));
    } finally {await page.close();}
  }
} finally {await browser.close();}
