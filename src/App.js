import { useState, useEffect, useRef, useCallback } from "react";

// ── 마크다운 파서 ─────────────────────────────────────────────
function parseMarkdown(md) {
  const screens = [];
  const sections = md.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split("\n").map((l) => l.trim());
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) continue;

    const titleLine = nonEmpty[0];
    let id = "";
    let title = titleLine;

    const slashMatch = titleLine.match(/^(#?[\w\-./:~]+)\s*\/\s*(.+)$/);
    if (slashMatch) {
      id = slashMatch[1].replace(/^#/, "").trim();
      title = slashMatch[2].trim();
    } else {
      id = titleLine.replace(/\s+/g, "-").replace(/[^\w가-힣-]/g, "").slice(0, 40);
      title = titleLine;
    }

    let url = "";
    const urlLine = nonEmpty.find((l) => l.includes("figma.com") || l.startsWith("http"));
    if (urlLine) url = urlLine.replace("🔗", "").trim();

    // 날짜 파싱 (🕐 최근 업데이트: 2026.03.09)
    let updatedAt = null;
    const dateLine = nonEmpty.find((l) => l.includes("🕐") || l.includes("최근 업데이트"));
    if (dateLine) {
      const dateMatch = dateLine.match(/(\d{4})\.(\d{2})\.(\d{2})/);
      if (dateMatch) updatedAt = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
    }

    const todos = {};
    let currentCat = null;

    for (const line of lines) {
      const catMatch = line.match(/^\[(.+)\]$/);
      if (catMatch) {
        currentCat = catMatch[1];
        if (!todos[currentCat]) todos[currentCat] = [];
        continue;
      }
      if (line.startsWith("-") && currentCat) {
        const item = line.replace(/^-+\s*/, "").trim();
        if (item && !item.startsWith("http")) todos[currentCat].push(item);
      }
    }

    if (title) screens.push({ id: id || title, title, url, todos, updatedAt });
  }

  // 최근 업데이트순 정렬
  screens.sort((a, b) => {
    if (!a.updatedAt) return 1;
    if (!b.updatedAt) return -1;
    return b.updatedAt - a.updatedAt;
  });

  return screens;
}

// ── 상수 ─────────────────────────────────────────────────────
const TAG_COLORS = {
  "UI 수정":     { bg: "#EEF2FF", text: "#4338CA", dot: "#818CF8", border: "#C7D2FE" },
  "기능 변경":   { bg: "#FFF7ED", text: "#C2410C", dot: "#FB923C", border: "#FED7AA" },
  "텍스트 수정": { bg: "#F0FDF4", text: "#15803D", dot: "#4ADE80", border: "#BBF7D0" },
};
const DEF_C = { bg: "#F3F4F6", text: "#374151", dot: "#9CA3AF", border: "#E5E7EB" };
const SCREENS_KEY = "figma-screens-v2";
const MEMOS_KEY   = "figma-memos-v1";

// ── 메인 앱 ──────────────────────────────────────────────────
export default function App() {
  const [screens, setScreens]   = useState([]);
  const [memos, setMemos]       = useState({});
  const [search, setSearch]     = useState("");
  const [filter, setFilter]     = useState("전체");
  const [selected, setSelected] = useState(null);
  const [editMemo, setEditMemo] = useState("");
  const [saving, setSaving]     = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast]       = useState("");
  const [loaded, setLoaded]     = useState(false);
  const detailRef = useRef(null);
  const fileRef   = useRef(null);

  // storage 로드
  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get(SCREENS_KEY);
        const m = await window.storage.get(MEMOS_KEY);
        if (s) setScreens(JSON.parse(s.value));
        if (m) setMemos(JSON.parse(m.value));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const persistScreens = async (data) => {
    setScreens(data);
    try { await window.storage.set(SCREENS_KEY, JSON.stringify(data)); } catch {}
  };
  const persistMemos = async (data) => {
    setMemos(data);
    try { await window.storage.set(MEMOS_KEY, JSON.stringify(data)); } catch {}
  };

  const loadMarkdown = useCallback(async (text) => {
    const parsed = parseMarkdown(text);
    if (!parsed.length) { showToast("❌ 파싱된 화면이 없습니다. 형식을 확인해주세요."); return; }
    await persistScreens(parsed);
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

  const saveMemo = async (id, text) => {
    setSaving(true);
    const updated = { ...memos, [id]: text };
    await persistMemos(updated);
    setSaving(false);
    showToast("💾 메모 저장됨");
  };

  const openDetail = (screen) => {
    setSelected(screen);
    setEditMemo(memos[screen.id] || "");
    setTimeout(() => detailRef.current?.scrollTo({ top: 0 }), 50);
  };

  const filtered = screens.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      s.title.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      Object.values(s.todos).flat().some((t) => t.toLowerCase().includes(q));
    const hasTodos = Object.values(s.todos).flat().length > 0;
    const hasMemo  = !!memos[s.id];
    return matchSearch && (
      filter === "전체" ||
      (filter === "수정사항 있음"  && hasTodos) ||
      (filter === "메모 있음"      && hasMemo) ||
      (filter === "수정사항 없음"  && !hasTodos)
    );
  });

  const totalTodos = screens.reduce((a, s) => a + Object.values(s.todos).flat().length, 0);
  const totalMemos = Object.values(memos).filter(Boolean).length;

  // ── Empty State ──────────────────────────────────────────────
  if (loaded && !screens.length) {
    return (
      <div
        style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F8F9FB", padding: 24 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div style={{ width: 520, maxWidth: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📋</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, fontFamily: "sans-serif" }}>Figma 수정사항 관리</h1>
            <p style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.7, fontFamily: "sans-serif" }}>
              <a href="https://figma-comment-collector.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "#4F46E5", fontWeight: 600 }}>댓글 수집기</a>에서 내보낸{" "}
              <code style={{ background: "#EEF2FF", padding: "1px 6px", borderRadius: 4, color: "#4338CA" }}>.md 파일</code>을 업로드하면<br />
              화면별로 수정사항과 메모를 관리할 수 있어요.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragging ? "#4F46E5" : "#D1D5DB"}`,
              borderRadius: 14, padding: "44px 32px", textAlign: "center", cursor: "pointer",
              background: dragging ? "#EEF2FF" : "#fff", transition: "all 0.15s", marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 34, marginBottom: 8 }}>📂</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, fontFamily: "sans-serif" }}>.md 파일을 드래그하거나 클릭해서 열기</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "sans-serif" }}>figma-comment-collector.vercel.app 에서 내보낸 파일</div>
          </div>
          <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />

          <PasteBox onLoad={loadMarkdown} />
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────
  if (!loaded) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontFamily: "sans-serif" }}>불러오는 중...</div>;
  }

  // ── Main ─────────────────────────────────────────────────────
  return (
    <div
      style={{ display: "flex", height: "100vh", background: "#F8F9FB", overflow: "hidden", fontFamily: "'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* ── Sidebar ── */}
      <div style={{ width: selected ? 320 : "100%", minWidth: selected ? 320 : undefined, borderRight: "1px solid #E5E7EB", background: "#fff", display: "flex", flexDirection: "column", transition: "width 0.2s" }}>
        {/* Header */}
        <div style={{ padding: "14px 14px 0", borderBottom: "1px solid #F3F4F6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, background: "#1A1A2E", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15 }}>📋</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Figma 수정사항 관리</div>
              <div style={{ fontSize: 10, color: "#9CA3AF" }}>{screens.length}개 화면 · {totalTodos}건 · 메모 {totalMemos}개</div>
            </div>
            <button
              title=".md 파일 다시 불러오기"
              onClick={() => fileRef.current.click()}
              style={{ background: "#F3F4F6", border: "none", borderRadius: 6, padding: "5px 9px", cursor: "pointer", fontSize: 11, color: "#374151", fontWeight: 600, whiteSpace: "nowrap" }}
            >📂 업로드</button>
            <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
          </div>

          <div style={{ position: "relative", marginBottom: 7 }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", opacity: 0.35, fontSize: 12 }}>🔍</span>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="화면명, ID, 수정내용 검색..."
              style={{ width: "100%", padding: "7px 10px 7px 28px", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 12, outline: "none", background: "#F9FAFB", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ display: "flex", gap: 5, paddingBottom: 10, overflowX: "auto" }}>
            {["전체", "수정사항 있음", "수정사항 없음", "메모 있음"].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "3px 9px", borderRadius: 20, border: "1px solid", fontSize: 10, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                borderColor: filter === f ? "#1A1A2E" : "#E5E7EB",
                background: filter === f ? "#1A1A2E" : "#fff",
                color: filter === f ? "#fff" : "#6B7280",
              }}>{f}</button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0
            ? <div style={{ padding: 30, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>검색 결과 없음</div>
            : filtered.map((screen) => {
              const itemCount = Object.values(screen.todos).flat().length;
              const hasMemo   = !!memos[screen.id];
              const isActive  = selected?.id === screen.id;
              return (
                <div
                  key={screen.id} onClick={() => openDetail(screen)}
                  style={{ padding: "10px 13px", borderBottom: "1px solid #F3F4F6", cursor: "pointer", background: isActive ? "#F0F4FF" : "transparent", borderLeft: isActive ? "3px solid #4F46E5" : "3px solid transparent" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 1 }}>{screen.title}</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{screen.id}</div>
                      {screen.updatedAt && (
                        <div style={{ fontSize: 10, color: "#A78BFA", marginTop: 1 }}>
                          🕐 {screen.updatedAt.toLocaleDateString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                      {itemCount > 0 && <span style={{ fontSize: 9, background: "#FEF3C7", color: "#92400E", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>{itemCount}건</span>}
                      {hasMemo      && <span style={{ fontSize: 9, background: "#EDE9FE", color: "#5B21B6", padding: "1px 5px", borderRadius: 8, fontWeight: 700 }}>📝</span>}
                    </div>
                  </div>
                  {Object.keys(screen.todos).length > 0 && (
                    <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                      {Object.keys(screen.todos).map((tag) => {
                        const c = TAG_COLORS[tag] || DEF_C;
                        return <span key={tag} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: c.bg, color: c.text, fontWeight: 600 }}>{tag}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      </div>

      {/* ── Detail ── */}
      {selected && (
        <div ref={detailRef} style={{ flex: 1, overflowY: "auto", padding: 24, minWidth: 0 }}>
          <button onClick={() => setSelected(null)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 12, marginBottom: 14, padding: 0 }}>
            ← 목록으로
          </button>

          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 3, letterSpacing: -0.3 }}>{selected.title}</h1>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{selected.id}</div>
          {selected.updatedAt && (
            <div style={{ fontSize: 11, color: "#A78BFA", marginBottom: 12 }}>
              🕐 최근 업데이트: {selected.updatedAt.toLocaleDateString("ko-KR", { year:"numeric", month:"2-digit", day:"2-digit" })}
            </div>
          )}

          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", background: "#1A1A2E", color: "#fff", borderRadius: 7, fontSize: 12, textDecoration: "none", fontWeight: 600, marginBottom: 20 }}>
              🔗 Figma에서 열기
            </a>
          )}

          {Object.keys(selected.todos).length > 0 ? (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10 }}>수정사항</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(selected.todos).map(([tag, items]) => {
                  const c = TAG_COLORS[tag] || DEF_C;
                  return (
                    <div key={tag} style={{ border: `1px solid ${c.border}`, borderRadius: 9, overflow: "hidden" }}>
                      <div style={{ background: c.bg, padding: "7px 12px", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>{tag}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: c.text, opacity: 0.7 }}>{items.length}건</span>
                      </div>
                      <div style={{ background: "#fff" }}>
                        {items.map((item, i) => (
                          <div key={i} style={{ padding: "8px 12px", fontSize: 12, borderTop: i > 0 ? `1px solid ${c.border}` : undefined, lineHeight: 1.6, color: "#374151" }}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 20, padding: 14, background: "#F9FAFB", borderRadius: 9, fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>수정사항이 없는 화면입니다</div>
          )}

          {/* Memo */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: 0 }}>📝 내 메모</h2>
              {saving && <span style={{ fontSize: 10, color: "#4F46E5" }}>저장 중...</span>}
            </div>
            <textarea
              value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
              placeholder="이 화면에 대한 메모를 자유롭게 작성하세요..."
              style={{ width: "100%", minHeight: 130, padding: 12, border: "1px solid #E5E7EB", borderRadius: 9, fontSize: 12, lineHeight: 1.7, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            />
            <button
              onClick={() => saveMemo(selected.id, editMemo)}
              style={{ marginTop: 7, padding: "8px 18px", background: "#4F46E5", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              메모 저장
            </button>
          </div>
        </div>
      )}

      {dragging && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(79,70,229,0.15)", border: "3px dashed #4F46E5", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#4F46E5", pointerEvents: "none" }}>
          📂 여기에 놓으면 로드됩니다
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

function PasteBox({ onLoad }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ width: "100%", padding: "10px", background: "none", border: "1px solid #E5E7EB", borderRadius: 9, fontSize: 12, color: "#6B7280", cursor: "pointer", fontFamily: "sans-serif" }}>
      📋 마크다운 텍스트 직접 붙여넣기
    </button>
  );
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="댓글 수집기에서 복사한 마크다운을 여기에 붙여넣으세요..."
        style={{ width: "100%", height: 150, padding: 11, border: "1px solid #E5E7EB", borderRadius: 9, fontSize: 12, lineHeight: 1.6, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
      <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
        <button onClick={() => onLoad(text)} style={{ flex: 1, padding: "9px", background: "#4F46E5", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>불러오기</button>
        <button onClick={() => setOpen(false)} style={{ padding: "9px 14px", background: "#F3F4F6", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>취소</button>
      </div>
    </div>
  );
}

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#1A1A2E", color: "#fff", padding: "9px 18px", borderRadius: 22, fontSize: 12, fontWeight: 600, zIndex: 9999, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
      {msg}
    </div>
  );
}
