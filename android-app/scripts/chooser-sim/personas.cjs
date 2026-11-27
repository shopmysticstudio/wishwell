// Fake people with a hidden taste. They never see the engine's tags; they judge each idea
// by its title, words and "why" line, plus a few personal quirks (random likes per person).
const P=[
 {name:"Cozy homebody",cats:["Room","Books"],
  like:"cozy blanket candle sleep tea slipper pajama bath plush throw pillow lamp light lights decor mug reading book cocoa fuzzy warm soft weighted diffuser puzzle robe sock socks journal plant",
  hate:"drone sport fitness gym tool tools solder electronic robot racing hiking camping workout",
  quiz:{treat:1,mind:1,move:1},ints:["Room setup","Books"],style:"Cozy"},
 {name:"Outdoorsy",cats:["Outdoors","Sports"],
  like:"hiking hike camping camp outdoor outdoors trail tent hammock lantern headlamp bike fishing kayak climbing water bottle beach backpack compass binocular survival fire",
  hate:"makeup decor gaming console candle skincare jewelry",
  quiz:{sat:1,move:0,treat:0},ints:["Outdoors","Sports"],style:"Practical"},
 {name:"Artsy",cats:["Art"],
  like:"art drawing draw painting paint sketch sketchbook marker markers watercolor craft crafts sewing knit crochet journal photography camera pottery clay calligraphy embroidery canvas pen pencil ink sticker",
  hate:"sport fitness gaming controller tool solder drone",
  quiz:{desk:1,mind:1},ints:["Art"],style:"Surprise me"},
 {name:"Gamer",cats:["Gaming"],
  like:"gaming game games controller console pc keyboard headset streaming stream anime manga lego retro arcade nintendo mouse monitor dice tabletop",
  hate:"beauty jewelry cooking skincare makeup knit yoga",
  quiz:{ears:1,desk:0,treat:0},ints:["Gaming"],style:"Wow factor"},
 {name:"Practical",cats:["Food","Tech"],
  like:"charger power bank bottle backpack wallet organizer repair kitchen knife pan coffee tool tools multitool flashlight cable everyday travel umbrella lunch thermos storage cast iron",
  hate:"decor quirky novelty plush sticker figure poster",
  quiz:{sat:0,move:1,treat:0},ints:["Cooking","Tech"],style:"Practical"},
];
const words=s=>new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
P.forEach(p=>{p.L=words(p.like);p.H=words(p.hate)});
function judge(p,b,rnd){ // b = bank entry; returns "kept" | "cut" | "have" | "new"
  const w=words(b[0]+" "+b[4]+" "+b[5]);let s=0,h=0;
  w.forEach(x=>{if(p.L.has(x))s++;if(p.H.has(x))h++});
  if(p.cats.includes(b[1]))s+=1.5;
  const quirk=rnd()<0.07;           // personal likes nobody could predict
  let love=(s>=2&&h===0)||quirk;
  if(love&&rnd()<0.08)return "have"; // already owns it
  if(love)return "kept";
  if(h>0&&rnd()<0.6)return "cut";
  return "new";
}
const score=(p,b)=>{const w=words(b[0]+" "+b[4]+" "+b[5]);let s=0;w.forEach(x=>{if(p.L.has(x))s++});return s+(p.cats.includes(b[1])?1.5:0)};
module.exports={P,judge,score};
