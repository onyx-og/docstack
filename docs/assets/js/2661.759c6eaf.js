"use strict";(self.webpackChunk_docstack_docs=self.webpackChunk_docstack_docs||[]).push([["2661"],{25871(e,t,a){function i(e,t){e.accDescr&&t.setAccDescription?.(e.accDescr),e.accTitle&&t.setAccTitle?.(e.accTitle),e.title&&t.setDiagramTitle?.(e.title)}a.d(t,{S:()=>i}),(0,a(40797).K2)(i,"populateCommonDb")},69412(e,t,a){a.d(t,{diagram:()=>v});var i=a(73590),l=a(25871),r=a(13226),s=a(7332),o=a(40797),c=a(73744),n=a(65088),p=s.UI.pie,d={sections:new Map,showData:!1,config:p},u=d.sections,g=d.showData,f=structuredClone(p),h=(0,o.K2)(()=>structuredClone(f),"getConfig"),m=(0,o.K2)(()=>{u=new Map,g=d.showData,(0,s.IU)()},"clear"),x=(0,o.K2)(({label:e,value:t})=>{if(t<0)throw Error(`"${e}" has invalid value: ${t}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);u.has(e)||(u.set(e,t),o.Rm.debug(`added new section: ${e}, with value: ${t}`))},"addSection"),w=(0,o.K2)(()=>u,"getSections"),S=(0,o.K2)(e=>{g=e},"setShowData"),$=(0,o.K2)(()=>g,"getShowData"),D={getConfig:h,clear:m,setDiagramTitle:s.ke,getDiagramTitle:s.ab,setAccTitle:s.SV,getAccTitle:s.iN,setAccDescription:s.EI,getAccDescription:s.m7,addSection:x,getSections:w,setShowData:S,getShowData:$},T=(0,o.K2)((e,t)=>{(0,l.S)(e,t),t.setShowData(e.showData),e.sections.map(t.addSection)},"populateDb"),y={parse:(0,o.K2)(async e=>{let t=await (0,c.qg)("pie",e);o.Rm.debug(t),T(t,D)},"parse")},C=(0,o.K2)(e=>`
  .pieCircle{
    stroke: ${e.pieStrokeColor};
    stroke-width : ${e.pieStrokeWidth};
    opacity : ${e.pieOpacity};
  }
  .pieOuterCircle{
    stroke: ${e.pieOuterStrokeColor};
    stroke-width: ${e.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${e.pieTitleTextSize};
    fill: ${e.pieTitleTextColor};
    font-family: ${e.fontFamily};
  }
  .slice {
    font-family: ${e.fontFamily};
    fill: ${e.pieSectionTextColor};
    font-size:${e.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${e.pieLegendTextColor};
    font-family: ${e.fontFamily};
    font-size: ${e.pieLegendTextSize};
  }
`,"getStyles"),k=(0,o.K2)(e=>{let t=[...e.values()].reduce((e,t)=>e+t,0),a=[...e.entries()].map(([e,t])=>({label:e,value:t})).filter(e=>e.value/t*100>=1).sort((e,t)=>t.value-e.value);return(0,n.rLf)().value(e=>e.value)(a)},"createPieArcs"),v={parser:y,db:D,renderer:{draw:(0,o.K2)((e,t,a,l)=>{o.Rm.debug("rendering pie chart\n"+e);let c=l.db,p=(0,s.D7)(),d=(0,r.$t)(c.getConfig(),p.pie),u=(0,i.D)(t),g=u.append("g");g.attr("transform","translate(225,225)");let{themeVariables:f}=p,[h]=(0,r.I5)(f.pieOuterStrokeWidth);h??=2;let m=d.textPosition,x=(0,n.JLW)().innerRadius(0).outerRadius(185),w=(0,n.JLW)().innerRadius(185*m).outerRadius(185*m);g.append("circle").attr("cx",0).attr("cy",0).attr("r",185+h/2).attr("class","pieOuterCircle");let S=c.getSections(),$=k(S),D=[f.pie1,f.pie2,f.pie3,f.pie4,f.pie5,f.pie6,f.pie7,f.pie8,f.pie9,f.pie10,f.pie11,f.pie12],T=0;S.forEach(e=>{T+=e});let y=$.filter(e=>"0"!==(e.data.value/T*100).toFixed(0)),C=(0,n.UMr)(D);g.selectAll("mySlices").data(y).enter().append("path").attr("d",x).attr("fill",e=>C(e.data.label)).attr("class","pieCircle"),g.selectAll("mySlices").data(y).enter().append("text").text(e=>(e.data.value/T*100).toFixed(0)+"%").attr("transform",e=>"translate("+w.centroid(e)+")").style("text-anchor","middle").attr("class","slice"),g.append("text").text(c.getDiagramTitle()).attr("x",0).attr("y",-200).attr("class","pieTitleText");let v=[...S.entries()].map(([e,t])=>({label:e,value:t})),b=g.selectAll(".legend").data(v).enter().append("g").attr("class","legend").attr("transform",(e,t)=>"translate(216,"+(22*t-22*v.length/2)+")");b.append("rect").attr("width",18).attr("height",18).style("fill",e=>C(e.label)).style("stroke",e=>C(e.label)),b.append("text").attr("x",22).attr("y",14).text(e=>c.getShowData()?`${e.label} [${e.value}]`:e.label);let A=512+Math.max(...b.selectAll("text").nodes().map(e=>e?.getBoundingClientRect().width??0));u.attr("viewBox",`0 0 ${A} 450`),(0,s.a$)(u,450,A,d.useMaxWidth)},"draw")},styles:C}}}]);