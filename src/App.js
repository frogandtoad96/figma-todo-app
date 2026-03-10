import { useState, useEffect, useRef, useCallback } from 'react';
import { parseMarkdown } from './parseMarkdown';

const TAG_COLORS = {
  'UI 수정':    { bg: '#EEF2FF', text: '#4338CA', dot: '#818CF8', border: '#C7D2FE' },
  '기능 변경':  { bg: '#FFF7ED', text: '#C2410C', dot: '#FB923C', border: '#FED7AA' },
  '텍스트 수정':{ bg: '#F0FDF4', text: '#15803D', dot: '#4ADE80', border: '#BBF7D0' },
};

const DEFAULT_COLOR = { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF', border: '#E5E7EB' };

const SCREENS_KEY = 'figma-screens-v1';
const MEMOS_KEY   = 'figma-memos-v1';

export default function App() {
  const [screens, setScreens]   = useState([]);
  const [memos, setMemos]       = useState({});
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('전체');
  const [selected, setSelected] = useState(null);
  const [editMemo, setEditMemo] = useState('');
  const [saving, setSaving]     = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast]       = useState('');
  const detailRef = useRef(null);
  const fileRef   = useRef(null);

  // 로컬스토리지 로드
  useEffect(() => {
    try {
      const s = localStorage.getItem(SCREENS_KEY);
      const m = localStorage.getItem(MEMOS_KEY);
      if (s) setScreens(JSON.parse(s));
      if (m) setMemos(JSON.parse(m));
    } catch {}
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const persistScreens = (data) => {
    setScreens(data);
    localStorage.setItem(SCREENS_KEY, JSON.stringify(data));
  };

  const persistMemos = (data) => {
    setMemos(data);
    localStorage.setItem(MEMOS_KEY, JSON.stringify(data));
  };

  // 마크다운 파일 로드
  const loadMarkdown = useCallback((text) => {
    const parsed = parseMarkdown(text);
    if (!parsed.length) {
      showToast('❌ 파싱된 화면이 없습니다. 형식을 확인해주세요.');
      return;
    }
    persistScreens(parsed);
    setSelected(null);
    showToast(`✅ ${parsed.length}개 화면이 로드되었습니다!`);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => loadMarkdown(e.target.result);
    reader.readAsText(file, 'utf-8');
  };

  // 드래그앤드롭
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
      handleFile(file);
    } else {
      showToast('❌ .md 또는 .txt 파일을 올려주세요');
    }
  };

  const saveMemo = (id, text) => {
    setSaving(true);
    const updated = { ...memos, [id]: text };
    persistMemos(updated);
    setTimeout(() => {
      setSaving(false);
      showToast('💾 메모 저장됨');
    }, 400);
  };

  const openDetail = (screen) => {
    setSelected(screen);
    setEditMemo(memos[screen.id] || '');
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
    const matchFilter =
      filter === '전체' ||
      (filter === '수정사항 있음' && hasTodos) ||
      (filter === '메모 있음' && hasMemo) ||
      (filter === '수정사항 없음' && !hasTodos);
    return matchSearch && matchFilter;
  });

  const totalTodos = screens.reduce((a, s) => a + Object.values(s.todos).flat().length, 0);
  const totalMemos = Object.values(memos).filter(Boolean).length;

  // ── Empty State ──────────────────────────────────────────────
  if (!screens.length) {
    return (
      <div
        style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8F9FB', gap: 0 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div style={{ width: 560, maxWidth: '90vw' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Figma 수정사항 관리</h1>
            <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
              댓글 수집기에서 내보낸 <strong>.md 파일</strong>을 불러오면<br />화면별로 수정사항과 메모를 관리할 수 있어요.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${dragging ? '#4F46E5' : '#D1D5DB'}`,
              borderRadius: 16,
              padding: '48px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#EEF2FF' : '#fff',
              transition: 'all 0.15s',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>.md 파일을 드래그하거나 클릭해서 열기</div>
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>figma-comment-collector.vercel.app 에서 내보낸 파일</div>
          </div>
          <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />

          {/* 또는 직접 붙여넣기 */}
          <PasteBox onLoad={loadMarkdown} />
        </div>
        {toast && <Toast msg={toast} />}
      </div>
    );
  }

  // ── Main UI ──────────────────────────────────────────────────
  return (
    <div
      style={{ display: 'flex', height: '100vh', background: '#F8F9FB', color: '#1A1A2E', overflow: 'hidden' }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Sidebar */}
      <div style={{ width: 340, minWidth: 340, borderRight: '1px solid #E5E7EB', background: '#fff', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #F3F4F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, background: '#1A1A2E', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>📋</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Figma 수정사항 관리</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{screens.length}개 화면 · {totalTodos}건 · 메모 {totalMemos}개</div>
            </div>
            {/* MD 재업로드 */}
            <button
              title=".md 파일 다시 불러오기"
              onClick={() => fileRef.current.click()}
              style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, color: '#374151', fontWeight: 600 }}
            >
              📂 업로드
            </button>
            <input ref={fileRef} type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files[0])} />
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, fontSize: 13 }}>🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="화면명, ID, 수정내용 검색..."
              style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, outline: 'none', background: '#F9FAFB', boxSizing: 'border-box' }}
            />
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 5, paddingBottom: 10, overflowX: 'auto' }}>
            {['전체', '수정사항 있음', '수정사항 없음', '메모 있음'].map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                borderColor: filter === f ? '#1A1A2E' : '#E5E7EB',
                background: filter === f ? '#1A1A2E' : '#fff',
                color: filter === f ? '#fff' : '#6B7280',
              }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>검색 결과 없음</div>
          ) : (
            filtered.map((screen) => {
              const itemCount = Object.values(screen.todos).flat().length;
              const hasMemo   = !!memos[screen.id];
              const isActive  = selected?.id === screen.id;
              return (
                <div
                  key={screen.id}
                  onClick={() => openDetail(screen)}
                  style={{
                    padding: '11px 14px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                    background: isActive ? '#F0F4FF' : 'transparent',
                    borderLeft: isActive ? '3px solid #4F46E5' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 1 }}>{screen.title}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{screen.id}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      {itemCount > 0 && <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{itemCount}건</span>}
                      {hasMemo   && <span style={{ fontSize: 10, background: '#EDE9FE', color: '#5B21B6', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>📝</span>}
                    </div>
                  </div>
                  {Object.keys(screen.todos).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                      {Object.keys(screen.todos).map((tag) => {
                        const c = TAG_COLORS[tag] || DEFAULT_COLOR;
                        return <span key={tag} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: c.bg, color: c.text, fontWeight: 600 }}>{tag}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail */}
      {selected ? (
        <div ref={detailRef} style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13, marginBottom: 16, padding: 0 }}>
            ← 목록으로
          </button>

          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, letterSpacing: -0.5 }}>{selected.title}</h1>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12 }}>{selected.id}</div>

          {selected.url && (
            <a href={selected.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#1A1A2E', color: '#fff', borderRadius: 8, fontSize: 13, textDecoration: 'none', fontWeight: 600, marginBottom: 24 }}>
              🔗 Figma에서 열기
            </a>
          )}

          {/* Todos */}
          {Object.keys(selected.todos).length > 0 ? (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>수정사항</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(selected.todos).map(([tag, items]) => {
                  const c = TAG_COLORS[tag] || DEFAULT_COLOR;
                  return (
                    <div key={tag} style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ background: c.bg, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{tag}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: c.text, opacity: 0.7 }}>{items.length}건</span>
                      </div>
                      <div style={{ background: '#fff' }}>
                        {items.map((item, i) => (
                          <div key={i} style={{ padding: '9px 14px', fontSize: 13, borderTop: i > 0 ? `1px solid ${c.border}` : undefined, lineHeight: 1.6, color: '#374151' }}>
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
            <div style={{ marginBottom: 24, padding: 16, background: '#F9FAFB', borderRadius: 10, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>수정사항이 없는 화면입니다</div>
          )}

          {/* Memo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: 0 }}>📝 내 메모</h2>
              {saving && <span style={{ fontSize: 11, color: '#4F46E5' }}>저장 중...</span>}
            </div>
            <textarea
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
              placeholder="이 화면에 대한 메모를 자유롭게 작성하세요..."
              style={{ width: '100%', minHeight: 150, padding: 14, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 13, lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => saveMemo(selected.id, editMemo)}
              style={{ marginTop: 8, padding: '9px 20px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              메모 저장
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D1D5DB', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 40 }}>👈</span>
          <span style={{ fontSize: 14 }}>화면을 선택하세요</span>
          <span style={{ fontSize: 12, color: '#E5E7EB' }}>또는 .md 파일을 여기에 드래그</span>
        </div>
      )}

      {dragging && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(79,70,229,0.15)', border: '3px dashed #4F46E5', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#4F46E5', pointerEvents: 'none' }}>
          📂 여기에 놓으면 로드됩니다
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  );
}

// 붙여넣기 박스
function PasteBox({ onLoad }) {
  const [open, setOpen]   = useState(false);
  const [text, setText]   = useState('');

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 13, color: '#6B7280', cursor: 'pointer' }}>
        📋 마크다운 텍스트 직접 붙여넣기
      </button>
    );
  }
  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="댓글 수집기에서 복사한 마크다운을 여기에 붙여넣으세요..."
        style={{ width: '100%', height: 160, padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 12, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onLoad(text)} style={{ flex: 1, padding: '10px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          불러오기
        </button>
        <button onClick={() => setOpen(false)} style={{ padding: '10px 16px', background: '#F3F4F6', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          취소
        </button>
      </div>
    </div>
  );
}

// Toast
function Toast({ msg }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1A1A2E', color: '#fff', padding: '10px 20px', borderRadius: 24, fontSize: 13, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
      {msg}
    </div>
  );
}
