/* Source: AS100 site registration (scaled), AS102/103 canopy, AS104/105 Rev5.
 * CAD cross-check: review-assets/cad/extracted/x_site.json + "x_outdoor pool.json"
 * (tools/extract-dwg.mjs, LibreDWG). The site DWG's pool rectangle (27'x15'
 * inner) and A_050 footprint (~233') disagree with the printed AS104 Rev 5
 * water dims (40'-0" x 15'-3") and A100 envelope (246'-11 1/4"), so the DWG is
 * an earlier basis and never overrides a printed dimension. The CAD stall rows
 * this module used to draw were retired when the Blender site-context export
 * (assets/site-context.json, photo-matched massing in the same app frame)
 * took over parking, the upper tower and the wider site; this module keeps the
 * printed-dimension pool/patio/entry pieces and skips the JSON duplicates.
 * Units feet. x=V, z=U. Component dimensions use printed chains; placement is
 * a visual registration to the site plan, not survey control or an IFC model.
 * Loose furniture, planting and the site context are SCALED/context massing.
 */
(function(global){'use strict';
global.Home2Exterior=function(T,scene,pickables,options){
  var group=new T.Group();group.name='Site architecture · AS100 / AS102–105';scene.add(group);
  var box=new T.BoxGeometry(1,1,1);
  var scheme=(options&&options.scheme)||((document.body&&document.body.classList.contains('light'))?'light':'dark');

  /* ---------- procedural textures (no external assets) ---------- */
  var _s=13;function rnd(){_s=(_s*16807)%2147483647;return _s/2147483647;}
  function canvas(n){var c=document.createElement('canvas');c.width=c.height=n;return c;}
  /* Anisotropic filtering keeps the big ground textures sharp at grazing
     angles; 8 taps is within every hardware limit, and software drawing
     (where each tap is CPU cost) stays at the default 1. */
  var ANISO=(global.__IRONSTACK_GFX&&global.__IRONSTACK_GFX.software)?1:8;
  function toTex(c,srgb){var t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=ANISO;if(srgb!==false)t.encoding=T.sRGBEncoding;return t;}
  function tex(color,grain){var c=canvas(256),g=c.getContext('2d');g.fillStyle=color;g.fillRect(0,0,256,256);
    for(var i=0;i<3500;i++){var x=rnd()*256|0,y=rnd()*256|0;g.fillStyle=i%2?'#ffffff0a':'#0000000a';g.fillRect(x,y,grain?36:2,grain?1:2);}return toTex(c);}
  function grid(base,line,n,jit){var c=canvas(512),g=c.getContext('2d'),s=512/n;
    for(var j=0;j<n;j++)for(var i=0;i<n;i++){var d=(rnd()-.5)*jit;
      g.fillStyle='rgb('+((base[0]+d)|0)+','+((base[1]+d)|0)+','+((base[2]+d)|0)+')';g.fillRect(i*s,j*s,s,s);}
    for(var k=0;k<2600;k++){g.fillStyle=k%2?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)';g.fillRect(rnd()*512,rnd()*512,2,2);}
    g.strokeStyle=line;g.lineWidth=3;g.beginPath();
    for(var q=0;q<=n;q++){g.moveTo(q*s,0);g.lineTo(q*s,512);g.moveTo(0,q*s);g.lineTo(512,q*s);}g.stroke();return toTex(c);}
  var paverT=grid([182,176,164],'rgba(70,66,58,.85)',4,26);      /* 4 pavers / 8 ft */
  var tileT=grid([210,228,228],'rgba(120,150,152,.9)',8,14);     /* 6 in pool tile / 4 ft */
  var gravelT=(function(){var c=canvas(256),g=c.getContext('2d');g.fillStyle='#b1a186';g.fillRect(0,0,256,256);
    for(var i=0;i<6400;i++){var v=90+rnd()*120|0;g.fillStyle='rgba('+v+','+(v-8)+','+(v-24)+',.8)';g.fillRect(rnd()*256,rnd()*256,3,3);}return toTex(c);})();
  /* tileable value-noise normal map for the water ripple */
  function rippleNormal(seed){var n=64,gv=[],i,j;_s=seed;
    for(j=0;j<n;j++){gv[j]=[];for(i=0;i<n;i++)gv[j][i]=rnd();}
    function val(x,y){var x0=Math.floor(x)%n,y0=Math.floor(y)%n,x1=(x0+1)%n,y1=(y0+1)%n,fx=x-Math.floor(x),fy=y-Math.floor(y);
      fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
      return gv[y0][x0]*(1-fx)*(1-fy)+gv[y0][x1]*fx*(1-fy)+gv[y1][x0]*(1-fx)*fy+gv[y1][x1]*fx*fy;}
    var size=256,h=new Float32Array(size*size),x,y;
    for(y=0;y<size;y++)for(x=0;x<size;x++){var u=x/size,v=y/size;
      h[y*size+x]=.55*val(u*n/8,v*n/8)+.3*val(u*n/3,v*n/3)+.15*val(u*n,v*n);}
    var c=canvas(size),g=c.getContext('2d'),img=g.createImageData(size,size),k=3.2;
    for(y=0;y<size;y++)for(x=0;x<size;x++){
      var dx=(h[y*size+(x+1)%size]-h[y*size+(x+size-1)%size])*k;
      var dy=(h[((y+1)%size)*size+x]-h[((y+size-1)%size)*size+x])*k;
      var inv=1/Math.sqrt(dx*dx+dy*dy+1),p=(y*size+x)*4;
      img.data[p]=(-dx*inv*.5+.5)*255;img.data[p+1]=(-dy*inv*.5+.5)*255;img.data[p+2]=(inv*.5+.5)*255;img.data[p+3]=255;}
    g.putImageData(img,0,0);return toTex(c,false);}
  var rippleA=rippleNormal(4021),rippleB=rippleNormal(9173);
  tileT.repeat.set(4,10);gravelT.repeat.set(3,3);

  /* ---------- materials + scheme registry ---------- */
  var SCHEMED=[];
  function sch(m,l,d){SCHEMED.push({m:m,l:l,d:d});return m;}
  function std(o){return new T.MeshStandardMaterial(o);}
  var steel=std({color:0x454d4b,roughness:.48,metalness:.55});
  var wood=sch(std({color:0x98714b,roughness:.75,map:tex('#98714b',true)}),{color:0x98714b},{color:0x7d6248});
  var plaster=sch(std({color:0xeae8dc,roughness:.85}),{color:0xeae8dc},{color:0xb6bac1});
  var dark=sch(std({color:0x3f4140,roughness:.7}),{color:0x3f4140},{color:0x30343a});
  var coping=sch(std({color:0xded6c4,roughness:.62}),{color:0xded6c4},{color:0xb0aca4});
  var curb=sch(std({color:0xc4bfb4,roughness:.8}),{color:0xc4bfb4},{color:0x9a9892});
  var gravel=sch(std({color:0xffffff,roughness:1,map:gravelT}),{color:0xffffff},{color:0x8f8c92});
  var agaveM=sch(std({color:0x6f7d5c,roughness:.92}),{color:0x6f7d5c},{color:0x46523f});
  var shrubM=sch(std({color:0x5c6b4a,roughness:.95}),{color:0x5c6b4a},{color:0x3a4536});
  var boulderM=sch(std({color:0xa89e8d,roughness:.95}),{color:0xa89e8d},{color:0x7d786f});
  var fabric=sch(std({color:0xe4d7bd,roughness:.98}),{color:0xe4d7bd},{color:0xb9ad96});
  var umbM=sch(std({color:0xb7a98e,roughness:.94,side:T.DoubleSide}),{color:0xb7a98e},{color:0x8e8371});
  var chrome=std({color:0xc8d1d1,roughness:.25,metalness:.82});
  var poolTile=sch(std({color:0xffffff,roughness:.32,map:tileT}),{color:0xffffff},{color:0xaebfc4});
  var waterline=sch(std({color:0x1d5f86,roughness:.22}),{color:0x1d5f86,emissive:0x000000,emissiveIntensity:0},{color:0x17506f,emissive:0x0d3a52,emissiveIntensity:.22});
  var glass=sch(new T.MeshPhysicalMaterial({color:0xabcacc,roughness:.14,metalness:.08,transparent:true,opacity:.3,depthWrite:false,side:T.DoubleSide,emissive:0x000000}),
    {opacity:.3,emissive:0x000000,emissiveIntensity:0},{opacity:.5,emissive:0xffdca0,emissiveIntensity:.4});
  var glowM=std({color:0x2a2118,emissive:0xffd9a4,emissiveIntensity:.85,roughness:1});
  var nicheM=sch(std({color:0x27333a,emissive:0xcfe8ef,roughness:.4}),{emissiveIntensity:0},{emissiveIntensity:.9});
  var waterMat=sch(new T.MeshPhysicalMaterial({color:0x60b9c0,roughness:.08,metalness:.1,clearcoat:1,clearcoatRoughness:.06,
      transparent:true,opacity:.86,normalMap:rippleA,clearcoatNormalMap:rippleB,emissive:0x000000}),
    {color:0x6fc2cc,emissive:0x0c4552,emissiveIntensity:.05,opacity:.82},
    {color:0x2f98a8,emissive:0x0c4552,emissiveIntensity:.42,opacity:.88});
  waterMat.normalScale=new T.Vector2(.28,.28);
  waterMat.clearcoatNormalScale=new T.Vector2(.16,.16);
  rippleA.repeat.set(5,2);rippleB.repeat.set(3,1.4);
  /* three r128 uploads ONE uvTransform per material (taken from normalMap), so
     clearcoatNormalMap would otherwise sample rippleA's matrix and the second
     ripple layer would not exist. Give the clearcoat sample its own UV channel
     driven by rippleB.matrix, which update() keeps counter-drifting. */
  waterMat.onBeforeCompile=function(sh){
    sh.uniforms.uvTransformB={value:rippleB.matrix};
    sh.vertexShader='uniform mat3 uvTransformB;\nvarying vec2 vUvB;\n'+sh.vertexShader
      .replace('#include <uv_vertex>','#include <uv_vertex>\n\tvUvB=(uvTransformB*vec3(uv,1.0)).xy;');
    var cc=T.ShaderChunk.clearcoat_normal_fragment_maps
      .replace(/texture2D\(\s*clearcoatNormalMap\s*,\s*vUv\s*\)/,'texture2D( clearcoatNormalMap, vUvB )');
    sh.fragmentShader='varying vec2 vUvB;\n'+sh.fragmentShader
      .replace('#include <clearcoat_normal_fragment_maps>',cc);
  };
  waterMat.customProgramCacheKey=function(){return 'h2-water-dual-ripple';};

  /* ---------- placement helpers (pos x=V,z=U) ---------- */
  function mesh(u,v,y,du,dv,dy,mat,id){var m=new T.Mesh(box,mat);m.position.set(v,y,u);m.scale.set(dv,dy,du);
    m.castShadow=true;m.receiveShadow=true;m.userData.exterior=true;m.userData.exteriorSpace=id||'ZONEB';group.add(m);pickables.push(m);return m;}
  /* deco(): same box, NOT pickable, so ground/curb/planting never hijacks a zone click */
  function deco(u,v,y,du,dv,dy,mat,id){var m=new T.Mesh(box,mat);m.position.set(v,y,u);m.scale.set(dv,dy,du);
    m.castShadow=true;m.receiveShadow=true;m.userData.exterior=true;m.userData.exteriorSpace=id||'ZONEB';group.add(m);return m;}
  function bar(a,b,r,mat,id){var d=new T.Vector3().subVectors(b,a),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),8),mat);
    m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
    m.userData.exterior=true;m.userData.exteriorSpace=id||'ZONEB';m.castShadow=true;group.add(m);return m;}
  function repeated(spec,mat,geo){var inst=new T.InstancedMesh(geo||box,mat,spec.length),m=new T.Matrix4(),q=new T.Quaternion(),Y=new T.Vector3(0,1,0);
    spec.forEach(function(s,i){q.setFromAxisAngle(Y,s[6]||0);m.compose(new T.Vector3(s[1],s[2],s[0]),q,new T.Vector3(s[4],s[5],s[3]));inst.setMatrixAt(i,m);});
    inst.castShadow=true;inst.receiveShadow=true;inst.userData.exterior=true;group.add(inst);return inst;}
  /* Each pad needs its own material for a per-size texture repeat, so pave()
     builds and scheme-registers one directly; there is no shared base. */
  function pave(u,v,y,du,dv,dy,id){var m=std({color:0xffffff,roughness:.86,map:paverT.clone()});
    m.map.needsUpdate=true;m.map.repeat.set(dv/8,du/8);
    SCHEMED.push({m:m,l:{color:0xffffff},d:{color:0x9aa0a8}});return mesh(u,v,y,du,dv,dy,m,id);}
  function trellis(u,v,du,dv,id){
    [-1,1].forEach(function(a){[-1,1].forEach(function(b){mesh(u+a*(du/2-.3),v+b*(dv/2-.3),4.5,.3,.3,9,steel,id);});});
    mesh(u,v-dv/2,8.55,du,.28,.65,steel,id);mesh(u,v+dv/2,8.55,du,.28,.65,steel,id);
    var slats=[];for(var a=-du/2;a<=du/2;a+=.58)slats.push([u+a,v,8.88,.15,dv,.3]);repeated(slats,wood);
    for(var k=-1;k<=1;k++)deco(u,v+k*dv/3,9.14,du,.2,.12,wood,id); /* purlins tie the slats and thicken the shadow bands */
  }

  /* ================= POOL / PATIO (ZONEB) ================= */
  // Pool: AS104 Rev 5 prints a 40'-0" x 15'-3" water rectangle. Cavity keeps the
  // printed dims; the water plate sits 0.1' inside the waterline tile. Finish provisional.
  var pu=192.5,pv=78.625;
  pave(165.8,84.3,.06,13.4,37.4,.3);pave(225.2,84.3,.06,25.4,37.4,.3);
  pave(pu,68.3,.06,40,5.4,.3);pave(pu,94.625,.06,40,16.75,.3);
  // Tiled pool interior: floor + 4 walls inside the printed 40 x 15.25 cavity.
  var pfl=deco(pu,pv,-.2,40,15.25,.12,poolTile);pfl.castShadow=false;
  deco(pu,pv-7.565,-.02,40,.12,.5,poolTile);deco(pu,pv+7.565,-.02,40,.12,.5,poolTile);
  deco(pu-19.94,pv,-.02,.12,15.01,.5,poolTile);deco(pu+19.94,pv,-.02,.12,15.01,.5,poolTile);
  // Waterline band: 6-in glazed cobalt tile course at the printed water edge.
  deco(pu,pv-7.44,.17,39.76,.13,.28,waterline);deco(pu,pv+7.44,.17,39.76,.13,.28,waterline);
  deco(pu-19.82,pv,.17,.13,14.75,.28,waterline);deco(pu+19.82,pv,.17,.13,14.75,.28,waterline);
  // Pool niche lights: visual only, dark-scheme glow.
  [180,192.5,205].forEach(function(u){var n=deco(u,pv-7.5,-.06,.55,.06,.3,nicheM);n.castShadow=false;});
  var water=mesh(pu,pv,.08,39.8,15.05,.045,waterMat);water.castShadow=false;
  // Bullnose coping course around the water, then the entry steps.
  [[pu,70.5,41.2,1],[pu,86.75,41.2,1],[171.95,pv,1,15.25],[213.05,pv,1,15.25]].forEach(function(s){mesh(s[0],s[1],.28,s[2],s[3],.4,coping);});
  for(var i=0;i<4;i++)mesh(210.4-i*.7,74.1,-.02-i*.19,1.4,4.2,.25,coping);
  // Simple stainless entry rail; no claim of accessibility certification.
  bar(new T.Vector3(74,0,207.8),new T.Vector3(74,2.8,207.8),.075,chrome);
  bar(new T.Vector3(74,2.8,207.8),new T.Vector3(74,3,213),.075,chrome);
  bar(new T.Vector3(74,3,213),new T.Vector3(74,.3,213),.075,chrome);
  // Patio enclosure walls and caps come from the Blender site context
  // (Patio_Walls / Patio_WallCaps duplicate the AS104 masses box for box);
  // only the equipment screens and the grill counter stay procedural.
  mesh(163,96.98,3.65,2.9,.12,7,dark);
  mesh(222,96.98,3.65,3,.12,7,dark);
  trellis(233.5,81.5,8,15,'ZONEB');mesh(233.5,94,1.8,8,2.7,3.3,plaster);mesh(233.5,94,3.5,8.3,2.9,.25,dark);
  mesh(235,94,3.85,2.5,2,.48,chrome);
  // South pool fence only: the west/north/east enclosure is the site-context
  // low wall, so the old west fence run would have stood 2 ft inside it.
  var fence=[];for(var fu=163;fu<227;fu+=1.2)fence.push([fu,65.8,2.1,.055,.055,4]);
  repeated(fence,steel);
  mesh(194,65.8,4.05,64,.1,.12,steel);
  // Loose furniture: SCALED visual context only; quantities/approval stay in
  // the checklist. Every piece carries userData.basis='SCALED' (via SC), not
  // just some - half-tagged massing reads as false precision.
  function SC(m){m.userData.basis='SCALED';return m;}
  for(var j=0;j<4;j++){var cv=72.7+j*4.1;
    SC(mesh(218.9,cv,.95,5.2,2.05,.22,fabric));
    var back=SC(mesh(222.15,cv,1.62,2.3,2.05,.18,fabric));back.rotation.x=-.62;
    [-1,1].forEach(function(s){SC(deco(219.2,cv+s*.86,.5,4.7,.14,.14,steel));});
    if(j%2===0)SC(deco(219.2,cv+2.06,.86,1.35,1.35,.1,wood));}
  for(var j2=0;j2<4;j2++){var tu=176+j2*10;
    SC(mesh(tu,94,2.3,2.8,2.8,.2,wood));SC(mesh(tu,94,1.2,.35,.35,2.2,steel));
    [-1,1].forEach(function(s){SC(mesh(tu+s*2.5,94,1.5,1.7,1.7,.25,fabric));SC(mesh(tu+s*3.15,94,2.2,.2,1.7,1.4,steel));});
    SC(deco(tu,94,4.95,.1,.1,5.3,steel));          /* umbrella pole */
    var can=new T.Mesh(new T.ConeGeometry(4,1.3,8),umbM);can.position.set(94,7.6,tu);
    can.castShadow=true;can.userData.exterior=true;can.userData.exteriorSpace='ZONEB';SC(can);group.add(can);}

  /* ================= PORTICO / ENTRY (ZONEA) ================= */
  // The porte-cochere canopy, piers, drive island and entry tower come from
  // the Blender site context (Portico_* / Entry_*), which lands on the same
  // printed AS102 footprint; building a second canopy here made the two
  // soffits z-fight, so this module keeps only the storefront and trellis.
  var face=-7.38;
  // Paver seating island under the ZONEA trellis, curbed out of the drive.
  pave(188.7,-24.8,-.13,28,9.6,.32,'ZONEA');
  deco(188.7,-29.85,-.16,28.4,.5,.46,curb,'ZONEA');deco(188.7,-19.75,-.16,28.4,.5,.46,curb,'ZONEA');
  trellis(188.7,-24.8,25+9.5/12,7+2.375/12,'ZONEA');
  for(var j3=0;j3<3;j3++){SC(mesh(181+j3*8,-23,1.25,5.5,2.4,.5,fabric,'ZONEA'));SC(mesh(181+j3*8,-24.1,2,5.5,.3,1.3,wood,'ZONEA'));SC(mesh(181+j3*8,-19.5,1.35,2.7,2.7,.25,wood,'ZONEA'));}
  // Storefront glazing with open entry portal. Heights shown as contextual massing.
  for(var gu=187;gu<221;gu+=3.7){if(gu>213&&gu<220)continue;mesh(gu+1.8,face-.1,4.45,3.5,.09,8.5,glass,'ZONEA');mesh(gu,face-.1,4.45,.1,.17,8.7,steel,'ZONEA');}
  mesh(204,face-.1,8.8,34,.17,.14,steel,'ZONEA');
  // Warm lobby glow drawn in the glazing plane itself (never inside the lobby
  // volume, which floor3d models); dark scheme only.
  var glow=deco(199.8,face-.06,4.45,25.6,.03,8.3,glowM,'ZONEA');glow.castShadow=false;glow.visible=(scheme==='dark');
  // The old parapet "upper floor hint" band is gone: the site context supplies
  // the real four-story tower mass above the exhibit's wall cut.

  /* ================= LANDSCAPE BEDS (pool frontage) =================
     Sitework - asphalt, curbs, stall striping, walks and the wider desert
     lot - comes from the Blender site context now, so the old SCALED lots and
     their CAD stall rows are gone (they double-drew underneath the
     photo-matched layout). Only the beds dressing the printed pool/patio
     pieces stay procedural. */
  function bed(u,v,du,dv,id){var b=deco(u,v,-.2,du,dv,.24,gravel,id);b.userData.basis='SCALED AS100';return b;}
  bed(194.5,63.9,63,3.4);                 /* outside the pool fence   */
  bed(241,96,10,14);
  var agaves=[],shrubs=[],rocks=[];_s=5309;
  function scatter(list,u0,u1,v0,v1,n){for(var i2=0;i2<n;i2++)list.push([u0+rnd()*(u1-u0),v0+rnd()*(v1-v0)]);}
  scatter(agaves,168,224,63.2,64.8,7);scatter(shrubs,166,224,63,64.9,10);
  scatter(shrubs,237.5,244.5,90.5,101.5,6);scatter(agaves,238,244,91,101,2);
  repeated(agaves.map(function(p){var s2=.8+rnd()*.5;return[p[0],p[1],-.08+.8*s2,s2,s2,1.6*s2];}),agaveM,new T.ConeGeometry(.95,1,7)).userData.basis='SCALED AS100';
  repeated(shrubs.map(function(p){var s3=.5+rnd()*.5;return[p[0],p[1],-.08+.55*s3,s3,s3,1.1*s3];}),shrubM,new T.SphereGeometry(1,16,12)).userData.basis='SCALED AS100';
  scatter(rocks,170,240,63.3,64.7,4);
  repeated(rocks.map(function(p){var s4=.5+rnd()*.7;return[p[0],p[1],-.1+.3*s4,1.4*s4,s4,.8*s4]; }),boulderM,new T.SphereGeometry(1,10,7)).userData.basis='SCALED AS100';

  /* ---------- exhibit chip labels ---------- */
  var LBL={dark:{bg:'rgba(13,19,25,.85)',bd:'rgba(143,160,173,.38)',ink:'#c6d1db',tag:'#02A9E0'},
           light:{bg:'rgba(255,255,255,.88)',bd:'rgba(52,66,80,.4)',ink:'#33404c',tag:'#0284b3'}};
  var labels=[{tag:'AS104',text:'POOL / PATIO',u:192.5,v:104},{tag:'AS102',text:'PORTICO / TRELLIS',u:195,v:-46}];
  labels.forEach(function(L){
    L.canvas=canvas(64);L.canvas.width=1024;L.canvas.height=128;
    L.texture=new T.CanvasTexture(L.canvas);
    var m=new T.SpriteMaterial({map:L.texture,depthTest:false,transparent:true});
    /* Caption planes doubled: at overview distance the old 26ft chip drew about 5px tall. */
    L.sprite=new T.Sprite(m);L.sprite.position.set(L.v,2.9,L.u);L.sprite.scale.set(40,5,1);group.add(L.sprite);});
  function drawLabels(){var p=LBL[scheme];labels.forEach(function(L){
    var g=L.canvas.getContext('2d');g.clearRect(0,0,1024,128);
    g.font='600 44px Consolas,Menlo,monospace';try{g.letterSpacing='5px';}catch(e){}
    var tag=L.tag.toUpperCase(),txt=L.text.toUpperCase();
    var wTag=g.measureText(tag).width,wTxt=g.measureText(txt).width,pad=34,gap=26;
    var w=Math.min(1000,wTag+gap+wTxt+pad*2),x0=(1024-w)/2,y0=22,h=84,r=12;
    g.beginPath();g.moveTo(x0+r,y0);g.arcTo(x0+w,y0,x0+w,y0+h,r);g.arcTo(x0+w,y0+h,x0,y0+h,r);
    g.arcTo(x0,y0+h,x0,y0,r);g.arcTo(x0,y0,x0+w,y0,r);g.closePath();
    g.fillStyle=p.bg;g.fill();g.lineWidth=3;g.strokeStyle=p.bd;g.stroke();
    g.textBaseline='middle';g.fillStyle=p.tag;g.fillText(tag,x0+pad,y0+h/2+2);
    g.fillStyle=p.ink;g.fillText(txt,x0+pad+wTag+gap,y0+h/2+2);
    L.texture.needsUpdate=true;});}

  /* ---------- host site pad ----------
     floor3d's ground slab (std 0x141a20) is built outside this module and is
     not registered in any scheme swap there, which would strand this module's
     white-based light materials on a near-black pad in light mode. Find it and
     register it (light gets a paper tone, dark keeps the exhibit ground).
     ORDERING CONSTRAINT: finish() installs Home2FloorFinishes first and this
     module second, and floor-finishes deliberately leaves the slab material
     alone - if anything upstream ever clones or recolors the slab before this
     runs, the hex guard stops matching and the pad keeps the host color in
     both schemes. KNOWN EDGE: this optional module is the pad's only light
     registration, so if it fails to load, light scheme keeps the dark slab
     under the paper shell - accepted, the module ships with the page and the
     dark default is unaffected. ponytail: heuristic match - the only mesh
     wider than 400 ft on both axes below grade. */
  scene.traverse(function(o){
    if(o.isMesh&&!o.userData.exterior&&o.scale&&o.scale.x>400&&o.scale.z>400&&o.position.y<0&&
       o.material&&o.material.color&&o.material.color.getHex()===0x141a20){
      SCHEMED.push({m:o.material,l:{color:0xc7c2b4},d:{color:0x141a20}});
    }
  });

  /* Exterior clicks ride the host's own picker: every pickable here carries
     userData.exteriorSpace, which hit() maps to the ZONEA/ZONEB space rows, so
     a click selects + shows the selection card and focuses like any interior
     space. The Home2Documents plan set opens only from the card's SITE
     DRAWINGS action - the old per-pointerup raycast that opened the modal on
     every exterior click is gone. */

  /* ---------- Blender site context (assets/site-context.json) ----------
     Photo-matched site massing exported in the app frame (feet, x=V, z=U,
     y=up). Skipped: F1_* (the detailed floor-1 exhibit already draws that),
     PoolWater / Pool_Basin (the animated procedural water and tiled cavity
     are richer), and the JSON twins of pieces this module keeps because the
     printed-dimension versions are finer (deck pavers, pool coping, both
     trellises, the south fence, the grill). Entry and patio architecture
     stays pickable by zone; the tower, parking and landscape are context
     only. Loaded once; scheme toggles swap materials, never refetch. */
  var SITE_SKIP={PoolWater:1,Pool_Basin:1,Pool_Deck:1,Pool_Coping:1,Pool_Fence:1,
    Patio_Trellis:1,Patio_TrellisSlats:1,Entry_Trellis:1,Entry_TrellisSlats:1,
    Patio_Grill:1,Patio_GrillTop:1};
  var SITE_PICK={Portico_Canopy:'ZONEA',Portico_Soffit:'ZONEA',Portico_Piers:'ZONEA',
    Portico_Island:'ZONEA',Entry_Beacon:'ZONEA',Entry_BeaconCap:'ZONEA',Entry_Keep:'ZONEA',
    Entry_KeepCap:'ZONEA',Entry_Lime:'ZONEA',Entry_Sign:'ZONEA',Entry_Bollards:'ZONEA',
    Patio_Walls:'ZONEB',Patio_WallCaps:'ZONEB'};
  var SITE_GROUND={Ground:1,Asphalt:1,Road_US277:1,Sidewalks:1,Gravel_Beds:1,
    Stall_Stripes:1,Restaurant_Pad:1,Portico_Island:1};
  /* Upper-tower pieces hover over the whole floor plate; the host shows them
     only in the overview/exterior poses so the cutaway plan stays readable. */
  var SITE_TOWER={Tower_Body:1,Windows_Upper:1,Parapet:1,Band_White:1,Coping:1,
    Accent_Strips:1,Roof_Slab:1,Roof_Units:1,Roof_ElevOverrun:1};
  var siteContext=new T.Group();siteContext.name='siteContext';group.add(siteContext);
  var towerCtx=new T.Group();towerCtx.name='towerCtx';siteContext.add(towerCtx);
  fetch('assets/site-context.json')
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      if(!d||!d.objects)return;
      var tall=null;
      d.objects.forEach(function(o){
        if(SITE_SKIP[o.name]||o.name.indexOf('F1_')===0)return;
        var geo=new T.BufferGeometry();
        geo.setAttribute('position',new T.BufferAttribute(new Float32Array(o.positions),3));
        geo.setAttribute('normal',new T.BufferAttribute(new Float32Array(o.normals),3));
        geo.setIndex(new T.BufferAttribute(new (o.positions.length/3>65535?Uint32Array:Uint16Array)(o.indices),1));
        geo.computeBoundingBox();geo.computeBoundingSphere();
        var col=new T.Color(o.color[0],o.color[1],o.color[2]);
        var m=std({color:col.getHex(),roughness:o.roughness,metalness:o.metalness});
        if(o.opacity<1){m.transparent=true;m.opacity=o.opacity;}
        /* Photo-matched color in both schemes. The dark exhibit dims massing
           ~15%, but the big light-grey ground planes at 15% still read as full
           daylight under the 0b0f13 sky, so they drop to ~45% and the upper
           glazing lights up - that contrast IS the dusk look. */
        var dim=SITE_GROUND[o.name]?0.45:0.85;
        var entry={m:m,l:{color:col.getHex()},d:{color:col.clone().multiplyScalar(dim).getHex()}};
        if(o.name==='Windows_Upper'){entry.l.emissive=0x000000;entry.l.emissiveIntensity=0;
          entry.d.emissive=0xffd9a4;entry.d.emissiveIntensity=.35;}
        SCHEMED.push(entry);
        var msh=new T.Mesh(geo,m);
        msh.name=o.name;
        msh.receiveShadow=true;msh.castShadow=!SITE_GROUND[o.name];
        if(SITE_PICK[o.name]){msh.userData.exterior=true;msh.userData.exteriorSpace=SITE_PICK[o.name];pickables.push(msh);}
        else msh.userData.siteContext=true;
        (SITE_TOWER[o.name]?towerCtx:siteContext).add(msh);
        /* Anything reaching past the light poles feeds the overview framing
           envelope, so the tower and entry beacon are never cropped. */
        if(geo.boundingBox.max.y>21){if(tall)tall.union(geo.boundingBox);else tall=geo.boundingBox.clone();}
      });
      if(tall)api.contextTop={u:[tall.min.z,tall.max.z],v:[tall.min.x,tall.max.x],h:tall.max.y};
      applyScheme(scheme);
      try{window.dispatchEvent(new Event('h2sep:site-context'));}catch(e){}
    })
    .catch(function(){/* Site context is optional; the exhibit renders without it. */});

  /* ---------- scheme ---------- */
  function applyScheme(mode){
    scheme=(mode==='light')?'light':'dark';
    SCHEMED.forEach(function(e){var p=(scheme==='light')?e.l:e.d;if(!p)return;
      if(p.color!==undefined)e.m.color.setHex(p.color);
      if(p.emissive!==undefined&&e.m.emissive)e.m.emissive.setHex(p.emissive);
      if(p.emissiveIntensity!==undefined)e.m.emissiveIntensity=p.emissiveIntensity;
      if(p.opacity!==undefined)e.m.opacity=p.opacity;});
    glow.visible=(scheme==='dark');
    drawLabels();
  }
  applyScheme(scheme);
  if(typeof MutationObserver!=='undefined'&&document.body){
    new MutationObserver(function(){var m=document.body.classList.contains('light')?'light':'dark';if(m!==scheme)applyScheme(m);})
      .observe(document.body,{attributes:true,attributeFilter:['class']});
  }

  /* bounds stays the pool/patio zone (the 'exterior' pose); contextTop is the
     tall site-context envelope, set once the JSON loads, for overview framing. */
  var api={group:group,bounds:{u:[156,281],v:[-72,106]},contextTop:null,
    setVisible:function(value){group.visible=!!value;},
    setTowerVisible:function(value){towerCtx.visible=!!value;},
    applyScheme:applyScheme,
    update:function(ms){
      rippleA.offset.set((ms*.0000105)%1,(ms*.0000062)%1);
      rippleB.offset.set(1-(ms*.0000068)%1,(ms*.0000091)%1);
      /* the renderer only auto-updates the primary uvTransform (rippleA);
         rippleB feeds the injected uvTransformB uniform by reference. */
      rippleB.updateMatrix();
    }};
  return api;
};
})(window);
