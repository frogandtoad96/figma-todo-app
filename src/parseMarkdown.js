/**
 * 댓글 수집기에서 내보낸 마크다운을 파싱해서
 * 앱에서 쓰는 SCREENS 배열 형태로 변환
 *
 * 예상 형식:
 * ## 화면ID / 화면명
 * 🔗 https://...
 *
 * [카테고리]
 * - 내용1
 * - 내용2
 */
export function parseMarkdown(md) {
  const screens = [];
  // ## 기준으로 섹션 분리
  const sections = md.split(/^## /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // 첫 줄: 제목 (ID / 화면명 형식 또는 그냥 화면명)
    const titleLine = lines[0];
    let id = '';
    let title = titleLine;

    // ID / 제목 분리 시도
    const slashMatch = titleLine.match(/^(#?[\w\-.:~]+)\s*\/\s*(.+)$/);
    if (slashMatch) {
      id = slashMatch[1].replace(/^#/, '').trim();
      title = slashMatch[2].trim();
    } else {
      // ID 없으면 제목을 ID로
      id = titleLine.replace(/[^a-zA-Z0-9가-힣\-_]/g, '-').slice(0, 40);
      title = titleLine;
    }

    // URL 추출
    let url = '';
    const urlLine = lines.find(l => l.startsWith('🔗') || l.startsWith('http'));
    if (urlLine) {
      url = urlLine.replace('🔗', '').trim();
    }

    // 카테고리별 아이템 파싱
    const todos = {};
    let currentCategory = null;

    for (const line of lines.slice(1)) {
      if (!line) continue;

      // [카테고리] 형식
      const catMatch = line.match(/^\[(.+)\]$/);
      if (catMatch) {
        currentCategory = catMatch[1];
        todos[currentCategory] = todos[currentCategory] || [];
        continue;
      }

      // - 아이템
      if (line.startsWith('-') && currentCategory) {
        const item = line.replace(/^-+\s*/, '').trim();
        if (item && !item.startsWith('http')) {
          todos[currentCategory].push(item);
        }
      }
    }

    if (title && (url || Object.keys(todos).length > 0)) {
      screens.push({ id: id || title, title, url, todos });
    }
  }

  return screens;
}
