
"use client";
import {useEffect,useMemo,useState} from "react";

type Job={id:string;company:string;title:string;location:string;url:string;description:string;source:string};
type Rec={id:string;job:Job;status:string;notes:string};

const emptyProfile={
  name:"",
  email:"",
  location:"United States",
  targetRoles:"Data Scientist, Machine Learning Engineer, AI Engineer",
  workAuth:"Verify work authorization with me; do not assume sponsorship eligibility.",
  facts:"",
  resume:""
};

const defaultBoards="stripe, anthropic, datadog, doordash, ramp, rippling, scaleai, snowflake, wayfair";

export default function Home(){
const [tab,setTab]=useState("Jobs"),[query,setQuery]=useState("Data Scientist"),[location,setLocation]=useState("United States"),[usOnly,setUsOnly]=useState(true),[jobs,setJobs]=useState<Job[]>([]),[selected,setSelected]=useState<Job|null>(null),[busy,setBusy]=useState(false),[docBusy,setDocBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[profile,setProfile]=useState(emptyProfile),[records,setRecords]=useState<Rec[]>([]),[boards,setBoards]=useState(defaultBoards),[jd,setJd]=useState(""),[resumeOut,setResumeOut]=useState(""),[letterOut,setLetterOut]=useState(""),[matchMode,setMatchMode]=useState(false);

useEffect(()=>{
  try{
    const p=localStorage.getItem("jhai-profile");
    if(p)setProfile({...emptyProfile,...JSON.parse(p)});
    const r=localStorage.getItem("jhai-records");
    if(r)setRecords(JSON.parse(r));
  }catch{}
},[]);

useEffect(()=>{
  try{
    localStorage.setItem("jhai-profile",JSON.stringify(profile));
    localStorage.setItem("jhai-records",JSON.stringify(records));
  }catch{}
},[profile,records]);

const filtered=useMemo(()=>jobs.filter(j=>{
  const q=query.toLowerCase();
  const hay=(j.title+" "+j.company+" "+j.location+" "+j.description).toLowerCase();
  const loc=(j.location+" "+j.description).toLowerCase();
  const us=/united states|usa|remote|new york|san francisco|seattle|chicago|boston|austin|denver|washington|atlanta|los angeles|palo alto|mountain view|san diego|portland|california|texas|massachusetts|illinois|colorado|virginia|florida|new jersey/.test(loc);
  return (!q||hay.includes(q))&&(!usOnly||us);
}),[jobs,query,usOnly]);

function scoreJob(j:Job){
  const profileText=[
    profile.targetRoles,
    profile.facts,
    profile.resume
  ].join(" ").toLowerCase();

  const jobText=[
    j.title,
    j.description,
    j.company
  ].join(" ").toLowerCase();

  const stop=new Set([
    "the","and","for","with","from","you","your","our","are",
    "will","have","has","this","that","role","work","experience",
    "years","using","their","they","about","who","all","can","not",
    "job","team","including","data","engineer","scientist","machine",
    "learning"
  ]);

  const words=[...new Set(
    profileText.match(/[a-z][a-z+#.-]{2,}/g)||[]
  )].filter(w=>!stop.has(w));

  if(!words.length)return 0;

  const matches=words.filter(w=>jobText.includes(w));
  return Math.min(
    99,
    Math.round(matches.length/Math.min(words.length,20)*100)
  );
}

const rankedJobs=useMemo(
  ()=>[...filtered].sort((a,b)=>scoreJob(b)-scoreJob(a)),
  [filtered,profile]
);

async function find(){
  setBusy(true);
  setError("");
  setNotice("");

  try{
    const r=await fetch("/api/jobs",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        boards:boards.split(",").map(x=>x.trim()).filter(Boolean),
        query,
        location
      })
    });

    const d=await r.json();
    if(!r.ok)throw Error(d.error||"Search failed");

    const found=d.jobs||[];
    setJobs(found);

    const adzunaCount=found.filter(
      (j:Job)=>j.source==="Adzuna"
    ).length;

    const greenhouseCount=found.filter(
      (j:Job)=>j.source==="Greenhouse"
    ).length;

    setNotice(
      `Loaded ${found.length} jobs: ${adzunaCount} from Adzuna and ${greenhouseCount} from Greenhouse.`
    );
  }catch(e:any){
    setError(e.message||"Search failed");
  }finally{
    setBusy(false);
  }
}

function track(j:Job){
  if(records.some(r=>r.job.id===j.id)){
    setNotice("Already in tracker.");
    return;
  }

  setRecords([
    {id:crypto.randomUUID(),job:j,status:"Interested",notes:""},
    ...records
  ]);

  setNotice("Saved to tracker. Check the employer's original listing before applying.");
}

async function generate(){
  setDocBusy(true);
  setError("");
  setNotice("");
  setResumeOut("");
  setLetterOut("");

  const desc=(jd||selected?.description||"").trim();

  if(!profile.facts.trim()&&!profile.resume.trim()){
    setError("Add verified career facts or résumé in Profile first.");
    setDocBusy(false);
    return;
  }

  if(!desc){
    setError("Paste a job description or select a job first.");
    setDocBusy(false);
    return;
  }

  try{
    const r=await fetch("/api/generate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        profile,
        job:{
          title:selected?.title||"Target role",
          company:selected?.company||"Target company",
          location:selected?.location||location,
          description:desc
        }
      })
    });

    const d=await r.json();
    if(!r.ok)throw Error(d.error||"Generation failed");

    setResumeOut(d.resume||"");
    setLetterOut(d.coverLetter||"");
    setNotice("Drafts generated. Verify every detail before using.");
  }catch(e:any){
    setError(e.message||"Generation failed");
  }finally{
    setDocBusy(false);
  }
}

function download(name:string,s:string){
  const u=URL.createObjectURL(
    new Blob([s],{type:"text/plain;charset=utf-8"})
  );
  const a=document.createElement("a");
  a.href=u;
  a.download=name;
  a.click();
  URL.revokeObjectURL(u);
}

function printDocument(title:string,content:string){
  const escapeHtml=(value:string)=>value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");

  const lines=content.split(/\r?\n/);
  let html="";
  let inList=false;

  const closeList=()=>{
    if(inList){
      html+="</ul>";
      inList=false;
    }
  };

  for(const raw of lines){
    const line=raw.trim();
    if(!line){
      closeList();
      continue;
    }

    const clean=line.replace(/^#{1,3}\s*/,"");

    if(/^[-*•]\s+/.test(line)){
      if(!inList){
        html+="<ul>";
        inList=true;
      }
      html+="<li>"+escapeHtml(line.replace(/^[-*•]\s+/,""))+"</li>";
      continue;
    }

    closeList();

    if(/^#{1,3}\s+/.test(line)||(/^[A-Z][A-Z &/|—–-]{2,45}$/.test(clean)&&clean.length<48)){
      html+="<h2>"+escapeHtml(clean)+"</h2>";
    }else if(line.length<95&&/\|/.test(line)){
      html+='<p class="contact">'+escapeHtml(line)+"</p>";
    }else{
      html+="<p>"+escapeHtml(clean)+"</p>";
    }
  }

  closeList();

  const win=window.open("","_blank","width=900,height=700");

  if(!win){
    setError("Your browser blocked the print window. Allow pop-ups for this site and try again.");
    return;
  }

  win.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><meta charset="utf-8"><style>
  @page{size:Letter;margin:.45in}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#202923;font-size:9.2pt;line-height:1.28;margin:0}h1{font-size:20pt;letter-spacing:-.4pt;margin:0 0 5pt;color:#174e39}h2{font-size:10pt;text-transform:uppercase;letter-spacing:.65pt;border-bottom:1px solid #b8c9bc;padding-bottom:3pt;margin:10pt 0 4pt;color:#174e39;break-after:avoid}p{margin:0 0 4pt;white-space:pre-wrap;overflow-wrap:anywhere}ul{margin:2pt 0 5pt;padding-left:15pt}li{margin:0 0 2.5pt;padding-left:1pt}header{margin-bottom:8pt}header .sub{font-size:9pt;color:#526158;margin-top:2pt}.contact{font-size:8.5pt;color:#526158}.cover p{margin-bottom:9pt;line-height:1.42}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><header><h1>${escapeHtml(profile.name||"Candidate Name")}</h1><div class="sub">${escapeHtml([profile.location,profile.email].filter(Boolean).join(" · "))}</div></header>${html}<script>window.onload=()=>{setTimeout(()=>window.print(),250)};window.onafterprint=()=>window.close();</script></body></html>`);

  win.document.close();
}

return <main className="shell">
<header className="topbar">
  <a className="brand">
    <span className="brandmark">J</span>
    <span>JobHunter <b>AI</b><small>Find your next opportunity</small></span>
  </a>
  <span className="status">● AI-assisted · human-reviewed</span>
</header>

<section className="hero">
  <div>
    <div className="eyebrow">✦ YOUR CAREER, WITH A PLAN</div>
    <h1>Find the role.<br/><em>Make your move.</em></h1>
    <p>Search public job listings, tailor your résumé to the role, and keep every application organized in one workspace.</p>
    <div className="actions">
      <button className="primary" onClick={()=>setTab("Jobs")}>Explore jobs ↗</button>
      <button className="secondary" onClick={()=>setTab("Documents")}>Tailor my résumé</button>
    </div>
    <div className="trust">✓ No invented credentials　 ✓ Review before applying　 ✓ Browser-based tracker</div>
  </div>

  <aside className="hero-card">
    <div className="row">
      <span className="eyebrow">YOUR JOB SEARCH</span>
      <span className="live">● READY</span>
    </div>
    <div className="big">{records.length}<small> tracked opportunities</small></div>
    <div className="bar"><span style={{width:`${Math.min(records.length*8,100)}%`}}/></div>
    <div className="stats">
      <div><b>{jobs.length}</b><small>Listings</small></div>
      <div><b>{records.filter(x=>x.status==="Applied").length}</b><small>Applied</small></div>
      <div><b>{records.filter(x=>x.status==="Interview").length}</b><small>Interviews</small></div>
    </div>
    <p className="tip">✦ <span><b>Remember:</b> confirm the listing is active and verify location and sponsorship on the employer site.</span></p>
  </aside>
  <span className="orb"/>
</section>

<nav className="tabs">
  {["Jobs","Documents","Tracker","Profile"].map(t=>
    <button className={tab===t?"active":""} key={t} onClick={()=>setTab(t)}>{t}</button>
  )}
</nav>

{error&&<div className="alert err">{error}<button onClick={()=>setError("")}>×</button></div>}
{notice&&<div className="alert">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

{tab==="Jobs"&&<section className="panel">
  <div className="section-head">
    <div>
      <div className="eyebrow">OPPORTUNITY FINDER</div>
      <h2>Jobs worth a closer look</h2>
      <p>Search public job listings from Adzuna and supported company career boards.</p>
    </div>
    <span className="count">{filtered.length} matches</span>
  </div>

  <div className="controls">
    <label>Role, company, keyword<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Data Scientist"/></label>
    <label>Preferred location<input value={location} onChange={e=>setLocation(e.target.value)}/></label>
    <label className="checkbox"><input type="checkbox" checked={usOnly} onChange={e=>setUsOnly(e.target.checked)}/> US-focused results</label>
    <button className="primary" disabled={busy} onClick={find}>{busy?"Searching…":"Find jobs ↗"}</button>
    <button
      className={matchMode?"primary":"secondary"}
      onClick={()=>{
        if(!profile.targetRoles.trim()&&!profile.facts.trim()&&!profile.resume.trim()){
          setError("Add target roles, career facts, or résumé in Profile first.");
          setTab("Profile");
          return;
        }
        setMatchMode(!matchMode);
        setNotice(!matchMode?"Jobs sorted by estimated profile keyword match. Scores are rough estimates, not hiring probabilities.":"Showing normal search order.");
      }}
    >
      {matchMode?"✓ Best matches first":"✨ Find My Best Jobs"}
    </button>
  </div>

  <details className="boards">
    <summary>Company boards · edit sources</summary>
    <p>Comma-separated Greenhouse board tokens; some tokens may be unavailable.</p>
    <textarea value={boards} onChange={e=>setBoards(e.target.value)}/>
  </details>

  {!jobs.length&&!busy?
    <div className="empty">
      <div className="empty-icon">⌕</div>
      <h3>Your next role is out there.</h3>
      <p>Search company career boards to load openings.</p>
      <button className="secondary" onClick={find}>Search configured boards</button>
    </div>
  :
    <div className="job-layout">
      <div className="job-list">
        {(matchMode?rankedJobs:filtered).map(j=>
          <button className={"job "+(selected?.id===j.id?"chosen":"")} key={j.id} onClick={()=>setSelected(j)}>
            <span className="logo">{j.company?.[0]||"J"}</span>
            <span>
              <b>{j.title}</b>
              <small>{j.company} · {j.location}</small>
              <small>{j.source} · public listing{matchMode?` · ${scoreJob(j)}% keyword match`:""}</small>
            </span>
            ↗
          </button>
        )}
        {!filtered.length&&<p className="muted pad">No matches. Try another keyword or turn off US-focused results.</p>}
      </div>

      <div className="detail">
        {selected?
          <>
            <div className="row">
              <span className="eyebrow">ROLE DETAILS</span>
              <a href={selected.url} target="_blank" rel="noreferrer">Original posting ↗</a>
            </div>
            <h3>{selected.title}</h3>
            <p className="muted">{selected.company} · {selected.location}</p>
            <p className="desc">{selected.description?.slice(0,3200)||"No description returned. Open original posting."}</p>
            <div className="verify">
              <b>Before applying</b>
              <span>□ Confirm still open</span>
              <span>□ Check location and work authorization</span>
              <span>□ Verify sponsorship policy</span>
            </div>
            <div className="actions">
              <button className="primary" onClick={()=>track(selected)}>＋ Track job</button>
              <button className="secondary" onClick={()=>{setJd(selected.description||"");setTab("Documents")}}>Tailor documents</button>
            </div>
          </>
        :
          <div className="placeholder">
            <h3>← Select a role</h3>
            <p>Choose a job to view details and save it.</p>
          </div>
        }
      </div>
    </div>
  }
</section>}

{tab==="Documents"&&<section className="panel">
  <div className="section-head">
    <div>
      <div className="eyebrow">APPLICATION STUDIO</div>
      <h2>Make your experience relevant</h2>
      <p>Generate an honest first draft from facts you provide.</p>
    </div>
    <span className="count">AI DRAFTS</span>
  </div>

  <div className="twocol">
    <div className="formbox">
      <label>Choose a job
        <select value={selected?.id||""} onChange={e=>{
          const j=jobs.find(x=>x.id===e.target.value);
          if(j){setSelected(j);setJd(j.description)}
        }}>
          <option value="">Paste description below</option>
          {jobs.map(j=><option key={j.id} value={j.id}>{j.company} — {j.title}</option>)}
        </select>
      </label>

      <label>Job description *<textarea rows={10} value={jd} onChange={e=>setJd(e.target.value)} placeholder="Paste the complete job description…"/></label>
      <p className="callout">✦ Only your supplied profile and résumé are used as evidence. Missing facts are flagged instead of fabricated.</p>
      <button className="primary full" disabled={docBusy} onClick={generate}>{docBusy?"Drafting…":"Generate résumé + cover letter ↗"}</button>
    </div>

    <div className="output">
      <div className="row">
        <h3>Tailored résumé</h3>
        {resumeOut&&<div className="doc-actions">
          <button className="tiny" onClick={()=>printDocument("Ujjwal-Pandit-Resume",resumeOut)}>Save PDF ↗</button>
          <button className="tiny" onClick={()=>download("tailored-resume.txt",resumeOut)}>TXT ↓</button>
        </div>}
      </div>
      {resumeOut?<pre>{resumeOut}</pre>:<div className="out-empty">▤<small>Your résumé draft appears here.</small></div>}

      <div className="row letter">
        <h3>Cover letter</h3>
        {letterOut&&<div className="doc-actions">
          <button className="tiny" onClick={()=>printDocument("Ujjwal-Pandit-Cover-Letter",letterOut)}>Save PDF ↗</button>
          <button className="tiny" onClick={()=>download("cover-letter.txt",letterOut)}>TXT ↓</button>
        </div>}
      </div>
      {letterOut?<pre>{letterOut}</pre>:<div className="out-empty">✉<small>Your cover letter appears here.</small></div>}
    </div>
  </div>

  <p className="muted footnote">For PDF export, choose “Save as PDF” in the print dialog. A one-page fit depends on the amount of generated content; review page count and adjust margins or content if needed. Proofread every draft. This app does not submit applications or complete assessments automatically.</p>
</section>}

{tab==="Tracker"&&<section className="panel">
  <div className="section-head">
    <div>
      <div className="eyebrow">YOUR PIPELINE</div>
      <h2>Keep momentum visible</h2>
      <p>Saved locally in this browser, not synced between devices.</p>
    </div>
    <span className="count">{records.length} saved</span>
  </div>

  {!records.length?
    <div className="empty">
      <h3>Your tracker starts here.</h3>
      <p>Save a job from the Jobs tab.</p>
      <button className="secondary" onClick={()=>setTab("Jobs")}>Browse jobs</button>
    </div>
  :
    <>
      {records.map(r=>
        <div className="tracker" key={r.id}>
          <div className="logo">{r.job.company[0]}</div>
          <div className="tracker-main">
            <b>{r.job.title}</b>
            <small>{r.job.company} · {r.job.location}</small>
            <a href={r.job.url} target="_blank" rel="noreferrer">View posting ↗</a>
            <input value={r.notes} placeholder="Notes / next step" onChange={e=>setRecords(old=>old.map(x=>x.id===r.id?{...x,notes:e.target.value}:x))}/>
          </div>
          <select value={r.status} onChange={e=>setRecords(old=>old.map(x=>x.id===r.id?{...x,status:e.target.value}:x))}>
            {["Interested","Preparing","Applied","Interview","Offer","Rejected","Withdrawn"].map(s=><option key={s}>{s}</option>)}
          </select>
          <button className="tiny" onClick={()=>setRecords(old=>old.filter(x=>x.id!==r.id))}>Remove</button>
        </div>
      )}
    </>
  }

  <button className="secondary export" onClick={()=>download("jobhunter-tracker.json",JSON.stringify(records,null,2))}>Export tracker JSON ↓</button>
</section>}

{tab==="Profile"&&<section className="panel">
  <div className="section-head">
    <div>
      <div className="eyebrow">YOUR SOURCE OF TRUTH</div>
      <h2>Career profile</h2>
      <p>Profile is stored in this browser and sent to AI only when generating documents.</p>
    </div>
  </div>

  <div className="twocol">
    <div className="formbox">
      {([["name","Full name"],["email","Email"],["location","Current location / relocation"],["targetRoles","Target roles"],["workAuth","Work authorization facts (do not guess)"],["facts","Verified career facts / achievements"],["resume","Existing résumé text (optional)"]] as const).map(([key,label])=>
        <label key={key}>{label}
          {key==="facts"||key==="resume"||key==="workAuth"?
            <textarea rows={key==="resume"?8:key==="facts"?7:3} value={(profile as any)[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})} placeholder={key==="facts"?"Education, dates, responsibilities, tools, verified results…":""}/>
          :
            <input value={(profile as any)[key]} onChange={e=>setProfile({...profile,[key]:e.target.value})} placeholder={key==="email"?"you@example.com":""}/>
          }
        </label>
      )}
      <button className="primary" onClick={()=>setNotice("Profile saved automatically in this browser.")}>Save profile ✓</button>
    </div>

    <aside className="privacy">
      <h3>Truthful by design</h3>
      <p>The AI can clarify real experience, but must not invent degrees, employers, dates, metrics, or immigration facts.</p>
      <hr/>
      <b>Saved locally</b>
      <small>Profile and tracker</small>
      <hr/>
      <b>Sent to AI on request</b>
      <small>Profile + job description for document generation</small>
      <hr/>
      <b>Not supported</b>
      <small>Auto-submit, CAPTCHA bypass, or fake answers</small>
      <button className="secondary full" onClick={()=>{if(confirm("Clear profile in this browser?"))setProfile(emptyProfile)}}>Clear profile</button>
    </aside>
  </div>
</section>}

<footer>
  <b>JobHunter <span>AI</span></b>
  <small>Apply thoughtfully, not blindly.</small>
  <small>© {new Date().getFullYear()} JobHunter AI</small>
</footer>
</main>
}
