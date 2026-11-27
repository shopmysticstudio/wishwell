// node run.cjs path/to/index.html [seeds] [mode]   mode: quiz | blank
const {JSDOM}=require("jsdom");const fs=require("fs");const {P,judge,score}=require("./personas.cjs");
let html=fs.readFileSync(process.argv[2],"utf8");const k=html.lastIndexOf("}\n</script>");html=html.slice(0,k)+"window.__t=c=>eval(c);\n"+html.slice(k);
const SEEDS=+(process.argv[3]||20),MODE=process.argv[4]||"quiz",ROUNDS=6;
const mul=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
(async()=>{
 const out={};
 for(const p of P){const per=[...Array(ROUNDS)].map(()=>({c:0,n:0,cats:0}));
  for(let seed=1;seed<=SEEDS;seed++){
   const eng=mul(seed*7919),me=mul(seed*104729+p.name.length);
   const dom=new JSDOM(html,{runScripts:"dangerously",url:"https://x.example/app/",pretendToBeVisual:true,beforeParse(w){w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){}});w.Math.random=eng;w.localStorage.clear()}});
   const w=dom.window,T=c=>w.__t(c);await new Promise(r=>setTimeout(r,0));
   const BANK=T("BANK"),byT=new Map(BANK.map(b=>[b[0].toLowerCase(),b]));
   if(MODE==="quiz")T(`S.ageOk=true;S.quiz=${JSON.stringify(p.quiz)};S.ints=${JSON.stringify(p.ints)};S.style=${JSON.stringify(p.style)};S.budget="any";S.notes=""`);
   else T(`S.ageOk=true;S.quiz={};S.ints=[];S.style="";S.budget="any";S.notes=""`);
   for(let r=0;r<ROUNDS;r++){
    const before=T("S.items.length");T("S.round=(S.round||0)+1;bankIdeas(8)");
    const items=T(`S.items.slice(${before}).map(i=>({id:i.id,t:i.title}))`);
    const cats=new Set();let c=0;
    items.forEach(it=>{const b=byT.get(it.t.toLowerCase());cats.add(b[1]);const v=judge(p,b,me);
      if(v==="kept"||v==="have")c++;
      if(v!=="new")T(`{const i=byId(${JSON.stringify(it.id)});i.status=${JSON.stringify(v)};if(i.status==="have")S.have.push(i.title.toLowerCase())}`)});
    T("syncKept()");
    // after round 2 they rank: favorites to the top
    if(r===1){const order=T("S.kept.map(id=>[id,byId(id).title])").sort((a,b)=>score(p,byT.get(b[1].toLowerCase()))-score(p,byT.get(a[1].toLowerCase()))).map(x=>x[0]);T(`S.kept=${JSON.stringify(order)}`)}
    per[r].c+=c;{const cc={};items.forEach(it=>{const b=byT.get(it.t.toLowerCase());cc[b[1]]=(cc[b[1]]||0)+1});const mx=Math.max(...Object.values(cc));per[r].mx=Math.max(per[r].mx||0,mx);per[r].min=Math.min(per[r].min??9,cats.size)}per[r].n+=items.length;per[r].cats+=cats.size;
   }
   w.close();
  }
  out[p.name]=per.map(x=>({mx:x.mx,min:x.min,hit:+(x.c/SEEDS).toFixed(2),cats:+(x.cats/SEEDS).toFixed(1)}));
 }
 for(const [n,per] of Object.entries(out))console.log(n.padEnd(15),per.map(x=>`${x.hit.toFixed(1)}/8 (${x.cats}c)`).join("  "));
 const avg=r=>(Object.values(out).reduce((s,per)=>s+per[r].hit,0)/P.length).toFixed(2);
 console.log("Average".padEnd(15),[...Array(ROUNDS)].map((_,r)=>avg(r)+"/8").join("      "));
 console.log("JSON",JSON.stringify(out));
})();
