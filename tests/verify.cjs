// Desktop adapter: executes the delivered Scriptable script, including main().
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Calendar Wallpaper.js'), 'utf8');
let now = new Date(2026, 9, 12, 9, 41);
const calendars = [
  {identifier: 'work', title: 'Work'},
  {identifier: 'personal', title: 'Personal'},
  {identifier: 'health', title: 'Wellbeing'},
];
function event(title, start, end, calendar = calendars[0], extra = {}) {
  return {title, startDate: new Date(2026, 9, 12, ...start), endDate: new Date(2026, 9, 12, ...end), calendar, attendees: [], ...extra};
}
const sample = [
  event('Morning focus', [9, 0], [10, 30]),
  event('Coffee with Sarah', [11, 0], [11, 45], calendars[1], {location: 'The corner café'}),
  event('Project catch-up', [14, 0], [14, 45]),
  event('An evening walk', [18, 0], [18, 30], calendars[2], {location: 'A little time outside'}),
];

function adapter({events = sample, stored = JSON.stringify(['work','personal','health']), inApp = false, available = calendars, picked = calendars, failRead = false, parameter = null, dark = false, savedMode = null, position = {latitude:48.8566,longitude:2.3522}, failWrite = false, denyLocation = false} = {}) {
  let output, image, complete = false, reads=0, locationCalls=0; const files=new Map();
  const texts = [];
  class Rect { constructor(x,y,width,height) {Object.assign(this,{x,y,width,height});} }
  class Size { constructor(width,height) {Object.assign(this,{width,height});} }
  class Color { constructor(hex,alpha=1) {this.hex = hex;this.alpha=alpha;} }
  class Path {addRoundedRect(rect,rx,ry) {Object.assign(this,{rect,rx,ry});} }
  class DrawContext {
    set size(s) {this.canvas=createCanvas(s.width,s.height);this.ctx=this.canvas.getContext('2d');}
    setFillColor(c) {this.ctx.fillStyle='#'+c.hex+Math.round(c.alpha*255).toString(16).padStart(2,'0');}
    fillRect(r) {this.ctx.fillRect(r.x,r.y,r.width,r.height);}
    fillEllipse(r) {this.ctx.beginPath();this.ctx.ellipse(r.x+r.width/2,r.y+r.height/2,r.width/2,r.height/2,0,0,Math.PI*2);this.ctx.fill();}
    setStrokeColor(c) {this.ctx.strokeStyle='#'+c.hex+Math.round(c.alpha*255).toString(16).padStart(2,'0');}
    setLineWidth(w) {this.ctx.lineWidth=w;}
    strokeEllipse(r) {this.ctx.beginPath();this.ctx.ellipse(r.x+r.width/2,r.y+r.height/2,r.width/2,r.height/2,0,0,Math.PI*2);this.ctx.stroke();}
    addPath(p) {this.path=p;}
    fillPath() {const p=this.path;this.ctx.beginPath();this.ctx.roundRect(p.rect.x,p.rect.y,p.rect.width,p.rect.height,p.rx);this.ctx.fill();}
    setFont(f) {this.font=f;this.ctx.font=`${f.weight} ${f.size}px "${f.family}"`;}
    setTextColor(c) {this.ctx.fillStyle='#'+c.hex;}
    setTextAlignedLeft() {}
    drawTextInRect(t,r) {
      texts.push({text:t,rect:r,size:this.font.size});
      this.ctx.save();this.ctx.beginPath();this.ctx.rect(r.x,r.y,r.width,r.height);this.ctx.clip();
      this.ctx.textBaseline='top';this.ctx.fillText(t,r.x,r.y);this.ctx.restore();
    }
    getImage() {image=this.canvas;return image;}
  }
  class FixedDate extends Date {constructor(...args) {super(...(args.length?args:[now.getTime()]));} }
  const context = vm.createContext({
    Date: FixedDate, DrawContext, Size, Rect, Color, Path,
    Font: class {
      constructor(family,size) {Object.assign(this,{family,size,weight:400});}
      static mediumSystemFont(size) {return {size,weight:500,family:'Helvetica Neue'};}
      static regularSystemFont(size) {return {size,weight:400,family:'Helvetica Neue'};}
    },
    DateFormatter: class {string(d) {return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}).replace(/,/g,'');}},
    Calendar: {forEvents:async()=>available,presentPicker:async()=>picked},
    CalendarEvent: {between:async()=>{reads++;if(failRead)throw new Error('Permission denied');return events.map(e=>({...e,startDate:e.startDate instanceof Date?new FixedDate(e.startDate):e.startDate,endDate:e.endDate instanceof Date?new FixedDate(e.endDate):e.endDate}));}},
    FileManager: {
 local:()=>({documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>p.includes('location')?position!==null:stored!==null,readString:p=>p.includes('location')?JSON.stringify(position):stored,writeString:(p,v)=>{if(p.includes('location'))position=JSON.parse(v);else stored=v;}}),
 iCloud:()=>({documentsDirectory:()=>'/cloud',joinPath:(a,b)=>a+'/'+b,writeImage:(p,i)=>{if(failWrite)throw new Error('Write failed');files.set(p,i.toBuffer('image/png'));}})},
 Location:{setAccuracyToThreeKilometers:()=>{},current:async()=>{locationCalls++;if(denyLocation)throw new Error('Location denied');return {latitude:48.8566,longitude:2.3522};}},
    Device: {isUsingDarkAppearance:()=>dark},
    args: {shortcutParameter:parameter},config: {runsInApp:inApp},QuickLook: {present:async()=>{}},
    Script: {setShortcutOutput:v=>{output=v;},complete:()=>{throw new Error('Do not terminate the script before returning its output.');}},
    Data: {fromPNG:i=>({toBase64String:()=>i.toBuffer('image/png').toString('base64')})},
  });
  const run = async () => {
    const result = await vm.runInContext(`(async()=>{${source.replace('return await main();', 'globalThis.appearanceChoice=appearanceChoice;globalThis.Solar=Solar;return await main();')}\n})()`,context);
    assert.notEqual(result,undefined,'The script must return its output from the top-level async wrapper.');
    output=result;
    complete=true;
    return result;
  };
  return {run,context,files,get reads(){return reads;},get locationCalls(){return locationCalls;},get output(){return output;},get image(){return image;},get complete(){return complete;},get savedMode(){return savedMode;},texts};
}


(async()=>{
 let count=0;
 const a=adapter({parameter:'auto',dark:true});await a.run();
 assert.equal(a.output,'/cloud/calendar-wallpaper.png');
 assert(a.files.get(a.output).subarray(1,4).equals(Buffer.from('PNG')));
 assert(a.image.getContext('2d').getImageData(5,5,1,1).data[0]>200,'daylight overrides permanent system dark mode');
 assert.equal(a.locationCalls,0,'background needs no GPS permission request');count++;
 function mode(iso,lat=48.8566,lon=2.3522){return vm.runInContext('appearanceChoice("auto",new Date('+JSON.stringify(iso)+'),{latitude:'+lat+',longitude:'+lon+'})',a.context);}
 for(const [iso,expected] of [['2026-10-11T01:00:00Z','dark'],['2026-10-11T10:00:00Z','light'],['2026-10-11T22:00:00Z','dark'],['2026-01-11T06:00:00Z','dark'],['2026-07-11T06:00:00Z','light']]){assert.equal(mode(iso),expected,iso);count++;}
 assert.equal(mode('2026-06-21T22:00:00Z',78.22,15.65),'light');
 assert.equal(mode('2026-12-21T10:00:00Z',78.22,15.65),'dark');count+=2;
 // Around real seasonal boundaries, with a tolerance for the approximation of rise/set times.
 for(const date of ['2026-01-11T12:00:00Z','2026-07-11T12:00:00Z','2026-10-25T12:00:00Z']){
  const times=vm.runInContext('Solar.getTimes(new Date('+JSON.stringify(date)+'),48.8566,2.3522)',a.context);
  for(const [key,offset,expected] of [['sunrise',-20,'dark'],['sunrise',20,'light'],['sunset',-20,'light'],['sunset',20,'dark']]){
   assert.equal(mode(new Date(+times[key]+offset*60000).toISOString()),expected);count++;
  }
 }
 const changing=[sample[0]];const b=adapter({events:changing});await b.run();changing.push(sample[1]);await b.run();
 assert.equal(b.reads,2);assert(b.texts.some(t=>t.text==='2 still ahead'));count++;
 for(const opts of [{position:null},{position:{latitude:NaN,longitude:2}},{failRead:true},{failWrite:true}]){
  const failed=adapter(opts);await assert.rejects(failed.run());assert.equal(failed.output,undefined);assert.equal(failed.files.size,0);count++;
 }
 const setup=adapter({inApp:true,position:null});await setup.run();assert.equal(setup.locationCalls,1);count++;
 for(const parameter of ['day','night']){const override=adapter({parameter});await override.run();assert.equal(override.output,'/cloud/calendar-wallpaper.png');count++;}
 const night=adapter({parameter:'night'});await night.run();
 if(process.argv.includes('--previews')) fs.writeFileSync(path.join(root,'assets/night.png'),night.files.get(night.output));
 if(process.argv.includes('--previews')) fs.writeFileSync(path.join(root,'assets/day.png'),a.files.get(a.output));
 console.log(count+' checks passed: seasonal daylight, polar cases, cached location, fresh event reads, PNG output, fail-closed errors. Phone automation remains unverified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
