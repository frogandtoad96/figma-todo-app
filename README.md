# 📋 Figma 수정사항 관리 앱

댓글 수집기 (figma-comment-collector.vercel.app) 와 연계해서
화면별 수정사항 + 메모를 관리하는 로컬 앱입니다.

---

## 🚀 시작하기

### 1. Node.js 설치
https://nodejs.org 에서 LTS 버전 설치

### 2. 의존성 설치 & 실행
```bash
# 이 폴더에서 터미널 열고
npm install
npm start
```
→ 브라우저에서 http://localhost:3000 자동으로 열림

---

## 🔗 댓글 수집기 연계 방법

1. **https://figma-comment-collector.vercel.app** 접속
2. Figma Token + File Key 입력 후 실행
3. 마크다운 파일 다운로드 (`.md`)
4. 이 앱에서 **📂 업로드** 버튼 클릭 또는 **드래그앤드롭**
5. 끝! 화면별로 수정사항이 자동 파싱됨

### 파일 업데이트 시
새로운 .md 파일을 다시 드래그하면 데이터가 갱신됩니다.
**메모는 별도 저장되므로 덮어쓰여지지 않습니다!**

---

## 💾 데이터 저장
- 화면 데이터: 브라우저 localStorage
- 메모: 브라우저 localStorage
- 앱을 닫아도 데이터 유지됨
# figma-todo-app
