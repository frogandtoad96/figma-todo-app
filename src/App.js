import { useState, useEffect, useRef, useCallback } from "react";

function parseMarkdown(md) {
  const screens = [];
  const sections = md.split(/^## /m).filter(Boolean);
  for (const section of sections) {
    const lines = section.split("\n").map((l) => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) continue;
    const titleLine = nonEmpty[0];
    let id = "", title = titleLine;
    const slashMatch = titleLine.match(/^(#?[\w\-./:~]+)\s*\/\s*(.+)$/);
    if (slashMatch) { id = slashMatch[1].replace(/^#/, "").trim(); title = slashMatch[2].trim(); }
    else { id = titleLine.replace(/\s+/g, "-").replace(/[^\w가-힣-]/g, "").slice(0, 40); }
    let url = "";
    const urlLine = nonEmpty.find((l) => l.includes("figma.com") || l.startsWith("http"));
    if (urlLine) url = urlLine.replace("🔗", "").trim();
    let updatedAt = null;
    const dateLine = nonEmpty.find((l) => l.includes("🕐") || l.includes("최근 업데이트"));
    if (dateLine) { const m = dateLine.match(/(\d{4})\.(\d{2})\.(\d{2})/); if (m) updatedAt = new Date(`${m[1]}-${m[2]}-${m[3]}`); }
    let nodeId = null;
    if (url) { const nm = url.match(/node-id=([^&]+)/); if (nm) nodeId = decodeURIComponent(nm[1]); }
    let fileKey = null;
    if (url) { const fm = url.match(/figma\.com\/(?:file|design)\/([^/?]+)/); if (fm) fileKey = fm[1]; }
    const todos = {};
    let currentCat = null;
    for (const line of lines) {
      const catMatch = line.match(/^\[(.+)\]$/);
      if (catMatch) { currentCat = catMatch[1]; if (!todos[currentCat]) todos[currentCat] = []; continue; }
      if (line.startsWith("-") && currentCat) {
        const item = line.replace(/^-+\s*/, "").trim();
        if (item && !item.startsWith("http")) todos[currentCat].push(item);
      }
    }
    if (title) screens.push({ id: id || title, title, url, todos, updatedAt, nodeId, fileKey });
  }
  screens.sort((a, b) => { if (!a.updatedAt) return 1; if (!b.updatedAt) return -1; return b.updatedAt - a.updatedAt; });
  return screens;
}

const TAG_COLORS = {
  "UI 수정":     { bg: "#EEF2FF", text: "#4338CA", dot: "#818CF8", border: "#C7D2FE" },
  "기능 변경":   { bg: "#FFF7ED", text: "#C2410C", dot: "#FB923C", border: "#FED7AA" },
  "텍스트 수정": { bg: "#F0FDF4", text: "#15803D", dot: "#4ADE80", border: "#BBF7D0" },
};
const DEF_C = { bg: "#F3F4F6", text: "#374151", dot: "#9CA3AF", border: "#E5E7EB" };
const SCREENS_KEY  = "figma-screens-v2";
const MEMOS_KEY    = "figma-memos-v1";
const DONE_KEY     = "figma-done-v1";
const TOKEN_KEY    = "figma-token-v1";
const FILEKEY_KEY  = "figma-filekey-v1";

function isToday(d) { if (!d) return false; return d.toDateString() === new Date().toDateString(); }
function isThisWeek(d) { if (!d) return false; const n = new Date(), s = new Date(n); s.setDate(n.getDate()-n.getDay()); s.setHours(0,0,0,0); return d >= s; }
function isThisMonth(d) { if (!d) return false; const n = new Date(); return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth(); }

export default function App() {
  const [screens, setScreens]         = useState([]);
  const [memos, setMemos]             = useState({});
  const [done, setDone]               = useState({});
  const [figmaToken, setFigmaToken]   = useState("");
  const [figmaFileKey, setFigmaFileKey] = useState("");
  const [collecting, setCollecting]   = useState(false);
  const [search, setSearch]           = useState("");
  const [catFilter, setCatFilter]     = useState("전체");
  const [dateFilter, setDateFilter]   = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selected, setSelected]       = useState(null);
  const [editMemo, setEditMemo]       = useState("");
  const [dragging, setDragging]       = useState(false);
  const [toast, setToast]             = useState("");
  const [loaded, setLoaded]           = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [replyText, setReplyText]     = useState("");
  const [replying, setReplying]       = useState(false);
  const detailRef = useRef(null);
  const fileRef   = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const s = localStorage.getItem(SCREENS_KEY);
        const m = localStorage.getItem(MEMOS_KEY);
        const d = localStorage.getItem(DONE_KEY);
        const t = localStorage.getItem(TOKEN_KEY);
        const fk = localStorage.getItem(FILEKEY_KEY);
        if (s) setScreens(JSON.parse(s).map(sc => ({ ...sc, updatedAt: sc.updatedAt ? new Date(sc.updatedAt) : null })));
        if (m) setMemos(JSON.parse(m));
        if (d) setDone(JSON.parse(d));
        if (t) setFigmaToken(t);
        if (fk) setFigmaFileKey(fk);
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2800); };
  const persist = (key, setter, data) => {
    setter(data);
    try { localStorage.setItem(key, key===TOKEN_KEY||key===FILEKEY_KEY ? data : JSON.stringify(data)); } catch {}
  };

  // 피그마 댓글 수집 (figma-comment-collector API 호출)
  const collectFromFigma = async () => {
    if (!figmaToken) { showToast("❌ 토큰을 먼저 입력해주세요"); setShowSettings(true); return; }
    if (!figmaFileKey) { showToast("❌ 파일 키를 먼저 입력해주세요"); setShowSettings(true); return; }
    setCollecting(true);
    try {
      const res = await fetch("https://figma-comment-collector.vercel.app/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: figmaToken, fileKey: figmaFileKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수집 실패");
      const parsed = parseMarkdown(data.figmaTodo || "");
      if (!parsed.length) { showToast("❌ 수정사항이 없거나 파싱에 실패했어요"); return; }
      persist(SCREENS_KEY, setScreens, parsed);
      setSelected(null);
      setShowSettings(false);
      showToast(`✅ ${parsed.length}개 화면 수집 완료!`);
    } catch (e) {
      showToast(`❌ ${e.message}`);
    }
    setCollecting(false);
  };

  const loadMarkdown = useCallback(async (text) => {
    const parsed = parseMarkdown(text);
    if (!parsed.length) { showToast("❌ 파싱된 화면이 없습니다."); return; }
    persist(SCREENS_KEY, setScreens, parsed);
    setSelected(null);
    showToast(`✅ ${parsed.length}개 화면이 로드되었습니다!`);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => loadMarkdown(e.target.result);
    reader.readAsText(file, "utf-8");
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".md") || file.name.endsWith(".txt"))) handleFile(file);
    else showToast("❌ .md 또는 .txt 파일을 올려주세요");
  };

  const toggleDone = (screenId, tag, item) => {
    const key = `${tag}::${item}`;
    const prev = done[screenId] || {};
    persist(DONE_KEY, setDone, { ...done, [screenId]: { ...prev, [key]: !prev[key] } });
  };

  const isDone = (screenId, tag, item) => !!(done[screenId]?.[`${tag}::${item}`]);

  const getDoneRatio = (screen) => {
    const items = Object.entries(screen.todos).flatMap(([tag, arr]) => arr.map(item => isDone(screen.id, tag, item)));
    if (!items.length) return null;
    return { done: items.filter(Boolean).length, total: items.length };
  };

  const postFigmaReply = async () => {
    if (!replyText.trim()) return;
    if (!figmaToken) { setShowSettings(true); return; }
    if (!selected?.fileKey) { showToast("❌ 파일 키를 찾을 수 없어요"); return; }
    setReplying(true);
    try {
      const res = await fetch("https://figma-comment-collector.vercel.app/api/post-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: figmaToken, fileKey: selected.fileKey, message: replyText, nodeId: selected.nodeId }),
      });
      if (!res.ok) throw new Error();
      setReplyText("");
      showToast("✅ 피그마에 댓글이 달렸어요!");
    } catch { showToast("❌ 실패 — 토큰을 확인해주세요"); }
    setReplying(false);
  };

  const openDetail = (screen) => {
    setSelected(screen); setEditMemo(memos[screen.id] || ""); setReplyText("");
    setTimeout(() => detailRef.current?.scrollTo({ top: 0 }), 50);
  };

  const filtered = screens.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) ||
      Object.values(s.todos).flat().some((t) => t.toLowerCase().includes(q));
    const matchCat  = catFilter === "전체" || Object.keys(s.todos).includes(catFilter);
    const matchDate = dateFilter === "전체" || (dateFilter==="오늘"&&isToday(s.updatedAt)) || (dateFilter==="이번주"&&isThisWeek(s.updatedAt)) || (dateFilter==="이번달"&&isThisMonth(s.updatedAt));
    const r = getDoneRatio(s);
    const matchStatus = statusFilter === "전체" || (statusFilter==="미완료"&&r&&r.done<r.total) || (statusFilter==="완료"&&r&&r.done===r.total);
    return matchSearch && matchCat && matchDate && matchStatus;
  });

  const totalTodos = screens.reduce((a, s) => a + Object.values(s.todos).flat().length, 0);
  const totalMemos = Object.values(memos).filter(Boolean).length;

  // ── Empty State ──────────────────────────────────────────────
  if (loaded && !screens.length) {
    return (
      <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#F8F9FB", padding:24 }}
        onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}>
        <div style={{ width:480, maxWidth:"100%" }}>
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:44, marginBottom:10 }}>📋</div>
            <h1 style={{ fontSize:20, fontWeight:700, marginBottom:6, fontFamily:"sans-serif" }}>Figma 수정사항 관리</h1>
            <p style={{ color:"#6B7280", fontSize:13, lineHeight:1.7, fontFamily:"sans-serif" }}>토큰과 파일 키로 바로 수집하거나 md 파일을 업로드하세요</p>
          </div>

          {/* 직접 수집 */}
          <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:20, marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:"#1A1A2E" }}>🔗 피그마에서 바로 수집</div>
            <input type="password" value={figmaToken} onChange={(e)=>setFigmaToken(e.target.value)}
              placeholder="Figma Token (figd_...)"
              style={{ width:"100%", padding:"9px 12px", border:"1px solid #E5E7EB", borderRadius:7, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
            <input type="text" value={figmaFileKey} onChange={(e)=>setFigmaFileKey(e.target.value)}
              placeholder="Figma File Key (예: AOhCPSGtZS7AUuEXp3L721)"
              style={{ width:"100%", padding:"9px 12px", border:"1px solid #E5E7EB", borderRadius:7, fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:12 }} />
            <button onClick={collectFromFigma} disabled={collecting}
              style={{ width:"100%", padding:"10px", background:collecting?"#9CA3AF":"#1A1A2E", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:collecting?"default":"pointer" }}>
              {collecting ? "⏳ 수집 중..." : "🚀 댓글 수집 시작"}
            </button>
          </div>

          <div style={{ textAlign:"center", fontSize:11, color:"#9CA3AF", marginBottom:12 }}>또는</div>

          {/* 파일 업로드 */}
          <div onClick={()=>fileRef.current.click()} style={{ border:`2px dashed ${dragging?"#4F46E5":"#D1D5DB"}`, borderRadius:12, padding:"28px 20px", textAlign:"center", cursor:"pointer", background:dragging?"#EEF2FF":"#fff", marginBottom:8 }}>
            <div style={{ fontSize:28, marginBottom:6 }}>📂</div>
            <div style={{ fontWeight:600, fontSize:13, fontFamily:"sans-serif" }}>.md 파일 드래그 또는 클릭</div>
          </div>
          <input ref={fileRef} type="file" accept=".md,.txt" style={{ display:"none" }} onChange={(e)=>handleFile(e.target.files[0])} />
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  if (!loaded) return <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#9CA3AF" }}>불러오는 중...</div>;

  return (
    <div style={{ display:"flex", height:"100vh", background:"#F8F9FB", overflow:"hidden", fontFamily:"'Apple SD Gothic Neo','Malgun Gothic',sans-serif" }}
      onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}>

      {/* Sidebar */}
      <div style={{ width:selected?320:"100%", minWidth:selected?320:undefined, borderRight:"1px solid #E5E7EB", background:"#fff", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"12px 12px 0", borderBottom:"1px solid #F3F4F6" }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <div style={{ width:28, height:28, background:"#1A1A2E", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>📋</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:12 }}>Figma 수정사항 관리</div>
              <div style={{ fontSize:10, color:"#9CA3AF" }}>{screens.length}개 화면 · {totalTodos}건 · 메모 {totalMemos}개</div>
            </div>
            <button onClick={()=>setShowSettings(v=>!v)} title="설정"
              style={{ background:showSettings?"#EEF2FF":"#F3F4F6", border:"none", borderRadius:6, padding:"4px 7px", cursor:"pointer", fontSize:10, color:showSettings?"#4F46E5":"#374151", fontWeight:600 }}>⚙️ 설정</button>
            <button onClick={()=>fileRef.current.click()} style={{ background:"#F3F4F6", border:"none", borderRadius:6, padding:"4px 7px", cursor:"pointer", fontSize:10, color:"#374151", fontWeight:600 }}>📂</button>
            <input ref={fileRef} type="file" accept=".md,.txt" style={{ display:"none" }} onChange={(e)=>handleFile(e.target.files[0])} />
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div style={{ marginBottom:10, padding:10, background:"#F9FAFB", borderRadius:8, border:"1px solid #E5E7EB" }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:8 }}>피그마 연결 설정</div>
              <input type="password" value={figmaToken} onChange={(e)=>setFigmaToken(e.target.value)} placeholder="Figma Token (figd_...)"
                style={{ width:"100%", padding:"6px 8px", border:"1px solid #E5E7EB", borderRadius:6, fontSize:11, outline:"none", boxSizing:"border-box", marginBottom:6 }} />
              <input type="text" value={figmaFileKey} onChange={(e)=>setFigmaFileKey(e.target.value)} placeholder="Figma File Key"
                style={{ width:"100%", padding:"6px 8px", border:"1px solid #E5E7EB", borderRadius:6, fontSize:11, outline:"none", boxSizing:"border-box", marginBottom:8 }} />
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>{ localStorage.setItem(TOKEN_KEY,figmaToken); localStorage.setItem(FILEKEY_KEY,figmaFileKey); showToast("💾 저장됨"); }}
                  style={{ flex:1, padding:"6px", background:"#4F46E5", color:"#fff", border:"none", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer" }}>저장</button>
                <button onClick={collectFromFigma} disabled={collecting}
                  style={{ flex:1, padding:"6px", background:collecting?"#9CA3AF":"#1A1A2E", color:"#fff", border:"none", borderRadius:6, fontSize:11, fontWeight:700, cursor:collecting?"default":"pointer" }}>
                  {collecting?"수집 중...":"🚀 다시 수집"}
                </button>
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ position:"relative", marginBottom:8 }}>
            <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", opacity:0.35, fontSize:11 }}>🔍</span>
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="화면명, ID, 수정내용 검색..."
              style={{ width:"100%", padding:"6px 8px 6px 26px", border:"1px solid #E5E7EB", borderRadius:7, fontSize:11, outline:"none", background:"#F9FAFB", boxSizing:"border-box" }} />
          </div>

          {/* 카테고리 */}
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:9, color:"#9CA3AF", fontWeight:700, marginBottom:3 }}>카테고리</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {["전체","UI 수정","기능 변경","텍스트 수정"].map((f) => {
                const c = TAG_COLORS[f]; const active = catFilter===f;
                return <button key={f} onClick={()=>setCatFilter(f)} style={{ padding:"3px 8px", borderRadius:20, border:"1px solid", fontSize:10, fontWeight:600, cursor:"pointer", borderColor:active?(c?c.dot:"#1A1A2E"):"#E5E7EB", background:active?(c?c.bg:"#1A1A2E"):"#fff", color:active?(c?c.text:"#fff"):"#6B7280" }}>{f}</button>;
              })}
            </div>
          </div>

          {/* 날짜 */}
          <div style={{ marginBottom:6 }}>
            <div style={{ fontSize:9, color:"#9CA3AF", fontWeight:700, marginBottom:3 }}>기간</div>
            <div style={{ display:"flex", gap:4 }}>
              {["전체","오늘","이번주","이번달"].map((f) => (
                <button key={f} onClick={()=>setDateFilter(f)} style={{ padding:"3px 8px", borderRadius:20, border:"1px solid", fontSize:10, fontWeight:600, cursor:"pointer", borderColor:dateFilter===f?"#1A1A2E":"#E5E7EB", background:dateFilter===f?"#1A1A2E":"#fff", color:dateFilter===f?"#fff":"#6B7280" }}>{f}</button>
              ))}
            </div>
          </div>

          {/* 상태 */}
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:9, color:"#9CA3AF", fontWeight:700, marginBottom:3 }}>진행상태</div>
            <div style={{ display:"flex", gap:4 }}>
              {["전체","미완료","완료"].map((f) => (
                <button key={f} onClick={()=>setStatusFilter(f)} style={{ padding:"3px 8px", borderRadius:20, border:"1px solid", fontSize:10, fontWeight:600, cursor:"pointer", borderColor:statusFilter===f?"#1A1A2E":"#E5E7EB", background:statusFilter===f?"#1A1A2E":"#fff", color:statusFilter===f?"#fff":"#6B7280" }}>{f}</button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {filtered.length===0
            ? <div style={{ padding:30, textAlign:"center", color:"#9CA3AF", fontSize:13 }}>검색 결과 없음</div>
            : filtered.map((screen) => {
              const isActive = selected?.id===screen.id;
              const ratio    = getDoneRatio(screen);
              const allDone  = ratio && ratio.done===ratio.total;
              return (
                <div key={screen.id} onClick={()=>openDetail(screen)} style={{ padding:"9px 12px", borderBottom:"1px solid #F3F4F6", cursor:"pointer", background:isActive?"#F0F4FF":allDone?"#F0FDF4":"transparent", borderLeft:isActive?"3px solid #4F46E5":allDone?"3px solid #4ADE80":"3px solid transparent" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:5 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration:allDone?"line-through":"none", color:allDone?"#9CA3AF":"#1A1A2E" }}>{screen.title}</div>
                      <div style={{ fontSize:10, color:"#9CA3AF", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{screen.id}</div>
                      {screen.updatedAt && <div style={{ fontSize:9, color:"#A78BFA", marginTop:1 }}>🕐 {screen.updatedAt.toLocaleDateString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"})}</div>}
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                      {ratio && <span style={{ fontSize:9, background:allDone?"#DCFCE7":"#FEF3C7", color:allDone?"#15803D":"#92400E", padding:"1px 5px", borderRadius:8, fontWeight:700 }}>{ratio.done}/{ratio.total}</span>}
                      {!!memos[screen.id] && <span style={{ fontSize:9, background:"#EDE9FE", color:"#5B21B6", padding:"1px 5px", borderRadius:8, fontWeight:700 }}>📝</span>}
                    </div>
                  </div>
                  {Object.keys(screen.todos).length>0 && (
                    <div style={{ display:"flex", gap:3, marginTop:4, flexWrap:"wrap" }}>
                      {Object.keys(screen.todos).map((tag)=>{ const c=TAG_COLORS[tag]||DEF_C; return <span key={tag} style={{ fontSize:9, padding:"1px 5px", borderRadius:6, background:c.bg, color:c.text, fontWeight:600 }}>{tag}</span>; })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Detail */}
      {selected && (
        <div ref={detailRef} style={{ flex:1, overflowY:"auto", padding:22, minWidth:0 }}>
          <button onClick={()=>setSelected(null)} style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", color:"#6B7280", fontSize:12, marginBottom:12, padding:0 }}>← 목록으로</button>
          <h1 style={{ fontSize:17, fontWeight:700, marginBottom:3, letterSpacing:-0.3 }}>{selected.title}</h1>
          <div style={{ fontSize:10, color:"#9CA3AF", marginBottom:3 }}>{selected.id}</div>
          {selected.updatedAt && <div style={{ fontSize:11, color:"#A78BFA", marginBottom:10 }}>🕐 최근 업데이트: {selected.updatedAt.toLocaleDateString("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit"})}</div>}
          {selected.url && <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 12px", background:"#1A1A2E", color:"#fff", borderRadius:7, fontSize:12, textDecoration:"none", fontWeight:600, marginBottom:16 }}>🔗 Figma에서 열기</a>}

          {/* 진행률 */}
          {(() => { const r=getDoneRatio(selected); if(!r) return null; const pct=Math.round(r.done/r.total*100); return (
            <div style={{ marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                <span style={{ fontWeight:600 }}>진행률</span>
                <span style={{ color:pct===100?"#15803D":"#6B7280", fontWeight:700 }}>{r.done}/{r.total} ({pct}%)</span>
              </div>
              <div style={{ height:6, background:"#E5E7EB", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:pct===100?"#4ADE80":"#818CF8", borderRadius:99, transition:"width 0.3s" }} />
              </div>
            </div>
          ); })()}

          {/* 수정사항 */}
          {Object.keys(selected.todos).length>0 ? (
            <div style={{ marginBottom:20 }}>
              <h2 style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>수정사항</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {Object.entries(selected.todos).map(([tag,items])=>{ const c=TAG_COLORS[tag]||DEF_C; return (
                  <div key={tag} style={{ border:`1px solid ${c.border}`, borderRadius:9, overflow:"hidden" }}>
                    <div style={{ background:c.bg, padding:"6px 12px", display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ width:6, height:6, borderRadius:"50%", background:c.dot, flexShrink:0 }} />
                      <span style={{ fontSize:11, fontWeight:700, color:c.text }}>{tag}</span>
                      <span style={{ marginLeft:"auto", fontSize:10, color:c.text, opacity:0.7 }}>{items.length}건</span>
                    </div>
                    <div style={{ background:"#fff" }}>
                      {items.map((item,i)=>{ const checked=isDone(selected.id,tag,item); return (
                        <div key={i} onClick={()=>toggleDone(selected.id,tag,item)} style={{ padding:"8px 12px", fontSize:12, borderTop:i>0?`1px solid ${c.border}`:undefined, lineHeight:1.6, color:checked?"#9CA3AF":"#374151", display:"flex", alignItems:"flex-start", gap:8, cursor:"pointer", textDecoration:checked?"line-through":"none", background:checked?"#FAFAFA":"#fff" }}>
                          <span style={{ fontSize:14, flexShrink:0 }}>{checked?"✅":"⬜"}</span>{item}
                        </div>
                      ); })}
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          ) : <div style={{ marginBottom:18, padding:14, background:"#F9FAFB", borderRadius:9, fontSize:12, color:"#9CA3AF", textAlign:"center" }}>수정사항이 없는 화면입니다</div>}

          {/* 피그마 댓글 */}
          <div style={{ marginBottom:20, border:"1px solid #FED7AA", borderRadius:9, overflow:"hidden" }}>
            <div style={{ background:"#FFF7ED", padding:"7px 12px", display:"flex", alignItems:"center", gap:5 }}>
              <span>💬</span>
              <span style={{ fontSize:12, fontWeight:700, color:"#C2410C" }}>피그마에 댓글 달기</span>
            </div>
            <div style={{ padding:10, background:"#fff" }}>
              <textarea value={replyText} onChange={(e)=>setReplyText(e.target.value)} placeholder="피그마에 달릴 댓글 내용을 입력하세요..."
                style={{ width:"100%", minHeight:80, padding:10, border:"1px solid #E5E7EB", borderRadius:7, fontSize:12, lineHeight:1.6, resize:"vertical", outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
              <button onClick={postFigmaReply} disabled={replying||!replyText.trim()} style={{ marginTop:6, padding:"7px 16px", background:replying||!replyText.trim()?"#E5E7EB":"#F97316", color:replying||!replyText.trim()?"#9CA3AF":"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:replying||!replyText.trim()?"default":"pointer" }}>
                {replying?"전송 중...":"💬 피그마에 달기"}
              </button>
            </div>
          </div>

          {/* 메모 */}
          <div>
            <h2 style={{ fontSize:13, fontWeight:700, marginBottom:7 }}>📝 내 메모</h2>
            <textarea value={editMemo} onChange={(e)=>setEditMemo(e.target.value)} placeholder="이 화면에 대한 메모..."
              style={{ width:"100%", minHeight:110, padding:12, border:"1px solid #E5E7EB", borderRadius:9, fontSize:12, lineHeight:1.7, resize:"vertical", outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
            <button onClick={()=>{ persist(MEMOS_KEY, setMemos, {...memos,[selected.id]:editMemo}); showToast("💾 메모 저장됨"); }}
              style={{ marginTop:7, padding:"7px 16px", background:"#4F46E5", color:"#fff", border:"none", borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer" }}>메모 저장</button>
          </div>
        </div>
      )}

      {dragging && <div style={{ position:"fixed", inset:0, background:"rgba(79,70,229,0.15)", border:"3px dashed #4F46E5", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#4F46E5", pointerEvents:"none" }}>📂 여기에 놓으면 로드됩니다</div>}
      {toast && <Toast msg={toast} />}
    </div>
  );
}

function Toast({ msg }) {
  return <div style={{ position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:"#1A1A2E", color:"#fff", padding:"9px 18px", borderRadius:22, fontSize:12, fontWeight:600, zIndex:9999, whiteSpace:"nowrap", boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>{msg}</div>;
}
